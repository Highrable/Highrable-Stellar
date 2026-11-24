import { env } from "@/core/config/env";
import { requireWalletRequestContext } from "@/core/wallet/server/request-auth";
import {
  assertSocialOrigin,
  createSocialChallenge,
  readSocialChallenge,
  sessionSecret,
  signSocialPayload,
  verifyPasskeyProof,
  type PasskeyProof,
} from "@/features/newsfeed/session-server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const started = performance.now();
  const timings: string[] = [];
  const headers = () => ({
    "Cache-Control": "no-store",
    "Server-Timing": [...timings, `handler;dur=${(performance.now() - started).toFixed(1)}`].join(
      ", ",
    ),
  });
  try {
    const origin = assertSocialOrigin(request);
    const input = (await request.json()) as {
      address: string;
      action: "challenge" | "session";
      proof?: string;
      assertion?: PasskeyProof;
    };
    let address: string;
    if (input.address.startsWith("G")) {
      if (!env.WALLET_SESSION_SECRET || env.WALLET_SESSION_SECRET.length < 32)
        throw new Error("A strong wallet session secret is required for social sign-in.");
      address = requireWalletRequestContext(request).walletAddress;
      if (address !== input.address)
        throw new Error("The connected wallet does not match the verified session.");
    } else {
      if (input.action === "challenge")
        return NextResponse.json(createSocialChallenge(input.address), {
          headers: headers(),
        });
      if (!input.proof || !input.assertion) throw new Error("Passkey verification is required.");
      const challenge = readSocialChallenge(input.proof);
      if (challenge.sub !== input.address) throw new Error("Account mismatch.");
      const expectedWasmHash = env.NEXT_PUBLIC_SMART_ACCOUNT_WASM_HASH;
      if (!expectedWasmHash) throw new Error("Passkey account verification is unavailable.");
      const [{ readDefaultContextRule }, { Keypair, rpc }, { api }, { ConvexHttpClient }] =
        await Promise.all([
          import("@/core/stellar/smart-account-context-rules"),
          import("@stellar/stellar-sdk"),
          import("@repo/convex-client/server"),
          import("convex/browser"),
        ]);
      const rpcStarted = performance.now();
      const [rule, ledger] = await Promise.all([
        readDefaultContextRule({
          contractId: challenge.sub,
          rpcUrl: env.NEXT_PUBLIC_STELLAR_RPC_URL,
          networkPassphrase: env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
          sourceAccount: Keypair.random().publicKey(),
          expectedWasmHash,
        }),
        new rpc.Server(env.NEXT_PUBLIC_STELLAR_RPC_URL).getLatestLedger(),
      ]).finally(() => timings.push(`rpc;dur=${(performance.now() - rpcStarted).toFixed(1)}`));
      if (!rule) throw new Error("This account could not be verified with a single passkey.");
      if (rule.valid_until !== null && rule.valid_until < ledger.sequence)
        throw new Error("Account signer has expired.");
      const { verifier, keyData } = rule.signer;
      if (
        !env.NEXT_PUBLIC_WEBAUTHN_VERIFIER_CONTRACT_ID ||
        verifier !== env.NEXT_PUBLIC_WEBAUTHN_VERIFIER_CONTRACT_ID
      )
        throw new Error("An authorized passkey signer was not found.");
      if (!keyData.subarray(65).equals(Buffer.from(input.assertion.credentialId, "base64url")))
        throw new Error("Passkey does not belong to this account.");
      verifyPasskeyProof(input.assertion, keyData.subarray(0, 65), challenge.challenge, origin);
      const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
      const nonceStarted = performance.now();
      await convex
        .mutation(api.newsfeed.auth.consumeNonce, {
          serverSecret: sessionSecret(),
          nonce: challenge.nonce,
          expiresAt: challenge.exp,
        })
        .finally(() => timings.push(`nonce;dur=${(performance.now() - nonceStarted).toFixed(1)}`));
      address = challenge.sub;
    }
    const expiresAt = Date.now() + 15 * 60_000;
    const token = signSocialPayload({
      sub: address,
      exp: expiresAt,
      aud: "highrable-social",
      origin,
    });
    return NextResponse.json({ token, expiresAt }, { headers: headers() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sign-in failed." },
      { status: 401, headers: headers() },
    );
  }
}
