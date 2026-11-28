import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { DELETE, POST } from "@/app/api/newsfeed/session/route";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

import { createPasskeySession, PASSKEY_SESSION_COOKIE, signSocialPayload } from "./session-server";

const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  rule: vi.fn(),
  mutate: vi.fn(),
  config: {
    WALLET_SESSION_SECRET: "strong-existing-wallet-session-secret-32-chars",
    NEXT_PUBLIC_WEBAUTHN_VERIFIER_CONTRACT_ID: "CVERIFIER",
    NEXT_PUBLIC_APP_DOMAIN: "https://highrable.example",
    NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
    NEXT_PUBLIC_STELLAR_RPC_URL: "https://rpc.example",
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "test",
    NEXT_PUBLIC_SMART_ACCOUNT_WASM_HASH: "a".repeat(64),
  },
}));
vi.mock("@/core/config/env", () => ({ env: mocks.config }));
vi.mock("@/core/wallet/server/request-auth", () => ({ requireWalletRequestContext: mocks.wallet }));
vi.mock("@/core/stellar/smart-account-context-rules", () => ({
  readDefaultContextRule: mocks.rule,
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    mutation = mocks.mutate;
  },
}));
vi.mock("@stellar/stellar-sdk", () => ({
  Keypair: { random: () => ({ publicKey: () => "GSOURCE" }) },
  rpc: {
    Server: class {
      async getLatestLedger() {
        return { sequence: 123 };
      }
    },
  },
}));
const origin = "https://app.highrable.example";
function request(body: object, cookie?: string) {
  return new NextRequest(`${origin}/api/newsfeed/session`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie: `${PASSKEY_SESSION_COOKIE}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("NEWSFEED_ENABLED", "true");
  vi.stubEnv("NEWSFEED_WEB_ORIGIN", origin);
  vi.stubEnv("NEWSFEED_SESSION_SECRET", "social-test-secret-at-least-thirty-two-chars");
  mocks.wallet.mockReset();
  mocks.rule.mockReset();
  mocks.mutate.mockReset();
  mocks.config.WALLET_SESSION_SECRET = "strong-existing-wallet-session-secret-32-chars";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("refuses an address that differs from the verified external wallet", async () => {
  mocks.wallet.mockReturnValue({ walletAddress: "G" + "A".repeat(55) });
  const result = await POST(request({ address: "G" + "B".repeat(55), action: "session" }));
  expect(result.status).toBe(401);
});
it("mints a session only for the verified external subject and rejects development fallback secrets", async () => {
  const address = "G" + "A".repeat(55);
  mocks.wallet.mockReturnValue({ walletAddress: address });
  const result = await POST(request({ address, action: "session" }));
  expect(result.status).toBe(200);
  expect(result.headers.get("Server-Timing")).toMatch(/^handler;dur=/);
  const data = await result.json();
  expect(JSON.parse(Buffer.from(data.token.split(".")[0], "base64url").toString()).sub).toBe(
    address,
  );
  expect(mocks.mutate).not.toHaveBeenCalled();
  mocks.config.WALLET_SESSION_SECRET = "";
  expect((await POST(request({ address, action: "session" }))).status).toBe(401);
});
it.each(["known account", "account discovery"])(
  "binds a passkey assertion for %s to the on-chain signer and atomically consumes its challenge",
  async (mode) => {
    const address = "C" + "A".repeat(55);
    const challengeResponse = await POST(
      request(
        mode === "known account" ? { address, action: "challenge" } : { action: "challenge" },
      ),
    );
    expect(challengeResponse.status).toBe(200);
    const challenge = await challengeResponse.json();
    expect(challenge.rpId).toBe("highrable.example");
    expect(challenge.sub).toBe(mode === "known account" ? address : null);
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = pair.publicKey.export({ format: "jwk" });
    const credential = Buffer.from("credential-id");
    const publicKey = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x!, "base64url"),
      Buffer.from(jwk.y!, "base64url"),
    ]);
    const client = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        origin,
        challenge: Buffer.from(challenge.challenge).toString("base64url"),
      }),
    );
    const auth = Buffer.concat([
      createHash("sha256").update("highrable.example").digest(),
      Buffer.from([5, 0, 0, 0, 1]),
    ]);
    const assertion = {
      credentialId: credential.toString("base64url"),
      clientDataJSON: client.toString("base64url"),
      authenticatorData: auth.toString("base64url"),
      signature: sign(
        "sha256",
        Buffer.concat([auth, createHash("sha256").update(client).digest()]),
        pair.privateKey,
      ).toString("base64url"),
    };
    mocks.rule.mockResolvedValue({
      valid_until: null,
      signer: { verifier: "CVERIFIER", keyData: Buffer.concat([publicKey, credential]) },
    });
    mocks.mutate.mockResolvedValue(null);
    const result = await POST(
      request({ address, action: "session", proof: challenge.proof, assertion }),
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("Server-Timing")).toContain("rpc;dur=");
    expect(result.headers.get("Server-Timing")).toContain("nonce;dur=");
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    const cookie = result.cookies.get(PASSKEY_SESSION_COOKIE);
    if (!cookie) throw new Error("Expected the verified passkey session cookie.");
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/newsfeed/session",
    });
    const resumeBody = { address, action: "resume", credentialId: assertion.credentialId };
    const beforeExpiry = Date.now();
    const time = vi.spyOn(Date, "now").mockReturnValue(beforeExpiry + 16 * 60_000);
    const resumed = await POST(request(resumeBody, cookie.value));
    expect(resumed.status).toBe(200);
    expect(resumed.headers.get("Set-Cookie")).toBeNull();
    expect((await resumed.json()).expiresAt).toBe(Date.now() + 15 * 60_000);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(
      (await POST(request({ ...resumeBody, address: "C" + "B".repeat(55) }, cookie.value))).status,
    ).toBe(401);
    expect(
      (await POST(request({ ...resumeBody, credentialId: "c3RhbGU" }, cookie.value))).status,
    ).toBe(401);
    mocks.rule.mockResolvedValueOnce({
      valid_until: null,
      signer: { verifier: "CVERIFIER", keyData: Buffer.concat([Buffer.alloc(65, 9), credential]) },
    });
    expect((await POST(request(resumeBody, cookie.value))).status).toBe(401);
    time.mockReturnValue(beforeExpiry + 25 * 60 * 60_000);
    expect((await POST(request(resumeBody, cookie.value))).status).toBe(401);
    time.mockRestore();
    if (mode === "account discovery") {
      mocks.rule.mockResolvedValueOnce({
        valid_until: null,
        signer: {
          verifier: "CVERIFIER",
          keyData: Buffer.concat([publicKey, Buffer.from("other")]),
        },
      });
    }
    expect(
      (
        await POST(
          request({
            address: "C" + "B".repeat(55),
            action: "session",
            proof: challenge.proof,
            assertion,
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          request({
            address,
            action: "session",
            proof: challenge.proof,
            assertion: { ...assertion, credentialId: "attacker" },
          }),
        )
      ).status,
    ).toBe(401);
    mocks.mutate.mockRejectedValue(new Error("Challenge already used"));
    expect(
      (await POST(request({ address, action: "session", proof: challenge.proof, assertion })))
        .status,
    ).toBe(401);
  },
);

it("requires a valid browser cookie before checking the signer and treats RPC failure as retryable", async () => {
  const address = "C" + "A".repeat(55);
  const body = { address, action: "resume", credentialId: "YQ" };
  const scope = { sub: address, origin, network: "test", rpId: "highrable.example" };
  expect((await POST(request(body))).status).toBe(401);
  expect((await POST(request(body, "tampered.invalid"))).status).toBe(401);
  const bearer = signSocialPayload({ ...scope, aud: "highrable-social", exp: Date.now() + 60_000 });
  expect((await POST(request(body, bearer))).status).toBe(401);
  const otherNetwork = createPasskeySession({ ...scope, network: "other" }, Buffer.alloc(66, 1));
  expect((await POST(request(body, otherNetwork.value))).status).toBe(401);
  expect(mocks.rule).not.toHaveBeenCalled();
  const cookie = createPasskeySession(scope, Buffer.alloc(66, 1));
  mocks.rule.mockRejectedValue(new Error("RPC is offline"));
  expect((await POST(request(body, cookie.value))).status).toBe(503);
});

it("expires the browser cookie on same-origin sign-out", () => {
  const signOut = (requestOrigin: string) =>
    DELETE(
      new NextRequest(`${origin}/api/newsfeed/session`, {
        method: "DELETE",
        headers: { origin: requestOrigin },
      }),
    );
  expect(signOut("https://example.org").status).toBe(403);
  const response = signOut(origin);
  expect(response.status).toBe(204);
  expect(response.cookies.get(PASSKEY_SESSION_COOKIE)).toMatchObject({
    value: "",
    expires: new Date(0),
    path: "/api/newsfeed/session",
  });
});

it("rejects a challenge from a host outside the configured RP ID", async () => {
  const outside = "https://highrable.example.other.test";
  const result = await POST(
    new NextRequest(`${outside}/api/newsfeed/session`, {
      method: "POST",
      headers: { origin: outside, "content-type": "application/json" },
      body: JSON.stringify({ address: "C" + "A".repeat(55), action: "challenge" }),
    }),
  );
  expect(result.status).toBe(401);
  expect(mocks.rule).not.toHaveBeenCalled();
});
