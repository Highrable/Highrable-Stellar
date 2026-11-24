import {
  createHash,
  createHmac,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  verify,
} from "node:crypto";

import type { NextRequest } from "next/server";

export function sessionSecret() {
  const secret = process.env.NEWSFEED_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Newsfeed authentication is not configured.");
  return secret;
}
export function assertSocialOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configured = process.env.NEWSFEED_WEB_ORIGIN?.trim();
  const allowed = new Set([request.nextUrl.origin]);
  if (configured) allowed.add(new URL(configured).origin);
  if (!origin || !allowed.has(origin) || request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("Please sign in from the Highrable website you are currently using.");
  return origin;
}
export function signSocialPayload(payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", sessionSecret()).update(encoded).digest("base64url")}`;
}
export function createSocialChallenge(address: string) {
  if (!/^C[A-Z2-7]{55}$/.test(address)) throw new Error("Invalid smart account.");
  const payload = {
    sub: address,
    nonce: randomUUID(),
    challenge: randomUUID(),
    exp: Date.now() + 5 * 60_000,
    aud: "highrable-social-challenge",
  };
  return { ...payload, proof: signSocialPayload(payload) };
}
export function readSocialChallenge(proof: string) {
  const [encoded, signature, extra] = proof.split(".");
  if (!encoded || !signature || extra) throw new Error("Invalid challenge.");
  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Invalid challenge.");
  const data = JSON.parse(Buffer.from(encoded, "base64url").toString()) as {
    sub: string;
    nonce: string;
    challenge: string;
    exp: number;
    aud: string;
  };
  if (data.aud !== "highrable-social-challenge" || data.exp <= Date.now())
    throw new Error("Challenge expired.");
  return data;
}
export type PasskeyProof = {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
};
export function verifyPasskeyProof(
  input: PasskeyProof,
  publicKey: Uint8Array,
  challenge: string,
  origin: string,
) {
  const clientData = Buffer.from(input.clientDataJSON, "base64url");
  const data = JSON.parse(clientData.toString());
  if (
    data.type !== "webauthn.get" ||
    data.challenge !== Buffer.from(challenge).toString("base64url") ||
    data.origin !== origin ||
    data.crossOrigin === true
  )
    throw new Error("Passkey challenge or origin mismatch.");
  const auth = Buffer.from(input.authenticatorData, "base64url");
  const rpId = new URL(origin).hostname;
  if (
    auth.length < 37 ||
    !timingSafeEqual(auth.subarray(0, 32), createHash("sha256").update(rpId).digest()) ||
    (auth[32]! & 5) !== 5
  )
    throw new Error("Passkey user verification is required.");
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("Invalid on-chain passkey.");
  const key = createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: Buffer.from(publicKey.slice(1, 33)).toString("base64url"),
      y: Buffer.from(publicKey.slice(33)).toString("base64url"),
    },
    format: "jwk",
  });
  if (
    !verify(
      "sha256",
      Buffer.concat([auth, createHash("sha256").update(clientData).digest()]),
      key,
      Buffer.from(input.signature, "base64url"),
    )
  )
    throw new Error("Invalid passkey signature.");
}
