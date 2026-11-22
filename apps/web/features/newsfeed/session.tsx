"use client";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { useWallet } from "@/core/wallet/hooks/use-wallet";
import { api } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { useConvex, useQuery } from "convex/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import type { FunctionReturnType } from "convex/server";

type Viewer = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.viewer>>;

const Session = createContext<{ token: string; viewer: Viewer | null | undefined }>({
  token: "",
  viewer: null,
});
export const useSocialSession = () => useContext(Session);
const encode = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
async function sessionRequest(body: object) {
  const response = await fetch("/api/newsfeed/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Sign-in failed.");
  return data;
}
export function SocialSession({ children }: { children: React.ReactNode }) {
  const identity = useHighrableWalletIdentity();
  const { authenticateWallet } = useWallet();
  const client = useConvex();
  const authenticate = useRef(authenticateWallet);
  useEffect(() => {
    authenticate.current = authenticateWallet;
  }, [authenticateWallet]);
  const [session, setSession] = useState<{
    token: string;
    address: string;
    expiresAt: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{
    key: string;
    promise: Promise<{ token: string; expiresAt: number; address: string }>;
  } | null>(null);
  const profileSetup = useRef<{ key: string; promise: Promise<unknown> } | null>(null);
  const token =
    identity.isConnected && session?.address === identity.walletAddress ? session.token : "";
  const viewer = useQuery(api.newsfeed.queries.viewer, token ? { token } : "skip");
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
    const address = identity.walletAddress;
    if (!identity.isConnected || !address) {
      pending.current = null;
      setSession(null);
      setError("");
      setBusy(false);
      return;
    }
    if (token) return;
    let active = true;
    setSession(null);
    setError("");
    setBusy(true);
    const key = `${identity.walletType}:${address}:${attempt}`;
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        promise: (async () => {
          let data;
          if (identity.walletType === "external_wallet") {
            try {
              data = await sessionRequest({ address, action: "session" });
            } catch {
              await authenticate.current();
              data = await sessionRequest({ address, action: "session" });
            }
          } else {
            const challenge = await sessionRequest({ address, action: "challenge" });
            const credential = (await navigator.credentials.get({
              publicKey: {
                challenge: new TextEncoder().encode(challenge.challenge),
                rpId: location.hostname,
                userVerification: "required",
                timeout: 60_000,
              },
            })) as PublicKeyCredential | null;
            if (!credential) throw new Error("Passkey sign-in was cancelled.");
            const assertion = credential.response as AuthenticatorAssertionResponse;
            data = await sessionRequest({
              address,
              action: "session",
              proof: challenge.proof,
              assertion: {
                credentialId: encode(credential.rawId),
                clientDataJSON: encode(assertion.clientDataJSON),
                authenticatorData: encode(assertion.authenticatorData),
                signature: encode(assertion.signature),
              },
            });
          }
          return { ...data, address };
        })(),
      };
    }
    pending.current.promise.then(
      (data) => {
        if (active) {
          setSession(data);
          setBusy(false);
        }
      },
      (e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Could not connect to the newsfeed.");
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [identity.isConnected, identity.walletAddress, identity.walletType, attempt, token]);
  return (
    <Session.Provider value={{ token, viewer }}>
      {(!identity.isConnected || busy || error || viewer === null) && (
        <aside className="hr-card-surface space-y-2 p-4 text-sm">
          {!identity.isConnected ? (
            <p>Connect your wallet to post, react, and comment.</p>
          ) : busy ? (
            <p role="status">Connecting to the newsfeed…</p>
          ) : error ? (
            <>
              <p role="alert">{error}</p>
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
            </>
          ) : viewer === null ? (
            <p role="status">Setting up your newsfeed profile…</p>
          ) : null}
        </aside>
      )}
      {children}
    </Session.Provider>
  );
}
