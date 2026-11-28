import { env } from "@/core/config/env";
import {
  getSmartAccountConfigOrThrow,
  matchesRpIdForHostname,
  type ISmartAccountConfig,
} from "@/core/stellar/smart-account-config";
import { requireWalletRequestContext } from "@/core/wallet/server/request-auth";
import {
  assertSocialOrigin,
  createPasskeySession,
  createSocialChallenge,
  matchesPasskeySessionSigner,
  PASSKEY_SESSION_COOKIE,
  readPasskeySession,
  readSocialChallenge,
  sessionSecret,
  signSocialPayload,
  verifyPasskeyProof,
  type PasskeyProof,
} from "@/features/newsfeed/session-server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const SESSION_PATH = "/api/newsfeed/session";

function setPasskeyCookie(response: NextResponse, origin: string, value: string, expires: Date) {
  response.cookies.set(PASSKEY_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production" || new URL(origin).protocol === "https:",
    path: SESSION_PATH,
    expires,
  });
}

class PasskeyAuthorizationError extends Error {}

async function readActiveSigner(address: string, config: ISmartAccountConfig) {
  const [{ readDefaultContextRule }, { Keypair, rpc }] = await Promise.all([
    import("@/core/stellar/smart-account-context-rules"),
    import("@stellar/stellar-sdk"),
  ]);
  const [rule, ledger] = await Promise.all([
    readDefaultContextRule({
      contractId: address,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      sourceAccount: Keypair.random().publicKey(),
      expectedWasmHash: config.accountWasmHash,
    }),
    new rpc.Server(config.rpcUrl).getLatestLedger(),
  ]);
  if (!rule)
    throw new PasskeyAuthorizationError(
      "This account could not be verified with a single passkey.",
    );
  if (rule.valid_until !== null && rule.valid_until < ledger.sequence)
    throw new PasskeyAuthorizationError("Account signer has expired.");
  if (rule.signer.verifier !== config.webauthnVerifierAddress)
    throw new PasskeyAuthorizationError("An authorized passkey signer was not found.");
  return rule.signer.keyData;
}

function assertPasskeyCredential(keyData: Buffer, credentialId: unknown) {
  if (
    typeof credentialId !== "string" ||
    !/^[A-Za-z0-9_-]{1,1364}$/.test(credentialId) ||
    !keyData.subarray(65).equals(Buffer.from(credentialId, "base64url"))
  )
    throw new PasskeyAuthorizationError("Passkey does not belong to this account.");
}

export async function POST(request: NextRequest) {
  const started = performance.now();
  const timings: string[] = [];
  const headers = () => ({
    "Cache-Control": "no-store",
    "Server-Timing": [...timings, `handler;dur=${(performance.now() - started).toFixed(1)}`].join(
      ", ",
    ),
  });
  let isResuming = false;
  try {
    const origin = assertSocialOrigin(request);
    const input = (await request.json()) as {
      address?: string;
      action: "challenge" | "session" | "resume";
      proof?: string;
      assertion?: PasskeyProof;
      credentialId?: string;
    };
    if (!input || !["challenge", "session", "resume"].includes(input.action))
      throw new Error("Invalid session action.");
    let address: string;
    let passkeyCookie: ReturnType<typeof createPasskeySession> | undefined;
    let passkeyExpiresAt: number | undefined;

    if (
      input.action === "session" &&
      typeof input.address === "string" &&
      input.address.startsWith("G")
    ) {
      if (!env.WALLET_SESSION_SECRET || env.WALLET_SESSION_SECRET.length < 32)
        throw new Error("A strong wallet session secret is required for social sign-in.");
      address = requireWalletRequestContext(request).walletAddress;
      if (address !== input.address)
        throw new Error("The connected wallet does not match the verified session.");
    } else {
      isResuming = input.action === "resume";
      const config = getSmartAccountConfigOrThrow();
      if (!matchesRpIdForHostname(config.rpId, new URL(origin).hostname))
        throw new Error("This site does not match the configured passkey domain.");
      const domain = { origin, network: config.networkPassphrase, rpId: config.rpId };
      if (input.action === "challenge") {
        if (input.address !== undefined && typeof input.address !== "string")
          throw new Error("Invalid smart account.");
        return NextResponse.json(createSocialChallenge(input.address ?? null, domain), {
          headers: headers(),
        });
      }

      if (typeof input.address !== "string" || !/^C[A-Z2-7]{55}$/.test(input.address))
        throw new PasskeyAuthorizationError("Invalid smart account.");
      const scope = { ...domain, sub: input.address };
      if (isResuming) {
        const cookie = request.cookies.get(PASSKEY_SESSION_COOKIE)?.value;
        const session = cookie && readPasskeySession(cookie, scope);
        if (!session) throw new PasskeyAuthorizationError("Passkey verification is required.");
        const rpcStarted = performance.now();
        const keyData = await readActiveSigner(scope.sub, config).finally(() =>
          timings.push(`rpc;dur=${(performance.now() - rpcStarted).toFixed(1)}`),
        );
        assertPasskeyCredential(keyData, input.credentialId);
        if (session.exp <= Date.now() || !matchesPasskeySessionSigner(session.signer, keyData))
          throw new PasskeyAuthorizationError("Passkey verification is required.");
        passkeyExpiresAt = session.exp;
        address = scope.sub;
      } else {
        if (typeof input.proof !== "string" || !input.proof || !input.assertion)
          throw new Error("Passkey verification is required.");
        const challenge = readSocialChallenge(input.proof, scope);
        const rpcStarted = performance.now();
        const keyData = await readActiveSigner(scope.sub, config).finally(() =>
          timings.push(`rpc;dur=${(performance.now() - rpcStarted).toFixed(1)}`),
        );
        assertPasskeyCredential(keyData, input.assertion.credentialId);
        verifyPasskeyProof(
          input.assertion,
          keyData.subarray(0, 65),
          challenge.challenge,
          origin,
          config.rpId,
        );
        const [{ api }, { ConvexHttpClient }] = await Promise.all([
          import("@repo/convex-client/server"),
          import("convex/browser"),
        ]);
        const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
        const nonceStarted = performance.now();
        await convex
          .mutation(api.newsfeed.auth.consumeNonce, {
            serverSecret: sessionSecret(),
            nonce: challenge.nonce,
            expiresAt: challenge.exp,
          })
          .finally(() =>
            timings.push(`nonce;dur=${(performance.now() - nonceStarted).toFixed(1)}`),
          );
        address = scope.sub;
        passkeyCookie = createPasskeySession(scope, keyData);
      }
    }
    const expiresAt = Math.min(Date.now() + 15 * 60_000, passkeyExpiresAt ?? Infinity);
    const token = signSocialPayload({
      sub: address,
      exp: expiresAt,
      aud: "highrable-social",
      origin,
    });
    const response = NextResponse.json({ token, expiresAt }, { headers: headers() });
    if (passkeyCookie)
      setPasskeyCookie(response, origin, passkeyCookie.value, passkeyCookie.expires);
    return response;
  } catch (error) {
    if (isResuming && !(error instanceof PasskeyAuthorizationError)) {
      return NextResponse.json(
        { error: "Could not check your passkey session. Try again." },
        { status: 503, headers: headers() },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sign-in failed." },
      { status: 401, headers: headers() },
    );
  }
}

export function DELETE(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = assertSocialOrigin(request);
    const response = new NextResponse(null, { status: 204, headers });
    setPasskeyCookie(response, origin, "", new Date(0));
    return response;
  } catch {
    return new NextResponse(null, { status: 403, headers });
  }
}
