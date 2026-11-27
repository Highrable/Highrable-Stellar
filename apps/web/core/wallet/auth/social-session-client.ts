export type VerifiedSession = { token: string; expiresAt: number };

const encode = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function decodeCredentialId(id: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("The connected passkey ID is invalid.");
  return Uint8Array.from(atob(id.replace(/-/g, "+").replace(/_/g, "/")), (byte) =>
    byte.charCodeAt(0),
  );
}

export class SessionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function sessionRequest(body: object, signal?: AbortSignal) {
  const response = await fetch("/api/newsfeed/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Invalid sign-in response.");
  if (!response.ok) {
    const message =
      "error" in data && typeof data.error === "string" ? data.error : "Sign-in failed.";
    throw new SessionRequestError(message, response.status);
  }
  return data;
}

export async function requestVerifiedSession(
  body: object,
  signal?: AbortSignal,
): Promise<VerifiedSession> {
  const data = await sessionRequest(body, signal);
  if (
    !("token" in data) ||
    typeof data.token !== "string" ||
    !data.token ||
    !("expiresAt" in data) ||
    typeof data.expiresAt !== "number" ||
    !Number.isFinite(data.expiresAt) ||
    data.expiresAt <= Date.now()
  ) {
    throw new Error("Invalid sign-in session.");
  }
  return { token: data.token, expiresAt: data.expiresAt };
}

export async function requestPasskeyChallenge(address?: string, signal?: AbortSignal) {
  const challenge = await sessionRequest({ address, action: "challenge" }, signal);
  if (
    !("challenge" in challenge) ||
    typeof challenge.challenge !== "string" ||
    !("proof" in challenge) ||
    typeof challenge.proof !== "string" ||
    !("rpId" in challenge) ||
    typeof challenge.rpId !== "string"
  ) {
    throw new Error("Invalid passkey challenge.");
  }
  return { challenge: challenge.challenge, proof: challenge.proof, rpId: challenge.rpId };
}

export async function getPasskeyAssertion(
  challenge: Awaited<ReturnType<typeof requestPasskeyChallenge>>,
  signal: AbortSignal,
  credentialId?: string,
) {
  signal.throwIfAborted();
  const credential = (await navigator.credentials.get({
    signal,
    publicKey: {
      challenge: new TextEncoder().encode(challenge.challenge),
      rpId: challenge.rpId,
      ...(credentialId
        ? { allowCredentials: [{ id: decodeCredentialId(credentialId), type: "public-key" }] }
        : {}),
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey verification was cancelled.");
  signal.throwIfAborted();
  const assertion = credential.response as AuthenticatorAssertionResponse;
  return {
    proof: challenge.proof,
    assertion: {
      credentialId: encode(credential.rawId),
      clientDataJSON: encode(assertion.clientDataJSON),
      authenticatorData: encode(assertion.authenticatorData),
      signature: encode(assertion.signature),
    },
  };
}

export function establishPasskeyWebSession(
  address: string,
  proof: Awaited<ReturnType<typeof getPasskeyAssertion>>,
  signal: AbortSignal,
): Promise<VerifiedSession> {
  signal.throwIfAborted();
  return requestVerifiedSession({ address, action: "session", ...proof }, signal);
}

export async function verifyPasskey(address: string, credentialId: string, signal: AbortSignal) {
  const challenge = await requestPasskeyChallenge(address, signal);
  const proof = await getPasskeyAssertion(challenge, signal, credentialId);
  return establishPasskeyWebSession(address, proof, signal);
}
