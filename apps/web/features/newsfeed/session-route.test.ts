import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { POST } from "@/app/api/newsfeed/session/route";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

import { createSocialChallenge } from "./session-server";
const mocks = vi.hoisted(() => ({
  wallet: vi.fn(),
  rule: vi.fn(),
  mutate: vi.fn(),
  config: {
    WALLET_SESSION_SECRET: "strong-existing-wallet-session-secret-32-chars",
    NEXT_PUBLIC_WEBAUTHN_VERIFIER_CONTRACT_ID: "CVERIFIER",
    NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
    NEXT_PUBLIC_STELLAR_RPC_URL: "https://rpc.example",
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "test",
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
const origin = "https://highrable.example";
function request(body: object) {
  return new NextRequest(`${origin}/api/newsfeed/session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
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
afterEach(() => vi.unstubAllEnvs());
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
  const data = await result.json();
  expect(JSON.parse(Buffer.from(data.token.split(".")[0], "base64url").toString()).sub).toBe(
    address,
  );
  mocks.config.WALLET_SESSION_SECRET = "";
  expect((await POST(request({ address, action: "session" }))).status).toBe(401);
});
it("binds a valid passkey assertion to the on-chain account signer and atomically consumes its challenge", async () => {
  const address = "C" + "A".repeat(55);
  const challenge = createSocialChallenge(address);
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
    policies: [],
    signers: [{ tag: "External", values: ["CVERIFIER", Buffer.concat([publicKey, credential])] }],
  });
  mocks.mutate.mockResolvedValue(null);
  expect(
    (await POST(request({ address, action: "session", proof: challenge.proof, assertion }))).status,
  ).toBe(200);
  expect(mocks.mutate).toHaveBeenCalledTimes(2);
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
    (await POST(request({ address, action: "session", proof: challenge.proof, assertion }))).status,
  ).toBe(401);
});
