"use client";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { useWallet } from "@/core/wallet/hooks/use-wallet";
import { usePasskeySmartAccount } from "@/core/wallet/passkey-smart-account-context";
import { api } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { useConvex, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { FunctionReturnType } from "convex/server";

type Viewer = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.viewer>>;
type SessionValue = { token: string; viewer: Viewer | null | undefined; status: React.ReactNode };
type VerifiedSession = { token: string; expiresAt: number };
type WalletSession = VerifiedSession & { walletKey: string };

const EMPTY_SESSION: SessionValue = { token: "", viewer: null, status: null };
const Session = createContext<SessionValue>(EMPTY_SESSION);
const SharedSession = createContext<(SessionValue & { activate: () => () => void }) | null>(null);

export const useSocialSession = () => useContext(Session);

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

class SessionRequestError extends Error {
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

async function requestVerifiedSession(
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

async function verifyPasskey(address: string, credentialId: string, signal: AbortSignal) {
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
  signal.throwIfAborted();
  const credential = (await navigator.credentials.get({
    signal,
    publicKey: {
      challenge: new TextEncoder().encode(challenge.challenge),
      rpId: challenge.rpId,
      allowCredentials: [{ id: decodeCredentialId(credentialId), type: "public-key" }],
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey verification was cancelled.");
  signal.throwIfAborted();
  const assertion = credential.response as AuthenticatorAssertionResponse;
  return await requestVerifiedSession(
    {
      address,
      action: "session",
      proof: challenge.proof,
      assertion: {
        credentialId: encode(credential.rawId),
        clientDataJSON: encode(assertion.clientDataJSON),
        authenticatorData: encode(assertion.authenticatorData),
        signature: encode(assertion.signature),
      },
    },
    signal,
  );
}

function getVerificationError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Passkey verification was cancelled or timed out. Try verifying again.";
  }
  return error instanceof Error ? error.message : "Could not verify your account.";
}

// Keep one verified session above route boundaries. Only mounted scopes request a session.
export function SocialSessionProvider({ children }: { children: React.ReactNode }) {
  const identity = useHighrableWalletIdentity();
  const { authenticateWallet } = useWallet();
  const { credentialId } = usePasskeySmartAccount();
  const client = useConvex();
  const [scopeCount, setScopeCount] = useState(0);
  const activate = useCallback(() => {
    setScopeCount((count) => count + 1);
    return () => setScopeCount((count) => count - 1);
  }, []);
  const isActive = scopeCount > 0;
  const address = identity.isConnected ? identity.walletAddress : null;
  const isPasskey = identity.walletType === "passkey_smart_account";
  const walletKey = address
    ? JSON.stringify([identity.walletType, address, isPasskey ? credentialId : null])
    : null;

  const [session, setSession] = useState<WalletSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsWalletProof, setNeedsWalletProof] = useState(false);
  const [previousWalletKey, setPreviousWalletKey] = useState(walletKey);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{ key: string; promise: Promise<VerifiedSession> } | null>(null);
  const interactive = useRef<AbortController | null>(null);
  const profileSetup = useRef<{ key: string; promise: Promise<unknown> } | null>(null);
  const token = isActive && session?.walletKey === walletKey ? (session?.token ?? "") : "";
  const viewer = useQuery(api.newsfeed.queries.viewer, token ? { token } : "skip");

  if (previousWalletKey !== walletKey) {
    setPreviousWalletKey(walletKey);
    setSession(null);
    setError("");
    setBusy(false);
    setNeedsWalletProof(false);
  }

  useEffect(() => {
    return () => {
      pending.current = null;
      interactive.current?.abort();
      interactive.current = null;
    };
  }, [walletKey]);

  useEffect(() => {
    if (!token || viewer !== null) return;
    const key = `${token}:${attempt}`;
    if (profileSetup.current?.key !== key) {
      profileSetup.current = {
        key,
        promise: client.mutation(api.newsfeed.auth.ensureParticipant, { token }),
      };
    }
    let active = true;
    void profileSetup.current.promise.catch((e) => {
      if (active)
        setError(e instanceof Error ? e.message : "Could not set up your newsfeed profile.");
    });
    return () => {
      active = false;
    };
  }, [client, token, viewer, attempt]);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        pending.current = null;
        setSession(null);
      },
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (!isActive || !address || !walletKey || token || interactive.current) return;
    const key = `${walletKey}:${attempt}`;
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        promise: requestVerifiedSession(
          isPasskey ? { address, action: "resume", credentialId } : { address, action: "session" },
        ),
      };
    }
    let active = true;
    setBusy(true);
    pending.current.promise.then(
      (data) => {
        if (!active) return;
        setSession({ ...data, walletKey });
        setBusy(false);
        setNeedsWalletProof(false);
        setError("");
      },
      (failure: unknown) => {
        if (!active) return;
        setBusy(false);
        if (failure instanceof SessionRequestError && failure.status === 401) {
          setNeedsWalletProof(true);
        } else {
          setError(getVerificationError(failure));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [address, attempt, credentialId, isActive, isPasskey, token, walletKey]);

  async function verifyConnectedWallet() {
    if (!address || !walletKey || interactive.current) return;
    const controller = new AbortController();
    interactive.current = controller;
    setBusy(true);
    setError("");
    try {
      let data: VerifiedSession;
      if (isPasskey) {
        if (!credentialId) throw new Error("Reconnect your passkey account to verify it.");
        data = await verifyPasskey(address, credentialId, controller.signal);
      } else {
        await authenticateWallet();
        controller.signal.throwIfAborted();
        data = await requestVerifiedSession({ address, action: "session" }, controller.signal);
      }
      if (!controller.signal.aborted) {
        setSession({ ...data, walletKey });
        setNeedsWalletProof(false);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(getVerificationError(failure));
    } finally {
      if (interactive.current === controller) {
        interactive.current = null;
        setBusy(false);
      }
    }
  }

  const needsVerification = !token && needsWalletProof;
  const checkingSession = !token && !needsVerification && !error;
  const status = (!address ||
    busy ||
    checkingSession ||
    error ||
    needsVerification ||
    (token && viewer === null)) && (
    <aside className="hr-card-surface space-y-2 p-4 text-sm">
      {!address ? (
        <p>Connect your wallet to post, react, and comment.</p>
      ) : busy || checkingSession ? (
        <p role="status">Verifying your account…</p>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {needsVerification ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={verifyConnectedWallet}
            >
              {isPasskey ? "Verify passkey" : "Verify wallet"}
            </Button>
          ) : error ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Retry connection
            </Button>
          ) : token && viewer === null ? (
            <p role="status">Setting up your newsfeed profile…</p>
          ) : null}
        </>
      )}
    </aside>
  );
  return (
    <SharedSession.Provider value={{ activate, token, viewer, status }}>
      {children}
    </SharedSession.Provider>
  );
}

export function SocialSession({ children }: { children: React.ReactNode }) {
  const shared = useContext(SharedSession);
  const activate = shared?.activate;
  useEffect(() => activate?.(), [activate]);
  return <Session.Provider value={shared ?? EMPTY_SESSION}>{children}</Session.Provider>;
}

export function SocialSessionStatus() {
  return useSocialSession().status;
}
