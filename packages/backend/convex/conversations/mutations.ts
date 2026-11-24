import { v } from "convex/values";

import type { TWalletType } from "../users/schema";

import { internalMutation, mutation } from "../_generated/server";
import { BadRequestError, ForbiddenError, NotFoundError } from "../_shared/errors";
import { normalizeWalletAddress } from "../_shared/input";
import {
  assertCanAttachToMessage,
  assertCanSendMessage,
  assertParticipant,
  buildMessagePreview,
  createSystemMessageForEvent,
  getConversationByParent,
  getConversationOrThrow,
  getParticipantWallets,
  requireSessionParticipant,
  resolveConversationParticipants,
  upsertConversationParticipant,
  validateMessagePayload,
} from "./helpers";
import { conversationParentTypeValidator, messageEventTypeValidator } from "./schema";

export const getOrCreateConversationForParent = mutation({
  args: {
    parentType: conversationParentTypeValidator,
    parentId: v.string(),
    sessionToken: v.string(),
    title: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.parentType === "direct" || args.parentType === "group") {
      throw new BadRequestError("Start a social conversation with the messaging tools.");
    }
    const { walletAddress, walletType } = await requireSessionParticipant(ctx, args.sessionToken);
    const existing = await getConversationByParent(ctx, args.parentType, args.parentId);
    if (existing) {
      assertParticipant(existing, walletAddress);
      return existing._id;
    }

    const resolved = await resolveConversationParticipants(ctx, args);
    if (!resolved.participants.some((participant) => participant.walletAddress === walletAddress)) {
      throw new ForbiddenError("Only the client and assigned freelancer can use this chat.");
    }

    const participantWallets = getParticipantWallets(resolved.participants);
    const now = Date.now();
    return await ctx.db
      .insert("conversations", {
        parentType: resolved.parentType,
        parentId: resolved.parentId,
        ...(resolved.jobId !== undefined ? { jobId: resolved.jobId } : {}),
        ...(resolved.microGigId !== undefined ? { microGigId: resolved.microGigId } : {}),
        ...(resolved.milestoneId !== undefined ? { milestoneId: resolved.milestoneId } : {}),
        ...(resolved.escrowId !== undefined ? { escrowId: resolved.escrowId } : {}),
        ...(resolved.workSubmissionId !== undefined
          ? { workSubmissionId: resolved.workSubmissionId }
          : {}),
        ...(resolved.disputeId !== undefined ? { disputeId: resolved.disputeId } : {}),
        participantWallets,
        participantWalletTypes: resolved.participants.map((participant) => ({
          walletAddress: participant.walletAddress,
          ...(participant.walletAddress === walletAddress && walletType !== undefined
            ? { walletType }
            : participant.walletType !== undefined
              ? { walletType: participant.walletType }
              : {}),
        })),
        ...(resolved.clientWallet !== undefined ? { clientWallet: resolved.clientWallet } : {}),
        ...(resolved.freelancerWallet !== undefined
          ? { freelancerWallet: resolved.freelancerWallet }
          : {}),
        ...(args.title?.trim()
          ? { title: args.title.trim().slice(0, 160) }
          : resolved.title
            ? { title: resolved.title }
            : {}),
        status: "active",
        createdByWallet: walletAddress,
        createdByWalletType: walletType,
        createdAt: now,
        updatedAt: now,
        ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      })
      .then(async (conversationId) => {
        await Promise.all(
          resolved.participants.map((participant) =>
            upsertConversationParticipant(ctx, {
              conversationId,
              walletAddress: participant.walletAddress,
              ...(participant.walletType ? { walletType: participant.walletType } : {}),
            }),
          ),
        );
        return conversationId;
      });
  },
});

export const startDirectConversation = mutation({
  args: { sessionToken: v.string(), otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const otherUser = await ctx.db.get(args.otherUserId);
    if (!otherUser || normalizeWalletAddress(otherUser.walletAddress) === viewer.walletAddress) {
      throw new BadRequestError("Choose another registered Highrable member.");
    }
    const pair = [viewer.walletAddress, normalizeWalletAddress(otherUser.walletAddress)].sort();
    const directPairKey = pair.join(":");
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_direct_pair", (q) => q.eq("directPairKey", directPairKey))
      .first();
    if (existing) {
      assertParticipant(existing, viewer.walletAddress);
      return existing._id;
    }

    const now = Date.now();
    const participants = [
      { walletAddress: viewer.walletAddress, walletType: viewer.walletType },
      {
        walletAddress: pair.find((address) => address !== viewer.walletAddress)!,
        walletType:
          otherUser.walletType ??
          (otherUser.walletAddress.startsWith("C") ? "passkey_smart_account" : "external_wallet"),
      },
    ];
    const conversationId = await ctx.db.insert("conversations", {
      parentType: "direct",
      parentId: directPairKey,
      directPairKey,
      participantWallets: pair,
      participantWalletTypes: participants,
      status: "active",
      createdByWallet: viewer.walletAddress,
      createdByWalletType: viewer.walletType,
      createdAt: now,
      updatedAt: now,
    });
    await Promise.all(
      participants.map((participant) =>
        upsertConversationParticipant(ctx, {
          conversationId,
          walletAddress: participant.walletAddress,
          walletType: participant.walletType,
        }),
      ),
    );
    return conversationId;
  },
});

export const createGroupConversation = mutation({
  args: { sessionToken: v.string(), title: v.string(), memberUserIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const title = args.title.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!title) throw new BadRequestError("Enter a group name.");
    if (args.memberUserIds.length > 49)
      throw new BadRequestError("Groups can have up to 50 members.");
    const members = new Map<
      string,
      { walletAddress: string; walletType: "external_wallet" | "passkey_smart_account" }
    >();
    members.set(viewer.walletAddress, {
      walletAddress: viewer.walletAddress,
      walletType: viewer.walletType,
    });
    for (const userId of args.memberUserIds) {
      const user = await ctx.db.get(userId);
      if (!user) continue;
      const walletAddress = normalizeWalletAddress(user.walletAddress);
      members.set(walletAddress, {
        walletAddress,
        walletType:
          user.walletType ??
          (walletAddress.startsWith("C") ? "passkey_smart_account" : "external_wallet"),
      });
    }
    const participants = Array.from(members.values());
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      parentType: "group",
      parentId: "pending",
      participantWallets: getParticipantWallets(participants),
      participantWalletTypes: participants,
      groupOwnerWallet: viewer.walletAddress,
      title,
      status: "active",
      createdByWallet: viewer.walletAddress,
      createdByWalletType: viewer.walletType,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(conversationId, { parentId: String(conversationId) });
    await Promise.all(
      participants.map((participant) =>
        upsertConversationParticipant(ctx, {
          conversationId,
          walletAddress: participant.walletAddress,
          walletType: participant.walletType,
        }),
      ),
    );
    return conversationId;
  },
});

export const changeGroupMembers = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    addUserIds: v.array(v.id("users")),
    removeWallets: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    if (
      conversation.parentType !== "group" ||
      conversation.groupOwnerWallet !== viewer.walletAddress
    ) {
      throw new ForbiddenError("Only the group creator can manage membership.");
    }
    assertParticipant(conversation, viewer.walletAddress);
    const members = new Map<string, { walletAddress: string; walletType?: TWalletType }>();
    for (const member of conversation.participantWalletTypes ?? []) {
      if (conversation.participantWallets.includes(member.walletAddress)) {
        members.set(member.walletAddress, member);
      }
    }
    for (const walletAddress of conversation.participantWallets) {
      if (!members.has(walletAddress)) members.set(walletAddress, { walletAddress });
    }
    const removeWallets = new Set(args.removeWallets.map(normalizeWalletAddress));
    if (removeWallets.has(viewer.walletAddress))
      throw new BadRequestError("Use Leave group to leave.");
    for (const walletAddress of removeWallets) {
      if (walletAddress === conversation.groupOwnerWallet) {
        throw new BadRequestError("Transfer group ownership before removing the creator.");
      }
      if (members.delete(walletAddress)) {
        await upsertConversationParticipant(ctx, {
          conversationId: conversation._id,
          walletAddress,
          status: "removed",
        });
      }
    }
    for (const userId of args.addUserIds) {
      const user = await ctx.db.get(userId);
      if (!user) continue;
      const walletAddress = normalizeWalletAddress(user.walletAddress);
      const walletType =
        user.walletType ??
        (walletAddress.startsWith("C") ? "passkey_smart_account" : "external_wallet");
      members.set(walletAddress, { walletAddress, walletType });
      await upsertConversationParticipant(ctx, {
        conversationId: conversation._id,
        walletAddress,
        walletType,
      });
    }
    if (members.size > 50) throw new BadRequestError("Groups can have up to 50 members.");
    await ctx.db.patch(conversation._id, {
      participantWallets: getParticipantWallets(Array.from(members.values())),
      participantWalletTypes: Array.from(members.values()),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const transferGroupOwnership = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    newOwnerWallet: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    const newOwnerWallet = normalizeWalletAddress(args.newOwnerWallet);
    assertParticipant(conversation, viewer.walletAddress);
    if (
      conversation.parentType !== "group" ||
      conversation.groupOwnerWallet !== viewer.walletAddress
    ) {
      throw new ForbiddenError("Only the group creator can transfer ownership.");
    }
    if (
      newOwnerWallet === viewer.walletAddress ||
      !conversation.participantWallets.includes(newOwnerWallet)
    ) {
      throw new BadRequestError("Choose a current member to become the group creator.");
    }
    await ctx.db.patch(conversation._id, {
      groupOwnerWallet: newOwnerWallet,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const leaveGroupConversation = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    if (conversation.parentType !== "group")
      throw new BadRequestError("This is not a group conversation.");
    assertParticipant(conversation, viewer.walletAddress);
    const remaining = conversation.participantWallets.filter(
      (wallet) => wallet !== viewer.walletAddress,
    );
    if (viewer.walletAddress === conversation.groupOwnerWallet && remaining.length > 0) {
      throw new ForbiddenError("Transfer group ownership before leaving.");
    }
    await upsertConversationParticipant(ctx, {
      conversationId: conversation._id,
      walletAddress: viewer.walletAddress,
      status: "left",
    });
    await ctx.db.patch(conversation._id, {
      participantWallets: remaining,
      participantWalletTypes: (conversation.participantWalletTypes ?? []).filter(
        (member) => member.walletAddress !== viewer.walletAddress,
      ),
      status: remaining.length === 0 ? "archived" : conversation.status,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    sessionToken: v.string(),
    body: v.string(),
    attachmentIds: v.array(v.id("attachments")),
    replyToMessageId: v.optional(v.id("messages")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    const sender = assertCanSendMessage(conversation, viewer.walletAddress);
    if (
      (conversation.parentType === "direct" || conversation.parentType === "group") &&
      args.attachmentIds.length > 0
    ) {
      throw new BadRequestError("Social conversations support text messages only.");
    }
    const body = validateMessagePayload({
      body: args.body,
      attachmentIds: args.attachmentIds,
    });
    if (args.replyToMessageId !== undefined) {
      const repliedMessage = await ctx.db.get(args.replyToMessageId);
      if (
        !repliedMessage ||
        repliedMessage.conversationId !== conversation._id ||
        repliedMessage.status === "hidden"
      ) {
        throw new BadRequestError("The message you are replying to is no longer available.");
      }
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      parentType: conversation.parentType,
      parentId: conversation.parentId,
      senderWallet: sender.walletAddress,
      senderWalletType: viewer.walletType,
      senderRole: sender.senderRole,
      kind: "user",
      body,
      attachmentIds: args.attachmentIds,
      ...(args.replyToMessageId !== undefined ? { replyToMessageId: args.replyToMessageId } : {}),
      status: "sent",
      createdAt: now,
      updatedAt: now,
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    });

    try {
      await assertCanAttachToMessage(ctx, {
        attachmentIds: args.attachmentIds,
        walletAddress: sender.walletAddress,
        messageId,
      });
    } catch (error) {
      await ctx.db.patch(messageId, {
        status: "hidden",
        updatedAt: Date.now(),
        metadata: { sendError: "attachment_link_failed" },
      });
      throw error;
    }

    await ctx.db.patch(conversation._id, {
      lastMessageId: messageId,
      lastMessagePreview: buildMessagePreview({
        body,
        attachmentCount: args.attachmentIds.length,
      }),
      lastMessageAt: now,
      updatedAt: now,
    });

    return messageId;
  },
});

export const markConversationRead = mutation({
  args: {
    conversationId: v.id("conversations"),
    sessionToken: v.string(),
    lastReadMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    const walletAddress = assertParticipant(conversation, viewer.walletAddress);
    const now = Date.now();

    const existing = await ctx.db
      .query("conversationReads")
      .withIndex("by_conversation_wallet", (q) =>
        q.eq("conversationId", args.conversationId).eq("walletAddress", walletAddress),
      )
      .first();

    const patch = {
      walletType: viewer.walletType,
      ...(args.lastReadMessageId !== undefined
        ? { lastReadMessageId: args.lastReadMessageId }
        : {}),
      lastReadAt: now,
      unreadCountSnapshot: 0,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("conversationReads", {
      conversationId: args.conversationId,
      walletAddress,
      ...patch,
    });
  },
});

export const softDeleteMessage = mutation({
  args: {
    messageId: v.id("messages"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new NotFoundError("Message not found.");
    }
    const walletAddress = viewer.walletAddress;
    if (message.senderWallet !== walletAddress) {
      throw new ForbiddenError("You can only delete your own messages.");
    }
    if (message.kind !== "user") {
      throw new BadRequestError("System messages cannot be deleted.");
    }

    await ctx.db.patch(args.messageId, {
      status: "deleted",
      body: "",
      updatedAt: Date.now(),
    });

    const conversation = await getConversationOrThrow(ctx, message.conversationId);
    if (conversation.lastMessageId === message._id) {
      const previous = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
        .order("desc")
        .take(100);
      const latest = previous.find(
        (candidate) =>
          candidate._id !== message._id &&
          candidate.status !== "hidden" &&
          candidate.status !== "deleted",
      );
      await ctx.db.patch(conversation._id, {
        lastMessageId: latest?._id,
        lastMessagePreview: latest
          ? buildMessagePreview({
              body: latest.body,
              attachmentCount: latest.attachmentIds.length,
              kind: latest.kind,
              eventType: latest.eventType,
            })
          : undefined,
        lastMessageAt: latest?.createdAt,
        updatedAt: Date.now(),
      });
    }

    return true;
  },
});

export const sendSystemMessage = internalMutation({
  args: {
    parentType: conversationParentTypeValidator,
    parentId: v.string(),
    eventType: messageEventTypeValidator,
    body: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await createSystemMessageForEvent(ctx, {
      parentType: args.parentType,
      parentId: args.parentId,
      eventType: args.eventType,
      ...(args.body !== undefined ? { body: args.body } : {}),
      eventPayload: args.eventPayload,
    });
  },
});
