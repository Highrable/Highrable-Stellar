import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertSocialOrigin,
  createSocialChallenge,
  readSocialChallenge,
  verifyPasskeyProof,
} from "./session-server";
const rpId = "highrable.example";
const origin = `https://${rpId}`;
afterEach(() => vi.unstubAllEnvs());
function proof() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from(jwk.y!, "base64url"),
  ]);
  const challenge = "server-issued-random-challenge";
  const client = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: Buffer.from(challenge).toString("base64url"),
      origin,
      crossOrigin: false,
    }),
  );
  const auth = Buffer.concat([
    createHash("sha256").update("highrable.example").digest(),
    Buffer.from([5, 0, 0, 0, 1]),
  ]);
  const signature = sign(
    "sha256",
    Buffer.concat([auth, createHash("sha256").update(client).digest()]),
    pair.privateKey,
  );
  return {
    publicKey,
    challenge,
    assertion: {
      credentialId: "credential",
      clientDataJSON: client.toString("base64url"),
      authenticatorData: auth.toString("base64url"),
      signature: signature.toString("base64url"),
    },
  };
}
describe("passkey session verification", () => {
  it("accepts a verified P-256 assertion and rejects different keys, challenges and origins", () => {
    const input = proof();
    expect(() =>
      verifyPasskeyProof(input.assertion, input.publicKey, input.challenge, origin, rpId),
    ).not.toThrow();
    expect(() =>
      verifyPasskeyProof(input.assertion, proof().publicKey, input.challenge, origin, rpId),
    ).toThrow(/signature/);
    expect(() =>
      verifyPasskeyProof(input.assertion, input.publicKey, "attacker challenge", origin, rpId),
    ).toThrow(/mismatch/);
    expect(() =>
      verifyPasskeyProof(
        input.assertion,
        input.publicKey,
        input.challenge,
        "https://attacker.example",
        rpId,
      ),
    ).toThrow(/mismatch/);
  });
  it("requires user verification and valid authenticator data", () => {
    const input = proof();
    const auth = Buffer.from(input.assertion.authenticatorData, "base64url");
    auth[32] = 1;
    expect(() =>
      verifyPasskeyProof(
        { ...input.assertion, authenticatorData: auth.toString("base64url") },
        input.publicKey,
        input.challenge,
        origin,
        rpId,
      ),
    ).toThrow(/verification/);
    expect(() =>
      verifyPasskeyProof(
        { ...input.assertion, authenticatorData: "" },
        input.publicKey,
        input.challenge,
        origin,
        rpId,
      ),
    ).toThrow();
  });
  it("binds signed challenges to the account and rejects expiry and tampering", () => {
    vi.stubEnv("NEWSFEED_SESSION_SECRET", "session-test-secret-with-at-least-32-bytes");
    const challenge = createSocialChallenge("C" + "A".repeat(55));
    expect(readSocialChallenge(challenge.proof).sub).toBe(challenge.sub);
    const [payload, signature] = challenge.proof.split(".");
    const changed = Buffer.from(
      JSON.stringify({ ...challenge, sub: "C" + "B".repeat(55) }),
    ).toString("base64url");
    expect(() => readSocialChallenge(`${changed}.${signature}`)).toThrow();
    expect(() => readSocialChallenge(`${payload}.bad`)).toThrow();
    vi.spyOn(Date, "now").mockReturnValue(challenge.exp + 1);
    expect(() => readSocialChallenge(challenge.proof)).toThrow(/expired/);
    vi.restoreAllMocks();
  });
  it("accepts the current site origin and rejects cross-site requests", () => {
    vi.stubEnv("NEWSFEED_ENABLED", "true");
    vi.stubEnv("NEWSFEED_WEB_ORIGIN", origin);
    expect(() =>
      assertSocialOrigin(new NextRequest(origin, { headers: { origin } })),
    ).not.toThrow();
    expect(() =>
      assertSocialOrigin(
        new NextRequest(origin, { headers: { origin: "https://attacker.example" } }),
      ),
    ).toThrow(/Highrable website/);
    expect(() => assertSocialOrigin(new NextRequest(origin))).toThrow();
    vi.stubEnv("NEWSFEED_ENABLED", "false");
    expect(assertSocialOrigin(new NextRequest(origin, { headers: { origin } }))).toBe(origin);
  });
});

it("accepts the app's own origin without an explicit origin setting", () => {
  vi.stubEnv("NEWSFEED_ENABLED", "true");
  vi.stubEnv("NEWSFEED_WEB_ORIGIN", "");
  expect(
    assertSocialOrigin(
      new NextRequest("http://localhost:3000/api/newsfeed/session", {
        headers: { origin: "http://localhost:3000" },
      }),
    ),
  ).toBe("http://localhost:3000");
  expect(() =>
    assertSocialOrigin(
      new NextRequest("http://localhost:3000/api/newsfeed/session", {
        headers: { origin: "https://attacker.example" },
      }),
    ),
  ).toThrow();
  vi.stubEnv("NEWSFEED_WEB_ORIGIN", "https://highrable.example/");
  expect(
    assertSocialOrigin(
      new NextRequest("https://internal.example/api/newsfeed/session", { headers: { origin } }),
    ),
  ).toBe(origin);
});
