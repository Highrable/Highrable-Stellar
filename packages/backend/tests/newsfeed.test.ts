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
function profileArgs<T extends Record<string, unknown>>(session: string, overrides: T = {} as T) {
  return {
    token: session,
    name: "Ada Professional",
    headline: "Product engineer",
    about: "I build accessible products.",
    workplace: "Independent",
    skills: ["TypeScript", "Design systems"],
    links: ["https://example.com"],
    workHistory: [],
    certificates: [],
    portfolio: [],
    ...overrides,
  };
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
      ...profileArgs(f.auth, {
        name: "Ada Updated",
        headline: "Builder",
        about: "About",
        skills: ["Rust"],
      }),
    });
    const publicProfile = await f.t.query(api.newsfeed.queries.profile, {
      walletAddress: wallet(prefix),
    });
    expect(publicProfile?.author.name).toBe("Ada Updated");
    expect(publicProfile?.details).toMatchObject({
      name: "Ada Updated",
      workplace: "Independent",
      skills: ["Rust"],
    });
    expect(publicProfile).not.toHaveProperty("author.walletAddress");
    const byId = await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId });
    expect(byId).toMatchObject({ id: f.authorId, details: { name: "Ada Updated" } });
    expect(byId).not.toHaveProperty("walletAddress");
    expect(byId?.author).not.toHaveProperty("walletAddress");
    const results = await f.t.query(api.newsfeed.queries.searchPeople, { term: "Ada" });
    expect(results).toContainEqual({
      id: f.authorId,
      name: "Ada Updated",
      headline: "Builder",
      avatarUrl: null,
    });
    expect(results[0]).not.toHaveProperty("walletAddress");
    await expect(f.t.query(api.newsfeed.queries.searchPeople, { term: "A" })).resolves.toEqual([]);
    await expect(
      f.t.mutation(api.newsfeed.mutations.saveProfile, profileArgs("")),
    ).rejects.toThrow();
    await expect(
      f.t.mutation(api.newsfeed.mutations.saveProfile, {
        ...profileArgs(f.auth, { links: ["javascript:alert(1)"] }),
      }),
    ).rejects.toThrow();
    await expect(
      f.t.mutation(
        api.newsfeed.mutations.saveProfile,
        profileArgs(f.auth, {
          workHistory: [
            { title: "Engineer", company: "Studio", startDate: "bad-date", description: "" },
          ],
        }),
      ),
    ).rejects.toThrow(/dates/);
    const otherAddress = wallet(prefix, "B");
    const otherId = await f.t.run((ctx) =>
      ctx.db.insert("users", {
        walletAddress: otherAddress,
        name: "Morgan",
        role: "client",
        createdAt: Date.now(),
      }),
    );
    const otherToken = await token(otherAddress);
    await f.t.mutation(
      api.newsfeed.mutations.saveProfile,
      profileArgs(otherToken, { name: "Morgan Studio" }),
    );
    expect(
      (await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId }))?.details.name,
    ).toBe("Ada Updated");
    expect(
      (await f.t.query(api.newsfeed.queries.profileById, { profileId: otherId }))?.details.name,
    ).toBe("Morgan Studio");
    await f.t.mutation(api.newsfeed.mutations.deleteProfile, { token: otherToken });
    expect(
      (await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId }))?.details.name,
    ).toBe("Ada Updated");
    await f.t.mutation(api.newsfeed.mutations.deleteProfile, { token: f.auth });
    expect(
      (await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId }))?.details
        .headline,
    ).toBe("");
  });
});
it("stores profile images through authenticated server-owned references", async () => {
  const f = await setup();
  const otherAddress = wallet("G", "B");
  const otherId = await f.t.run((ctx) =>
    ctx.db.insert("users", {
      walletAddress: otherAddress,
      name: "Morgan",
      createdAt: Date.now(),
    }),
  );
  const otherToken = await token(otherAddress);
  const firstStorageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob(["avatar bytes"], { type: "image/webp" })),
  );
  await f.t.mutation(internal.newsfeed.media.saveProfileImage, {
    token: f.auth,
    purpose: "avatar",
    storageId: firstStorageId,
  });
  const firstUrl = (await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId }))
    ?.details.avatarUrl;
  expect(firstUrl).toBeTruthy();
  const secondStorageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob(["other avatar"], { type: "image/webp" })),
  );
  await f.t.mutation(internal.newsfeed.media.saveProfileImage, {
    token: otherToken,
    purpose: "avatar",
    storageId: secondStorageId,
  });
  expect(
    (await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId }))?.details
      .avatarUrl,
  ).toBe(firstUrl);
  expect(
    (await f.t.query(api.newsfeed.queries.profileById, { profileId: otherId }))?.details.avatarUrl,
  ).toBeTruthy();
  const replacementId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob(["updated avatar"], { type: "image/webp" })),
  );
  await f.t.mutation(internal.newsfeed.media.saveProfileImage, {
    token: f.auth,
    purpose: "avatar",
    storageId: replacementId,
  });
  expect(
    (await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId }))?.details
      .avatarUrl,
  ).not.toBe(firstUrl);
  expect(await f.t.run((ctx) => ctx.storage.get(firstStorageId))).toBeNull();
});
it("authenticates profile image uploads by origin and content and never accepts caller storage ids", async () => {
  vi.stubEnv("NEWSFEED_WEB_ORIGIN", "https://highrable.example");
  const f = await setup();
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const response = await f.t.fetch("/newsfeed/profile-image?purpose=avatar", {
    method: "POST",
    headers: {
      origin: "https://highrable.example",
      authorization: `Bearer ${f.auth}`,
      "content-type": "image/png",
    },
    body: png,
  });
  expect(response.status).toBe(200);
  const profile = await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId });
  expect(profile?.details.avatarUrl).toBeTruthy();
  expect(profile?.details).not.toHaveProperty("avatarStorageId");
  const invalidContent = await f.t.fetch("/newsfeed/profile-image?purpose=cover", {
    method: "POST",
    headers: {
      origin: "https://highrable.example",
      authorization: `Bearer ${f.auth}`,
      "content-type": "image/png",
    },
    body: new TextEncoder().encode("<svg/>"),
  });
  expect(invalidContent.status).toBe(400);
  const invalidOrigin = await f.t.fetch("/newsfeed/profile-image?purpose=cover", {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      authorization: `Bearer ${f.auth}`,
      "content-type": "image/png",
    },
    body: png,
  });
  expect(invalidOrigin.status).toBe(400);
  const invalidSession = await f.t.fetch("/newsfeed/profile-image?purpose=cover", {
    method: "POST",
    headers: { origin: "https://highrable.example", "content-type": "image/png" },
    body: png,
  });
  expect(invalidSession.status).toBe(400);
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
it("supports paginated top-level comments, one-level replies and comment reactions", async () => {
  const f = await setup();
  const bodyId = await text(f);
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId });
  const rootId = await f.t.mutation(api.newsfeed.mutations.comment, {
    token: f.auth,
    postId: f.postId,
    requestId: "root-comment-1",
    body: "A first comment",
  });
  const latestRootId = await f.t.mutation(api.newsfeed.mutations.comment, {
    token: f.auth,
    postId: f.postId,
    requestId: "root-comment-2",
    body: "A second comment",
  });
  const replyId = await f.t.mutation(api.newsfeed.mutations.comment, {
    token: f.auth,
    postId: f.postId,
    parentId: latestRootId,
    requestId: "reply-1",
    body: "A useful reply",
  });
  const firstPage = await f.t.query(api.newsfeed.queries.comments, {
    postId: f.postId,
    token: f.auth,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(firstPage.page).toMatchObject([{ _id: latestRootId, replyCount: 1 }]);
  expect(firstPage.isDone).toBe(false);
  const secondPage = await f.t.query(api.newsfeed.queries.comments, {
    postId: f.postId,
    token: f.auth,
    paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
  });
  expect(secondPage.page.map((item) => item._id)).toContain(rootId);
  const otherAddress = wallet("G", "B");
  await f.t.run((ctx) =>
    ctx.db.insert("users", {
      walletAddress: otherAddress,
      name: "Rae",
      createdAt: Date.now(),
    }),
  );
  const otherToken = await token(otherAddress);
  await f.t.mutation(api.newsfeed.mutations.reactToComment, {
    token: otherToken,
    commentId: replyId,
    kind: "Love",
  });
  await f.t.mutation(api.newsfeed.mutations.reactToComment, {
    token: otherToken,
    commentId: replyId,
    kind: "Celebrate",
  });
  const replyPage = await f.t.query(api.newsfeed.queries.replies, {
    commentId: latestRootId,
    token: otherToken,
    paginationOpts: { cursor: null, numItems: 5 },
  });
  expect(replyPage.page).toMatchObject([
    { _id: replyId, reactionCount: 1, viewerReaction: "Celebrate" },
  ]);
  await f.t.mutation(api.newsfeed.mutations.reactToComment, {
    token: otherToken,
    commentId: replyId,
    kind: null,
  });
  expect(
    (
      await f.t.query(api.newsfeed.queries.replies, {
        commentId: latestRootId,
        paginationOpts: { cursor: null, numItems: 5 },
      })
    ).page[0]?.reactionCount,
  ).toBe(0);
  await expect(
    f.t.mutation(api.newsfeed.mutations.comment, {
      token: f.auth,
      postId: f.postId,
      parentId: replyId,
      requestId: "nested-reply",
      body: "No deeper nesting",
    }),
  ).rejects.toThrow(/top-level/);
  await expect(
    f.t.mutation(api.newsfeed.mutations.reactToComment, {
      token: "",
      commentId: replyId,
      kind: "Like",
    }),
  ).rejects.toThrow();
  const report = { token: otherToken, commentId: replyId, reason: "Spam" };
  expect(await f.t.mutation(api.newsfeed.mutations.report, report)).toBe(
    await f.t.mutation(api.newsfeed.mutations.report, report),
  );
  await f.t.run(async (ctx) => {
    await ctx.db.patch(replyId, { status: "hidden" });
    await ctx.db.patch(f.postId, { commentCount: 2 });
  });
  await f.t.mutation(api.newsfeed.mutations.editComment, {
    token: f.auth,
    commentId: latestRootId,
    deleted: true,
  });
  expect(await f.t.query(api.newsfeed.queries.post, { id: f.postId })).toMatchObject({
    commentCount: 1,
  });
  expect((await f.t.run((ctx) => ctx.db.get(replyId)))?.status).toBe("deleted");
  expect(
    (
      await f.t.query(api.newsfeed.queries.replies, {
        commentId: latestRootId,
        paginationOpts: { cursor: null, numItems: 5 },
      })
    ).page,
  ).toEqual([]);
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

it("includes the viewer reaction and first media page in each card", async () => {
  const f = await setup();
  const bodyId = await text(f);
  await f.t.mutation(api.newsfeed.mutations.publish, { token: f.auth, postId: f.postId, bodyId });
  await f.t.mutation(api.newsfeed.mutations.react, {
    token: f.auth,
    postId: f.postId,
    kind: "Love",
  });
  await f.t.run(async (ctx) => {
    for (let index = 0; index < 6; index++) {
      await ctx.db.insert("socialMedia", {
        authorId: f.authorId,
        postId: f.postId,
        requestId: `image-${index}`,
        name: `image-${index}.png`,
        mime: "image/png",
        size: 100,
        received: 100,
        complete: true,
        removed: false,
        expiresAt: Date.now() + 60_000,
      });
    }
    await ctx.db.patch(f.postId, { mediaCount: 6 });
  });
  const publicPost = await f.t.query(api.newsfeed.queries.post, { id: f.postId });
  expect(publicPost?.viewerReaction).toBeNull();
  expect(publicPost?.media).toHaveLength(4);
  const feed = await f.t.query(api.newsfeed.queries.feed, {
    token: f.auth,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(feed.page[0]?.viewerReaction).toBe("Love");
  const first = await f.t.query(api.newsfeed.queries.media, {
    postId: f.postId,
    paginationOpts: { cursor: null, numItems: 4 },
  });
  const remaining = await f.t.query(api.newsfeed.queries.media, {
    postId: f.postId,
    paginationOpts: { cursor: first.continueCursor, numItems: 12 },
  });
  expect(remaining.page).toHaveLength(2);
  expect(remaining.page.every((media) => media.mime === "image/png")).toBe(true);
});

it("resolves the signed-in profile avatar for the create-story card", async () => {
  const f = await setup();
  const avatarStorageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob(["avatar"], { type: "image/jpeg" })),
  );
  await f.t.run((ctx) => ctx.db.patch(f.authorId, { avatarStorageId }));

  const viewer = await f.t.query(api.newsfeed.queries.viewer, { token: f.auth });
  expect(viewer?.avatarUrl).toBeTruthy();
});

it("publishes public stories with author groups, media, reactions, and author-only deletion", async () => {
  const f = await setup();
  const storyId = await f.t.mutation(api.newsfeed.mutations.beginStory, {
    token: f.auth,
    requestId: "story-1",
  });
  const mediaId = await f.t.mutation(api.newsfeed.media.begin, {
    token: f.auth,
    storyId,
    requestId: "story-image-1",
    name: "story.png",
    mime: "image/png",
    size: 8,
    preview: "data:image/jpeg;base64,dGh1bWI=",
  });
  const storageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])])),
  );
  await f.t.mutation(internal.newsfeed.media.acceptChunk, {
    token: f.auth,
    mediaId,
    storageId,
    index: 0,
    size: 8,
  });
  await f.t.mutation(api.newsfeed.mutations.publishStory, { token: f.auth, storyId });

  const stories = await f.t.query(api.newsfeed.queries.activeStories, {});
  expect(stories).toHaveLength(1);
  expect(stories[0]).toMatchObject({
    author: { name: "Ada" },
    stories: [
      {
        _id: storyId,
        mediaCount: 1,
        media: [{ _id: mediaId, mime: "image/png" }],
      },
    ],
  });
  expect(await f.t.query(api.newsfeed.queries.storyPreview, { mediaId })).toBe(
    "data:image/jpeg;base64,dGh1bWI=",
  );
  const mediaPage = await f.t.query(api.newsfeed.queries.storyMedia, {
    storyId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(mediaPage.page.map((item) => item._id)).toEqual([mediaId]);
  const chunks = await f.t.query(api.newsfeed.queries.chunks, {
    mediaId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(chunks.page[0]?.url).toBeTruthy();

  await f.t.mutation(api.newsfeed.mutations.reactToStory, { token: f.auth, storyId, kind: "Love" });
  await f.t.mutation(api.newsfeed.mutations.reactToStory, {
    token: f.auth,
    storyId,
    kind: "Funny",
  });
  expect(
    (await f.t.query(api.newsfeed.queries.activeStories, { token: f.auth }))[0]?.stories[0],
  ).toMatchObject({
    reactionCount: 1,
    reactionCounts: { Love: 0, Funny: 1 },
    viewerReaction: "Funny",
  });
  await f.t.mutation(api.newsfeed.mutations.reactToStory, { token: f.auth, storyId, kind: null });
  expect(
    (await f.t.query(api.newsfeed.queries.activeStories, {}))[0]?.stories[0]?.reactionCount,
  ).toBe(0);

  const otherAddress = wallet("G", "B");
  await f.t.run((ctx) =>
    ctx.db.insert("users", {
      walletAddress: otherAddress,
      name: "Bob",
      role: "client",
      onboardingCompletedAt: Date.now(),
      createdAt: Date.now(),
    }),
  );
  const otherToken = await token(otherAddress);
  await expect(
    f.t.mutation(api.newsfeed.mutations.deleteStory, { token: otherToken, storyId }),
  ).rejects.toThrow(/author/);
  await f.t.mutation(api.newsfeed.mutations.deleteStory, { token: f.auth, storyId });
  expect(await f.t.query(api.newsfeed.queries.activeStories, {})).toEqual([]);
  await expect(
    f.t.query(api.newsfeed.queries.chunks, {
      mediaId,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow(/unavailable/);
  await f.t.mutation(internal.newsfeed.media.cleanup, {});
  expect(await f.t.run((ctx) => ctx.db.get(mediaId))).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.get(storyId))).toBeNull();
});

it("expires stories at 24 hours and denies reactions and media reads after expiry", async () => {
  const f = await setup();
  const storyId = await f.t.mutation(api.newsfeed.mutations.beginStory, {
    token: f.auth,
    requestId: "story-expiry",
  });
  const mediaId = await f.t.mutation(api.newsfeed.media.begin, {
    token: f.auth,
    storyId,
    requestId: "story-expiry-media",
    name: "story.png",
    mime: "image/png",
    size: 8,
  });
  const storageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])])),
  );
  await f.t.mutation(internal.newsfeed.media.acceptChunk, {
    token: f.auth,
    mediaId,
    storageId,
    index: 0,
    size: 8,
  });
  await f.t.mutation(api.newsfeed.mutations.publishStory, { token: f.auth, storyId });
  vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1);
  expect(await f.t.query(api.newsfeed.queries.activeStories, {})).toEqual([]);
  expect(await f.t.query(api.newsfeed.queries.storyPreview, { mediaId })).toBeNull();
  expect(
    (
      await f.t.query(api.newsfeed.queries.storyMedia, {
        storyId,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toEqual([]);
  const renewed = await token(wallet());
  await expect(
    f.t.mutation(api.newsfeed.mutations.reactToStory, { token: renewed, storyId, kind: "Like" }),
  ).rejects.toThrow(/unavailable/);
  await expect(
    f.t.query(api.newsfeed.queries.chunks, {
      mediaId,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow(/unavailable/);
  await f.t.mutation(internal.newsfeed.media.cleanup, {});
  expect(await f.t.run((ctx) => ctx.db.get(mediaId))).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.get(storyId))).toBeNull();
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

it("creates authenticated one-way follows and uses them for the network feed", async () => {
  const f = await setup();
  const otherWallet = wallet("G", "B");
  const otherId = await f.t.run((ctx) =>
    ctx.db.insert("users", {
      walletAddress: otherWallet,
      name: "Bea",
      role: "freelancer",
      createdAt: Date.now(),
    }),
  );
  const otherPostId = await f.t.run((ctx) =>
    ctx.db.insert("socialPosts", {
      authorId: otherId,
      requestId: "beas-post",
      status: "published",
      reactionCount: 0,
      commentCount: 0,
      mediaCount: 0,
      pendingMedia: 0,
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const followId = await f.t.mutation(api.newsfeed.mutations.follow, {
    token: f.auth,
    userId: otherId,
  });
  expect(
    await f.t.mutation(api.newsfeed.mutations.follow, { token: f.auth, userId: otherId }),
  ).toBe(followId);
  await expect(
    f.t.mutation(api.newsfeed.mutations.follow, { token: f.auth, userId: f.authorId }),
  ).rejects.toThrow(/yourself/);
  await expect(
    f.t.mutation(api.newsfeed.mutations.follow, { token: "forged", userId: otherId }),
  ).rejects.toThrow();
  expect(
    await f.t.query(api.newsfeed.queries.followState, { token: f.auth, userId: otherId }),
  ).toEqual({ authenticated: true, following: true });
  const followingPage = await f.t.query(api.newsfeed.queries.feed, {
    token: f.auth,
    followingOnly: true,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(followingPage.page.map((post) => post._id)).toContain(otherPostId);
  await f.t.mutation(api.newsfeed.mutations.unfollow, { token: f.auth, userId: otherId });
  await f.t.mutation(api.newsfeed.mutations.unfollow, { token: f.auth, userId: otherId });
  expect(
    await f.t.query(api.newsfeed.queries.followState, { token: f.auth, userId: otherId }),
  ).toEqual({ authenticated: true, following: false });
  expect(
    (
      await f.t.query(api.newsfeed.queries.feed, {
        token: f.auth,
        followingOnly: true,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toEqual([]);
});

it("stores editable public availability and validates its size", async () => {
  const f = await setup();
  await f.t.mutation(
    api.newsfeed.mutations.saveProfile,
    profileArgs(f.auth, { availability: "Available for 20 hours/week" }),
  );
  const profile = await f.t.query(api.newsfeed.queries.profileById, { profileId: f.authorId });
  expect(profile?.details.availability).toBe("Available for 20 hours/week");
  await expect(
    f.t.mutation(
      api.newsfeed.mutations.saveProfile,
      profileArgs(f.auth, { availability: "a".repeat(121) }),
    ),
  ).rejects.toThrow(/Too many profile entries/);
});

it("normalizes post tags, searches published content, and excludes hidden posts", async () => {
  const f = await setup();
  const bodyId = await text(f, "A Figma token update");
  await f.t.mutation(api.newsfeed.mutations.publish, {
    token: f.auth,
    postId: f.postId,
    bodyId,
    tags: ["#Figma", "DesignSystems", "figma"],
  });
  const publicPost = await f.t.query(api.newsfeed.queries.post, { id: f.postId });
  expect(publicPost?.tags).toEqual(["Figma", "DesignSystems"]);
  expect(
    (await f.t.query(api.newsfeed.queries.searchAll, { term: "Figma", tag: "Figma" })).posts.map(
      (post) => post._id,
    ),
  ).toContain(f.postId);
  const categoryPage = await f.t.query(api.newsfeed.queries.searchCategory, {
    term: "Figma",
    tag: "Figma",
    category: "posts",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(categoryPage.page).toContainEqual(expect.objectContaining({ _id: f.postId }));
  await expect(
    f.t.mutation(api.newsfeed.mutations.beginPost, { token: f.auth, requestId: "bad-tag" }),
  ).resolves.toBeDefined();
  const invalidPostId = await f.t.mutation(api.newsfeed.mutations.beginPost, {
    token: f.auth,
    requestId: "invalid-tag-post",
  });
  const invalidBytes = new TextEncoder().encode("invalid");
  const invalidBody = await f.t.mutation(api.newsfeed.media.begin, {
    token: f.auth,
    postId: invalidPostId,
    requestId: "invalid-tag-body",
    name: "post.txt",
    mime: "text/plain",
    size: invalidBytes.length,
  });
  const invalidStorage = await f.t.run((ctx) => ctx.storage.store(new Blob([invalidBytes])));
  await f.t.mutation(internal.newsfeed.media.acceptChunk, {
    token: f.auth,
    mediaId: invalidBody,
    storageId: invalidStorage,
    index: 0,
    size: invalidBytes.length,
    preview: "invalid",
  });
  await expect(
    f.t.mutation(api.newsfeed.mutations.publish, {
      token: f.auth,
      postId: invalidPostId,
      bodyId: invalidBody,
      tags: ["not allowed!"],
    }),
  ).rejects.toThrow(/Tags/);
  await f.t.run((ctx) => ctx.db.patch(f.postId, { status: "hidden" }));
  expect(
    (await f.t.query(api.newsfeed.queries.searchAll, { term: "Figma", tag: "Figma" })).posts,
  ).toEqual([]);
});

it("keeps spark notes and tags searchable only while the spark is active", async () => {
  const f = await setup();
  const storyId = await f.t.mutation(api.newsfeed.mutations.beginStory, {
    token: f.auth,
    requestId: "spark-notes",
    note: "Dashboard prototype WIP",
    tags: ["Dashboard", "Figma"],
  });
  await f.t.run((ctx) =>
    ctx.db.patch(storyId, {
      status: "published",
      publishedAt: Date.now(),
      mediaCount: 1,
      expiresAt: Date.now() + 60_000,
    }),
  );
  const active = await f.t.query(api.newsfeed.queries.storyById, { storyId });
  expect(active?.[0]?.stories[0]).toMatchObject({
    note: "Dashboard prototype WIP",
    tags: ["Dashboard", "Figma"],
  });
  expect(
    (await f.t.query(api.newsfeed.queries.searchAll, { term: "Dashboard" })).sparks.map(
      (spark) => spark.id,
    ),
  ).toContain(storyId);
  await f.t.run((ctx) => ctx.db.patch(storyId, { expiresAt: Date.now() - 1 }));
  expect(await f.t.query(api.newsfeed.queries.storyById, { storyId })).toBeNull();
  expect((await f.t.query(api.newsfeed.queries.searchAll, { term: "Dashboard" })).sparks).toEqual(
    [],
  );
  expect(
    await f.t.query(api.newsfeed.queries.searchCategory, {
      term: "Dashboard",
      category: "sparks",
      paginationOpts: { cursor: null, numItems: 1 },
    }),
  ).toMatchObject({ page: [], isDone: true });

  const activeId = await f.t.mutation(api.newsfeed.mutations.beginStory, {
    token: f.auth,
    requestId: "active-search-spark",
    note: "PaginationMarker work in progress",
  });
  await f.t.run((ctx) =>
    ctx.db.patch(activeId, {
      status: "published",
      publishedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }),
  );
  for (let index = 0; index < 8; index += 1) {
    const expiredId = await f.t.mutation(api.newsfeed.mutations.beginStory, {
      token: f.auth,
      requestId: `expired-search-spark-${index}`,
      note: "PaginationMarker work in progress",
    });
    await f.t.run((ctx) =>
      ctx.db.patch(expiredId, {
        status: "published",
        publishedAt: Date.now(),
        expiresAt: Date.now() - 1,
      }),
    );
  }
  const activePage = await f.t.query(api.newsfeed.queries.searchCategory, {
    term: "PaginationMarker",
    category: "sparks",
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(activePage.page.filter((spark) => "id" in spark).map((spark) => spark.id)).toContain(
    activeId,
  );
});

it("requires a participant confirmation before sharing only a milestone title and status", async () => {
  const f = await setup();
  const outsiderWallet = wallet("G", "C");
  const jobId = await f.t.run((ctx) =>
    ctx.db.insert("jobs", {
      title: "Private job title",
      description: "Private job description",
      budget: 6400,
      asset: "USDC",
      clientWallet: outsiderWallet,
      status: "open",
      jobHash: "job-hash",
      createdAt: Date.now(),
    }),
  );
  const outsiderMilestone = await f.t.run((ctx) =>
    ctx.db.insert("milestones", {
      jobId,
      order: 0,
      title: "Outsider milestone",
      description: "Private scope",
      amount: 6400,
      asset: "USDC",
      status: "funded",
      assignedFreelancerWallet: outsiderWallet,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const bodyId = await text(f, "Milestone update");
  await expect(
    f.t.mutation(api.newsfeed.mutations.publish, {
      token: f.auth,
      postId: f.postId,
      bodyId,
      milestoneId: outsiderMilestone,
      milestoneConfirmed: true,
    }),
  ).rejects.toThrow(/participant/);
  const participantJob = await f.t.run((ctx) =>
    ctx.db.insert("jobs", {
      title: "Private job title",
      description: "Private job description",
      budget: 6400,
      asset: "USDC",
      clientWallet: wallet(),
      status: "open",
      jobHash: "another-hash",
      createdAt: Date.now(),
    }),
  );
  const milestoneId = await f.t.run((ctx) =>
    ctx.db.insert("milestones", {
      jobId: participantJob,
      order: 0,
      title: "Design system delivery",
      description: "Private scope that must not be shown",
      amount: 6400,
      asset: "USDC",
      status: "released",
      assignedFreelancerWallet: wallet(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await expect(
    f.t.mutation(api.newsfeed.mutations.publish, {
      token: f.auth,
      postId: f.postId,
      bodyId,
      milestoneId,
      milestoneConfirmed: false,
    }),
  ).rejects.toThrow(/Confirm/);
  await f.t.mutation(api.newsfeed.mutations.publish, {
    token: f.auth,
    postId: f.postId,
    bodyId,
    milestoneId,
    milestoneConfirmed: true,
  });
  const post = await f.t.query(api.newsfeed.queries.post, { id: f.postId });
  expect(post?.milestone).toEqual({ title: "Design system delivery", status: "released" });
  expect(post?.milestone).not.toHaveProperty("amount");
  expect(post?.milestone).not.toHaveProperty("description");
});
