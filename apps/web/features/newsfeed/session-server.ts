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

function readSignedSocialPayload(token: string): unknown {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return JSON.parse(Buffer.from(encoded, "base64url").toString());
}

export const PASSKEY_SESSION_COOKIE = "highrable_passkey_social_session";
const PASSKEY_SESSION_TTL_MS = 24 * 60 * 60_000;
const PASSKEY_SESSION_AUDIENCE = "highrable-passkey-social-session";

type PasskeySessionScope = { sub: string; origin: string; network: string; rpId: string };

export function createPasskeySession(scope: PasskeySessionScope, keyData: Uint8Array) {
  const exp = Date.now() + PASSKEY_SESSION_TTL_MS;
  const signer = createHash("sha256").update(keyData).digest("hex");
  return {
    value: signSocialPayload({ ...scope, aud: PASSKEY_SESSION_AUDIENCE, exp, signer }),
    expires: new Date(exp),
  };
}

export function readPasskeySession(token: string, scope: PasskeySessionScope) {
  const claims = readSignedSocialPayload(token);
  if (!claims || typeof claims !== "object") return null;
  const { aud, sub, origin, network, rpId, exp, signer } = claims as Record<string, unknown>;
  if (
    aud !== PASSKEY_SESSION_AUDIENCE ||
    sub !== scope.sub ||
    origin !== scope.origin ||
    network !== scope.network ||
    rpId !== scope.rpId ||
    typeof exp !== "number" ||
    !Number.isFinite(exp) ||
    exp <= Date.now() ||
    typeof signer !== "string"
  )
    return null;
  return { exp, signer };
}

export function matchesPasskeySessionSigner(signer: string, keyData: Uint8Array): boolean {
  return signer === createHash("sha256").update(keyData).digest("hex");
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
  const data = readSignedSocialPayload(proof) as {
    sub: string;
    nonce: string;
    challenge: string;
    exp: number;
    aud: string;
  } | null;
  if (!data) throw new Error("Invalid challenge.");
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
  rpId: string,
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
