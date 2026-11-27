import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

import schema from "../../convex/schema";
import { modules } from "../convexModules";

const FIRST_WALLET = `G${"B".repeat(55)}`;
const SECOND_WALLET = `G${"C".repeat(55)}`;
const SESSION_SECRET = "private-email-tests-use-a-long-session-secret";

type TSaveEmailArgs = {
  sessionToken: string;
  walletAddress?: string;
  email: string;
};
type TGetEmailArgs = { sessionToken: string; walletAddress?: string };

const savePrivateEmailRef = makeFunctionReference<"mutation", TSaveEmailArgs, Id<"privateEmails">>(
  "users/mutations:savePrivateEmail",
);
const getPrivateEmailRef = makeFunctionReference<"query", TGetEmailArgs, string | null>(
  "users/queries:getPrivateEmail",
);
const getUserByWalletRef = makeFunctionReference<
  "query",
  { walletAddress: string },
  Record<string, unknown> | null
>("users/queries:getUserByWallet");

function encode(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createSessionToken(walletAddress: string, expiresAt = Date.now() + 60_000) {
  const payload = encode(
    new TextEncoder().encode(
      JSON.stringify({ sub: walletAddress, exp: expiresAt, aud: "highrable-social" }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  return `${payload}.${encode(signature)}`;
}

describe("private account email", () => {
  beforeEach(() => {
    process.env.NEWSFEED_SESSION_SECRET = SESSION_SECRET;
  });

  it("validates email and derives its owner from a live verified session", async () => {
    const t = convexTest(schema, modules);
    const token = await createSessionToken(FIRST_WALLET);

    await expect(
      t.mutation(savePrivateEmailRef, { sessionToken: "", email: "ada@example.com" }),
    ).rejects.toThrow("Sign in with your verified Highrable session");
    await expect(
      t.mutation(savePrivateEmailRef, {
        sessionToken: token,
        email: "not-an-email",
      }),
    ).rejects.toThrow("valid email address");
    await expect(
      t.mutation(savePrivateEmailRef, {
        sessionToken: token,
        walletAddress: SECOND_WALLET,
        email: "ada@example.com",
      }),
    ).rejects.toThrow("does not match this wallet");

    const emailId = await t.mutation(savePrivateEmailRef, {
      sessionToken: token,
      walletAddress: FIRST_WALLET,
      email: "  Ada@Example.com  ",
    });
    const emailRecord = await t.run((ctx) => ctx.db.get(emailId));
    expect(emailRecord).toMatchObject({
      walletAddress: FIRST_WALLET,
      email: "ada@example.com",
    });
  });

  it("rejects expired sessions and only returns the session owner's email", async () => {
    const t = convexTest(schema, modules);
    const firstToken = await createSessionToken(FIRST_WALLET);
    const expiredToken = await createSessionToken(FIRST_WALLET, Date.now() - 1);
    const secondToken = await createSessionToken(SECOND_WALLET);

    await expect(
      t.mutation(savePrivateEmailRef, {
        sessionToken: expiredToken,
        email: "ada@example.com",
      }),
    ).rejects.toThrow("session expired");

    await t.mutation(savePrivateEmailRef, { sessionToken: firstToken, email: "ada@example.com" });
    await t.mutation(savePrivateEmailRef, {
      sessionToken: secondToken,
      email: "grace@example.com",
    });
    await t.run((ctx) =>
      ctx.db.insert("users", {
        walletAddress: FIRST_WALLET,
        createdAt: Date.now(),
      }),
    );

    await expect(t.query(getPrivateEmailRef, { sessionToken: firstToken })).resolves.toBe(
      "ada@example.com",
    );
    await expect(t.query(getPrivateEmailRef, { sessionToken: secondToken })).resolves.toBe(
      "grace@example.com",
    );
    await expect(
      t.query(getPrivateEmailRef, {
        sessionToken: secondToken,
        walletAddress: FIRST_WALLET,
      }),
    ).rejects.toThrow("does not match this wallet");

    const publicUser = await t.query(getUserByWalletRef, { walletAddress: FIRST_WALLET });
    expect(publicUser).not.toHaveProperty("email");
  });
});
