"use client";
import {
  requestVerifiedSession,
  SessionRequestError,
  verifyPasskey,
  type VerifiedSession,
} from "@/core/wallet/auth/social-session-client";
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
type WalletSession = VerifiedSession & { walletKey: string };

const EMPTY_SESSION: SessionValue = { token: "", viewer: null, status: null };
const Session = createContext<SessionValue>(EMPTY_SESSION);
const SharedSession = createContext<(SessionValue & { activate: () => () => void }) | null>(null);

export const useSocialSession = () => useContext(Session);

function getVerificationError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Passkey verification was cancelled or timed out. Try verifying again.";
  }
  return error instanceof Error ? error.message : "Could not verify your account.";
}

// Keep one verified session above route boundaries. Only mounted scopes request a session.
export function SocialSessionProvider({ children }: { children: React.ReactNode }) {
  const identity = useHighrableWalletIdentity();
  const { authenticateWallet, authSession } = useWallet();
  const { credentialId, webSessionRevision } = usePasskeySmartAccount();
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

  const sessionRevision = isPasskey ? webSessionRevision : authSession?.expiresAt;
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
    const key = JSON.stringify([walletKey, sessionRevision, attempt]);
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
  }, [address, attempt, credentialId, isActive, isPasskey, sessionRevision, token, walletKey]);

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
        await authenticateWallet({ force: true });
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
