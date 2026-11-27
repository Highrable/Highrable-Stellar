import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./convexModules";

const secret = "messaging-test-secret-that-is-long-enough";
const wallet = (prefix: "G" | "C", letter: string) => prefix + letter.repeat(55);

async function signSession(address: string, expiresAt = Date.now() + 15 * 60_000, key = secret) {
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
  const hmac = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `${payload}.${encode(new Uint8Array(await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(payload))))}`;
}

async function fixture() {
  const t = convexTest(schema, modules);
  const people = await t.run(async (ctx) => {
    const rows = [];
    for (const [letter, kind, name] of [
      ["A", "external_wallet", "Ada Client"],
      ["B", "passkey_smart_account", "Ben Designer"],
      ["C", "external_wallet", "Cara Engineer"],
    ] as const) {
      const address = wallet(kind === "passkey_smart_account" ? "C" : "G", letter);
      const userId = await ctx.db.insert("users", {
        walletAddress: address,
        walletType: kind,
        name,
        createdAt: Date.now(),
      });
      rows.push({ address, userId, token: await signSession(address) });
    }
    return rows;
  });
  return { t, ada: people[0]!, ben: people[1]!, cara: people[2]! };
}

beforeEach(() => {
  vi.stubEnv("NEWSFEED_SESSION_SECRET", secret);
});

describe("verified messaging sessions", () => {
  it("reuses one direct conversation per pair and rejects forged, expired, and impersonated sessions", async () => {
    const f = await fixture();
    const first = await f.t.mutation(api.conversations.startDirectConversation, {
      sessionToken: f.ada.token,
      otherUserId: f.ben.userId,
    });
    const duplicateFromOtherSide = await f.t.mutation(api.conversations.startDirectConversation, {
      sessionToken: f.ben.token,
      otherUserId: f.ada.userId,
    });
    expect(duplicateFromOtherSide).toBe(first);

    const forged = await signSession(
      f.ada.address,
      Date.now() + 15 * 60_000,
      "wrong-signing-secret",
    );
    await expect(
      f.t.query(api.conversations.getConversation, {
        conversationId: first,
        sessionToken: forged,
      }),
    ).rejects.toThrow();
    const expired = await signSession(f.ada.address, Date.now() - 1);
    await expect(
      f.t.mutation(api.conversations.sendMessage, {
        conversationId: first,
        sessionToken: expired,
        body: "spoof attempt",
        attachmentIds: [],
      }),
    ).rejects.toThrow();

    await expect(
      f.t.mutation(api.conversations.sendMessage, {
        conversationId: first,
        sessionToken: f.ada.token,
        senderWallet: f.ben.address,
        body: "spoof attempt",
        attachmentIds: [],
      } as never),
    ).rejects.toThrow();
  });

  it("accepts photo and video uploads only from a verified session and exposes them to current members", async () => {
    const f = await fixture();
    const conversationId = await f.t.mutation(api.conversations.startDirectConversation, {
      sessionToken: f.ada.token,
      otherUserId: f.ben.userId,
    });

    await expect(
      f.t.mutation(api.attachments.generateUploadUrl, {
        walletAddress: f.ada.address,
        name: "photo.png",
        size: 5,
        mimeType: "image/png",
        type: "image",
        context: "chat",
      }),
    ).rejects.toThrow("verified Highrable session");
    await expect(
      f.t.mutation(api.attachments.generateUploadUrl, {
        walletAddress: f.ben.address,
        sessionToken: f.ada.token,
        name: "photo.png",
        size: 5,
        mimeType: "image/png",
        type: "image",
        context: "chat",
      }),
    ).rejects.toThrow("does not match this wallet");
    const uploadUrl = await f.t.mutation(api.attachments.generateUploadUrl, {
      walletAddress: f.ada.address,
      sessionToken: f.ada.token,
      name: "photo.png",
      size: 5,
      mimeType: "image/png",
      type: "image",
      context: "chat",
    });
    expect(uploadUrl).toContain("/api/storage/upload");

    const [photoStorageId, videoStorageId] = await f.t.run(async (ctx) =>
      Promise.all([
        ctx.storage.store(new Blob(["photo"], { type: "image/png" })),
        ctx.storage.store(new Blob(["video"], { type: "video/mp4" })),
      ]),
    );
    const photoId = await f.t.mutation(api.attachments.saveUploadedAttachment, {
      storageId: photoStorageId,
      uploadedByWallet: f.ada.address,
      ownerRole: "client",
      name: "photo.png",
      size: 5,
      mimeType: "image/png",
      type: "image",
      context: "chat",
      parentType: "unknown",
      visibility: "private",
      sessionToken: f.ada.token,
    });
    const videoId = await f.t.mutation(api.attachments.saveUploadedAttachment, {
      storageId: videoStorageId,
      uploadedByWallet: f.ada.address,
      ownerRole: "client",
      name: "clip.mp4",
      size: 5,
      mimeType: "video/mp4",
      type: "video",
      context: "chat",
      parentType: "unknown",
      visibility: "private",
      sessionToken: f.ada.token,
    });
    const messageId = await f.t.mutation(api.conversations.sendMessage, {
      conversationId,
      sessionToken: f.ada.token,
      body: "",
      attachmentIds: [photoId, videoId],
    });

    const messages = await f.t.query(api.conversations.getMessagesForConversation, {
      conversationId,
      sessionToken: f.ben.token,
    });
    expect(messages[0]?._id).toBe(messageId);
    expect(messages[0]?.attachments.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: "photo.png", type: "image" },
      { name: "clip.mp4", type: "video" },
    ]);
    await expect(
      f.t.query(api.attachments.getById, {
        attachmentId: photoId,
        viewerWallet: f.cara.address,
        sessionToken: f.cara.token,
      }),
    ).rejects.toThrow();
  });

  it("supports replies, own-message deletion, unread state, and paginated history for wallet and passkey sessions", async () => {
    const f = await fixture();
    const conversationId = await f.t.mutation(api.conversations.startDirectConversation, {
      sessionToken: f.ada.token,
      otherUserId: f.ben.userId,
    });
    const original = await f.t.mutation(api.conversations.sendMessage, {
      conversationId,
      sessionToken: f.ada.token,
      body: "A first message",
      attachmentIds: [],
    });
    const reply = await f.t.mutation(api.conversations.sendMessage, {
      conversationId,
      sessionToken: f.ben.token,
      body: "A passkey reply",
      attachmentIds: [],
      replyToMessageId: original,
    });
    expect(
      await f.t.query(api.conversations.getUnreadConversationCount, { sessionToken: f.ada.token }),
    ).toBe(1);
    await f.t.mutation(api.conversations.markConversationRead, {
      conversationId,
      sessionToken: f.ada.token,
    });
    expect(
      await f.t.query(api.conversations.getUnreadConversationCount, { sessionToken: f.ada.token }),
    ).toBe(0);
    await expect(
      f.t.mutation(api.conversations.softDeleteMessage, {
        messageId: reply,
        sessionToken: f.ada.token,
      }),
    ).rejects.toThrow("own messages");
    await f.t.mutation(api.conversations.softDeleteMessage, {
      messageId: reply,
      sessionToken: f.ben.token,
    });

    for (let index = 0; index < 55; index += 1) {
      await f.t.mutation(api.conversations.sendMessage, {
        conversationId,
        sessionToken: f.ada.token,
        body: `Message ${index}`,
        attachmentIds: [],
      });
    }
    const latest = await f.t.query(api.conversations.getMessagesPage, {
      conversationId,
      sessionToken: f.ben.token,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(latest.page).toHaveLength(50);
    expect(latest.page.at(-1)?.body).toBe("Message 54");
    expect(latest.isDone).toBe(false);
    const older = await f.t.query(api.conversations.getMessagesPage, {
      conversationId,
      sessionToken: f.ben.token,
      paginationOpts: { numItems: 50, cursor: latest.continueCursor },
    });
    expect(older.page.some((message) => message.body === "A first message")).toBe(true);
    expect(older.page.some((message) => message.replyToMessageId === original)).toBe(true);
  });

  it("enforces group creator ownership, membership changes, leaving, and history isolation", async () => {
    const f = await fixture();
    const groupId = await f.t.mutation(api.conversations.createGroupConversation, {
      sessionToken: f.ada.token,
      title: "Project group",
      memberUserIds: [f.ben.userId],
    });
    const opening = await f.t.mutation(api.conversations.sendMessage, {
      conversationId: groupId,
      sessionToken: f.ada.token,
      body: "Group history is visible to members",
      attachmentIds: [],
    });
    const groupAttachmentId = await f.t.run((ctx) =>
      ctx.db.insert("attachments", {
        type: "pdf",
        name: "group-file.pdf",
        uploadedByWallet: f.ada.address,
        ownerRole: "client",
        parentType: "chat_message",
        parentId: opening,
        visibility: "participants",
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await f.t.mutation(api.conversations.changeGroupMembers, {
      sessionToken: f.ada.token,
      conversationId: groupId,
      addUserIds: [f.cara.userId],
      removeWallets: [],
    });
    await f.t.mutation(api.conversations.changeGroupMembers, {
      sessionToken: f.ada.token,
      conversationId: groupId,
      addUserIds: [],
      removeWallets: [f.cara.address],
    });
    await expect(
      f.t.query(api.conversations.getMessagesForConversation, {
        conversationId: groupId,
        sessionToken: f.cara.token,
      }),
    ).rejects.toThrow();
    await expect(
      f.t.query(api.attachments.getById, {
        attachmentId: groupAttachmentId,
        viewerWallet: f.cara.address,
        sessionToken: f.cara.token,
      }),
    ).rejects.toThrow();
    const memberHistory = await f.t.query(api.conversations.getMessagesForConversation, {
      conversationId: groupId,
      sessionToken: f.ben.token,
    });
    expect(memberHistory[0]?._id).toBe(opening);
    await expect(
      f.t.mutation(api.conversations.leaveGroupConversation, {
        sessionToken: f.ada.token,
        conversationId: groupId,
      }),
    ).rejects.toThrow("Transfer group ownership");
    await f.t.mutation(api.conversations.transferGroupOwnership, {
      sessionToken: f.ada.token,
      conversationId: groupId,
      newOwnerWallet: f.ben.address,
    });
    await f.t.mutation(api.conversations.leaveGroupConversation, {
      sessionToken: f.ada.token,
      conversationId: groupId,
    });
    await f.t.mutation(api.conversations.leaveGroupConversation, {
      sessionToken: f.ben.token,
      conversationId: groupId,
    });
    await expect(
      f.t.query(api.conversations.getMessagesForConversation, {
        conversationId: groupId,
        sessionToken: f.ben.token,
      }),
    ).rejects.toThrow();
  });

  it("keeps locked work history readable, blocks writes, and gates chat attachments by verified membership", async () => {
    const f = await fixture();
    const { conversationId, messageId, eventMessageId, attachmentId } = await f.t.run(
      async (ctx) => {
        const conversationId = await ctx.db.insert("conversations", {
          parentType: "job",
          parentId: "legacy-job-id",
          participantWallets: [f.ada.address, f.ben.address].sort(),
          clientWallet: f.ada.address,
          freelancerWallet: f.ben.address,
          status: "locked",
          createdByWallet: f.ada.address,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const eventMessageId = await ctx.db.insert("messages", {
          conversationId,
          parentType: "job",
          parentId: "legacy-job-id",
          senderWallet: "system",
          senderWalletType: "system",
          senderRole: "system",
          kind: "event",
          body: "Escrow was funded.",
          attachmentIds: [],
          eventType: "escrow_funded",
          status: "sent",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const messageId = await ctx.db.insert("messages", {
          conversationId,
          parentType: "job",
          parentId: "legacy-job-id",
          senderWallet: f.ada.address,
          senderWalletType: "external_wallet",
          senderRole: "client",
          kind: "user",
          body: "Legacy work chat file",
          attachmentIds: [],
          status: "sent",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const attachmentId = await ctx.db.insert("attachments", {
          type: "pdf",
          name: "scope.pdf",
          uploadedByWallet: f.ada.address,
          ownerRole: "client",
          parentType: "chat_message",
          parentId: messageId,
          visibility: "participants",
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.db.patch(messageId, { attachmentIds: [attachmentId] });
        return { conversationId, messageId, eventMessageId, attachmentId };
      },
    );

    const history = await f.t.query(api.conversations.getMessagesForConversation, {
      conversationId,
      sessionToken: f.ben.token,
    });
    expect(history.map((message) => message.body)).toContain("Legacy work chat file");
    expect(history.map((message) => message.body)).toContain("Escrow was funded.");
    expect(
      history.find((message) => message.body === "Legacy work chat file")?.attachments,
    ).toHaveLength(1);
    await expect(
      f.t.mutation(api.conversations.sendMessage, {
        conversationId,
        sessionToken: f.ada.token,
        body: "Should remain locked",
        attachmentIds: [],
      }),
    ).rejects.toThrow("locked");
    await expect(
      f.t.query(api.attachments.getById, {
        attachmentId,
        viewerWallet: f.ben.address,
      }),
    ).rejects.toThrow();
    await expect(
      f.t.query(api.attachments.getById, {
        attachmentId,
        viewerWallet: f.ada.address,
        sessionToken: f.ben.token,
      }),
    ).rejects.toThrow("does not match");
    await expect(
      f.t.query(api.attachments.getById, {
        attachmentId,
        viewerWallet: f.ben.address,
        sessionToken: f.ben.token,
      }),
    ).resolves.toMatchObject({ name: "scope.pdf" });
    expect(messageId).toBeDefined();
    expect(eventMessageId).toBeDefined();

    const archivedId = await f.t.run((ctx) =>
      ctx.db.insert("conversations", {
        parentType: "escrow",
        parentId: "legacy-escrow-id",
        participantWallets: [f.ada.address, f.ben.address].sort(),
        clientWallet: f.ada.address,
        freelancerWallet: f.ben.address,
        status: "archived",
        createdByWallet: f.ada.address,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await expect(
      f.t.mutation(api.conversations.sendMessage, {
        conversationId: archivedId,
        sessionToken: f.ben.token,
        body: "Should remain archived",
        attachmentIds: [],
      }),
    ).rejects.toThrow("archived");
  });
});
