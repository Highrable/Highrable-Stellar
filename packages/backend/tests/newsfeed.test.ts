import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../convex/_generated/api";
import { matchesContent } from "../convex/newsfeed/upload";
import schema from "../convex/schema";
import { modules } from "./convexModules";

const secret = "social-test-secret-at-least-thirty-two-bytes";
const wallet = (prefix = "G", char = "A") => prefix + char.repeat(55);
async function token(address: string, expiresAt = Date.now() + 900_000, signingSecret = secret) {
  const encode = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const payload = encode(
    new TextEncoder().encode(
      JSON.stringify({
        sub: address,
        exp: expiresAt,
        aud: "highrable-social",
        origin: "https://highrable.example",
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `${payload}.${encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))))}`;
}
async function setup(prefix = "G") {
  const t = convexTest(schema, modules);
  const address = wallet(prefix);
  const authorId = await t.run((ctx) =>
    ctx.db.insert("users", {
      walletAddress: address,
      name: "Ada",
      role: "freelancer",
      walletType: prefix === "G" ? "external_wallet" : "passkey_smart_account",
      onboardingCompletedAt: Date.now(),
      createdAt: Date.now(),
    }),
  );
  const auth = await token(address);
  const postId = await t.mutation(api.newsfeed.mutations.beginPost, {
    token: auth,
    requestId: "post-1",
  });
  return { t, auth, authorId, postId };
}
async function text(
  f: Awaited<ReturnType<typeof setup>>,
  value = "Hello community",
  key = "body-1",
) {
  const bytes = new TextEncoder().encode(value);
  const mediaId = await f.t.mutation(api.newsfeed.media.begin, {
    token: f.auth,
    postId: f.postId,
    requestId: key,
    name: "post.txt",
    size: bytes.length,
    mime: "text/plain",
  });
  const storageId = await f.t.run((ctx) => ctx.storage.store(new Blob([bytes])));
  await f.t.mutation(internal.newsfeed.media.acceptChunk, {
    token: f.auth,
    mediaId,
    storageId,
    index: 0,
    size: bytes.length,
    preview: value.slice(0, 600),
  });
  return mediaId;
}
beforeEach(() => {
  vi.stubEnv("NEWSFEED_ENABLED", "true");
  vi.stubEnv("NEWSFEED_SESSION_SECRET", secret);
});

describe.each(["G", "C"])("%s verified identity", (prefix) => {
  it("rejects forged, expired and missing sessions and unauthorized ownership", async () => {
    const f = await setup(prefix);
    for (const auth of [
      "",
      await token(wallet(prefix), Date.now() - 1),
      await token(wallet(prefix), Date.now() + 900_000, "attacker-secret"),
    ]) {
      await expect(
        f.t.mutation(api.newsfeed.mutations.beginPost, { token: auth, requestId: "fake" }),
      ).rejects.toThrow();
    }
    await f.t.run((ctx) =>
      ctx.db.insert("users", {
        walletAddress: wallet(prefix, "B"),
        name: "Bob",
        role: "client",
        onboardingCompletedAt: Date.now(),
        createdAt: Date.now(),
      }),
    );
    const other = await token(wallet(prefix, "B"));
    await expect(
      f.t.mutation(api.newsfeed.mutations.deletePost, { token: other, postId: f.postId }),
    ).rejects.toThrow(/author/);
    await expect(
      f.t.mutation(api.newsfeed.media.begin, {
        token: other,
        postId: f.postId,
        requestId: "media",
        name: "x",
        mime: "image/png",
        size: 12,
      }),
    ).rejects.toThrow();
    await f.t.run((ctx) => ctx.db.patch(f.authorId, { name: " " }));
    await expect(
      f.t.mutation(api.newsfeed.mutations.beginPost, { token: f.auth, requestId: "nameless" }),
    ).resolves.toBeDefined();
  });
  it("protects profile updates without accepting a target address", async () => {
    const f = await setup(prefix);
    await f.t.mutation(api.newsfeed.mutations.saveProfile, {
      token: f.auth,
      name: "Ada Updated",
      headline: "Builder",
      about: "About",
      skills: ["Rust"],
      links: ["https://example.com"],
    });
    expect(
      (await f.t.query(api.newsfeed.queries.profile, { walletAddress: wallet(prefix) }))?.author
        .name,
    ).toBe("Ada Updated");
    await expect(
      f.t.mutation(api.newsfeed.mutations.saveProfile, {
        token: f.auth,
        name: "Ada",
        headline: "",
        about: "",
        skills: [],
        links: ["javascript:alert(1)"],
      }),
    ).rejects.toThrow();
  });
});
it("keeps publishing and concurrent interactions retry-safe", async () => {
  const f = await setup();
  const bodyId = await text(f);
  const duplicate = await f.t.mutation(api.newsfeed.mutations.beginPost, {
    token: f.auth,
    requestId: "post-1",
  });
  expect(duplicate).toBe(f.postId);
  await Promise.all(
    [1, 2].map(() =>
      f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId }),
    ),
  );
  await Promise.all(
    [1, 2, 3].map(() =>
      f.t.mutation(api.newsfeed.mutations.react, { token: f.auth, postId: f.postId, kind: "Love" }),
    ),
  );
  await Promise.all(
    [1, 2].map(() =>
      f.t.mutation(api.newsfeed.mutations.comment, {
        token: f.auth,
        postId: f.postId,
        requestId: "comment-1",
        body: "Nice work",
      }),
    ),
  );
  expect(await f.t.query(api.newsfeed.queries.post, { id: f.postId })).toMatchObject({
    reactionCount: 1,
    commentCount: 1,
  });
  await f.t.mutation(api.newsfeed.mutations.react, {
    token: f.auth,
    postId: f.postId,
    kind: "Insightful",
  });
  expect(await f.t.query(api.newsfeed.queries.post, { id: f.postId })).toMatchObject({
    reactionCount: 1,
  });
  await Promise.all(
    [1, 2].map(() =>
      f.t.mutation(api.newsfeed.mutations.react, { token: f.auth, postId: f.postId, kind: null }),
    ),
  );
  expect(await f.t.query(api.newsfeed.queries.post, { id: f.postId })).toMatchObject({
    reactionCount: 0,
  });
});
it("prevents incomplete media publication and cleans abandoned chunks", async () => {
  const f = await setup();
  const mediaId = await f.t.mutation(api.newsfeed.media.begin, {
    token: f.auth,
    postId: f.postId,
    requestId: "upload",
    name: "large.mp4",
    mime: "video/mp4",
    size: 100_000_000,
  });
  await expect(
    f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId }),
  ).rejects.toThrow(/uploads/);
  await f.t.mutation(api.newsfeed.media.remove, { token: f.auth, mediaId });
  const bodyId = await text(f);
  await f.t.run((ctx) => ctx.db.patch(bodyId, { expiresAt: 0 }));
  await f.t.mutation(internal.newsfeed.media.cleanup, {});
  expect(await f.t.run((ctx) => ctx.db.get(bodyId))).toBeNull();
  await expect(
    f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId }),
  ).rejects.toThrow();
});
it("resolves reposts to the original and retains unavailable attribution after deletion", async () => {
  const f = await setup();
  const bodyId = await text(f);
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId });
  const first = await f.t.mutation(api.newsfeed.mutations.beginPost, {
    token: f.auth,
    requestId: "repost-1",
    originalId: f.postId,
  });
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: first });
  const second = await f.t.mutation(api.newsfeed.mutations.beginPost, {
    token: f.auth,
    requestId: "repost-2",
    originalId: first,
  });
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: second });
  expect(await f.t.query(api.newsfeed.queries.post, { id: second })).toMatchObject({
    originalId: f.postId,
  });
  await f.t.mutation(api.newsfeed.mutations.deletePost, { token: f.auth, postId: f.postId });
  expect(await f.t.query(api.newsfeed.queries.post, { id: second })).toMatchObject({
    original: null,
  });
  const activity = await f.t.query(api.newsfeed.queries.feed, {
    authorId: f.authorId,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(activity.page).toHaveLength(1);
  expect(activity.isDone).toBe(false);
  expect(
    (
      await f.t.query(api.newsfeed.queries.feed, {
        authorId: f.authorId,
        paginationOpts: { cursor: activity.continueCursor, numItems: 1 },
      })
    ).page[0]?._id,
  ).not.toBe(activity.page[0]?._id);
});
it("preserves long text and de-duplicates chunks", async () => {
  const f = await setup();
  const value = "Long text 🌏\n".repeat(100000);
  const bodyId = await text(f, value);
  const storageId = await f.t.run((ctx) => ctx.storage.store(new Blob([value])));
  await f.t.mutation(internal.newsfeed.media.acceptChunk, {
    token: f.auth,
    mediaId: bodyId,
    storageId,
    index: 0,
    size: new Blob([value]).size,
    preview: value.slice(0, 600),
  });
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId });
  expect((await f.t.run((ctx) => ctx.db.get(bodyId)))?.received).toBe(new Blob([value]).size);
  const chunk = await f.t.run((ctx) =>
    ctx.db
      .query("socialChunks")
      .withIndex("by_media", (q) => q.eq("mediaId", bodyId))
      .unique(),
  );
  expect(await f.t.run(async (ctx) => (await ctx.storage.get(chunk!.storageId))!.text())).toBe(
    value,
  );
});
it("requires admin authorization for moderation and prevents duplicate reports", async () => {
  const f = await setup();
  const bodyId = await text(f);
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId });
  const report = { token: f.auth, postId: f.postId, reason: "Spam" };
  const ids = await Promise.all([
    f.t.mutation(api.newsfeed.mutations.report, report),
    f.t.mutation(api.newsfeed.mutations.report, report),
  ]);
  expect(ids[0]).toBe(ids[1]);
  await expect(
    f.t.mutation(api.newsfeed.mutations.moderate, { ...report, hidden: true }),
  ).rejects.toThrow(/Administrator/);
  vi.stubEnv("HIGHRABLE_ADMIN_WALLET_ADDRESS", wallet("G", "D"));
  const admin = await token(wallet("G", "D"));
  await f.t.mutation(api.newsfeed.mutations.moderate, { ...report, token: admin, hidden: true });
  expect(await f.t.query(api.newsfeed.queries.post, { id: f.postId })).toBeNull();
  await f.t.mutation(api.newsfeed.mutations.moderate, { ...report, token: admin, hidden: false });
  expect(await f.t.query(api.newsfeed.queries.post, { id: f.postId })).not.toBeNull();
});
it("rejects a stolen chunk reference, replayed challenges and unsupported content", async () => {
  const f = await setup();
  const bodyId = await text(f);
  await expect(
    f.t.query(api.newsfeed.queries.chunks, {
      mediaId: bodyId,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow(/unavailable/);
  const args = { serverSecret: secret, nonce: "single-use", expiresAt: Date.now() + 60_000 };
  await f.t.mutation(api.newsfeed.auth.consumeNonce, args);
  await expect(f.t.mutation(api.newsfeed.auth.consumeNonce, args)).rejects.toThrow(/used/);
  expect(matchesContent("image/png", new TextEncoder().encode("<script>bad</script>"))).toBe(false);
  expect(matchesContent("image/svg+xml", new TextEncoder().encode("<svg/>"))).toBe(false);
  vi.stubEnv("NEWSFEED_ENABLED", "false");
  await expect(
    f.t.mutation(api.newsfeed.mutations.beginPost, {
      token: f.auth,
      requestId: "enabled-for-signed-in-user",
    }),
  ).resolves.toBeDefined();
});
it("uploads through the authenticated HTTP boundary and rejects bad origin or content", async () => {
  vi.stubEnv("NEWSFEED_WEB_ORIGIN", "https://highrable.example");
  const f = await setup();
  const bytes = new TextEncoder().encode("Text uploaded over HTTP");
  const mediaId = await f.t.mutation(api.newsfeed.media.begin, {
    token: f.auth,
    postId: f.postId,
    requestId: "http-upload",
    name: "post.txt",
    mime: "text/plain",
    size: bytes.length,
  });
  const url = `/newsfeed/upload?mediaId=${mediaId}&index=0`;
  const response = await f.t.fetch(url, {
    method: "POST",
    headers: { origin: "https://highrable.example", authorization: `Bearer ${f.auth}` },
    body: bytes,
  });
  expect(response.status).toBe(200);
  expect((await f.t.run((ctx) => ctx.db.get(mediaId)))?.complete).toBe(true);
  const wrongOrigin = await f.t.fetch(url, {
    method: "POST",
    headers: { origin: "https://attacker.example", authorization: `Bearer ${f.auth}` },
    body: bytes,
  });
  expect(wrongOrigin.status).toBe(400);
  const noAuth = await f.t.fetch(url, {
    method: "POST",
    headers: { origin: "https://highrable.example" },
    body: bytes,
  });
  expect(noAuth.status).toBe(400);
  const fakeImage = await f.t.mutation(api.newsfeed.media.begin, {
    token: f.auth,
    postId: f.postId,
    requestId: "bad-image",
    name: "photo.png",
    mime: "image/png",
    size: bytes.length,
  });
  const bad = await f.t.fetch(`/newsfeed/upload?mediaId=${fakeImage}&index=0`, {
    method: "POST",
    headers: { origin: "https://highrable.example", authorization: `Bearer ${f.auth}` },
    body: bytes,
  });
  expect(bad.status).toBe(400);
  expect((await f.t.run((ctx) => ctx.db.get(fakeImage)))?.received).toBe(0);
});
it("orders by publication rather than the time a draft was started", async () => {
  const f = await setup();
  const bodyId = await text(f);
  const second = await f.t.mutation(api.newsfeed.mutations.beginPost, {
    token: f.auth,
    requestId: "newer-draft",
  });
  const secondBody = await text({ ...f, postId: second }, "Second draft", "second-body");
  await f.t.mutation(api.newsfeed.mutations.publish, {
    token: f.auth,
    postId: second,
    bodyId: secondBody,
  });
  vi.setSystemTime(Date.now() + 1_000);
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId });
  const feed = await f.t.query(api.newsfeed.queries.feed, {
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(feed.page.map((p) => p._id)).toEqual([f.postId, second]);
});

it("allows any signed-in wallet without onboarding, a role, or a completed name", async () => {
  const t = convexTest(schema, modules);
  const auth = await token(wallet("C", "E"));
  const user = await t.mutation(api.newsfeed.auth.ensureParticipant, { token: auth });
  expect(await t.mutation(api.newsfeed.auth.ensureParticipant, { token: auth })).toBe(user);
  expect(
    await t.mutation(api.newsfeed.mutations.beginPost, { token: auth, requestId: "new-member" }),
  ).toBeDefined();
  await t.run((ctx) => ctx.db.patch(user, { role: "admin" }));
  expect(
    await t.mutation(api.newsfeed.mutations.beginPost, { token: auth, requestId: "admin-member" }),
  ).toBeDefined();
  await expect(
    t.mutation(api.newsfeed.auth.ensureParticipant, { token: "forged" }),
  ).rejects.toThrow();
});
