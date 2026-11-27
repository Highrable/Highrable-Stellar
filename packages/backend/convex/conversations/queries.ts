import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { query } from "../_generated/server";
import { assertCanViewAttachment, serializeAttachmentForViewer } from "../attachments/helpers";
import { findUserByWallet, resolveAvatarUrl } from "../users/helpers";
import {
  assertParticipant,
  getConversationByParent as findConversationByParent,
  getConversationOrThrow,
  requireSessionParticipant,
} from "./helpers";
import { conversationParentTypeValidator } from "./schema";

async function withMessageAttachments(
  ctx: QueryCtx,
  message: Doc<"messages">,
  viewerWallet: string,
  senderProfile: TConversationSenderProfile | null,
) {
  const attachments = [];
  if (message.status !== "deleted") {
    for (const attachmentId of message.attachmentIds) {
      const attachment = await ctx.db.get(attachmentId);
      if (!attachment) continue;
      await assertCanViewAttachment(ctx, attachment, viewerWallet);
      attachments.push(await serializeAttachmentForViewer(ctx, attachment, viewerWallet));
    }
  }
  return { ...message, attachments, senderProfile };
}

type TConversationSenderProfile = {
  walletAddress: string;
  displayName: string;
  avatarUrl?: string;
};

function getUserDisplayName(user: Awaited<ReturnType<typeof findUserByWallet>>): string | null {
  if (!user) return null;
  const firstLastName = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return firstLastName || user.name?.trim() || user.companyName?.trim() || null;
}

async function getSenderProfiles(ctx: QueryCtx, wallets: readonly string[]) {
  const profiles = new Map<string, TConversationSenderProfile>();
  await Promise.all(
    Array.from(new Set(wallets.filter((wallet) => wallet !== "system"))).map(
      async (walletAddress) => {
        const user = await findUserByWallet(ctx, walletAddress);
        const displayName = getUserDisplayName(user);
        if (!user || !displayName) return;
        const avatarUrl = await resolveAvatarUrl(ctx, user);
        profiles.set(walletAddress, {
          walletAddress,
          displayName,
          ...(avatarUrl ? { avatarUrl } : {}),
        });
      },
    ),
  );
  return profiles;
}

async function listViewerConversations(ctx: QueryCtx, walletAddress: string) {
  const [memberships, asClient, asFreelancer] = await Promise.all([
    ctx.db
      .query("conversationParticipants")
      .withIndex("by_wallet_updated", (q) => q.eq("walletAddress", walletAddress))
      .order("desc")
      .take(200),
    ctx.db
      .query("conversations")
      .withIndex("by_clientWallet", (q) => q.eq("clientWallet", walletAddress))
      .order("desc")
      .take(100),
    ctx.db
      .query("conversations")
      .withIndex("by_freelancerWallet", (q) => q.eq("freelancerWallet", walletAddress))
      .order("desc")
      .take(100),
  ]);
  const byId = new Map<string, Doc<"conversations">>();
  for (const membership of memberships) {
    if (membership.status !== "active") continue;
    const conversation = await ctx.db.get(membership.conversationId);
    if (conversation?.participantWallets.includes(walletAddress))
      byId.set(conversation._id, conversation);
  }
  for (const conversation of [...asClient, ...asFreelancer]) {
    if (conversation.participantWallets.includes(walletAddress))
      byId.set(conversation._id, conversation);
  }
  const rows = await Promise.all(
    Array.from(byId.values()).map(async (conversation) => {
      const [read, lastMessage] = await Promise.all([
        ctx.db
          .query("conversationReads")
          .withIndex("by_conversation_wallet", (q) =>
            q.eq("conversationId", conversation._id).eq("walletAddress", walletAddress),
          )
          .first(),
        conversation.lastMessageId ? ctx.db.get(conversation.lastMessageId) : null,
      ]);
      const unread = Boolean(
        conversation.lastMessageAt !== undefined &&
        conversation.lastMessageAt > (read?.lastReadAt ?? 0) &&
        lastMessage?.senderWallet !== walletAddress,
      );
      const participantProfiles = await getSenderProfiles(ctx, conversation.participantWallets);
      return {
        ...conversation,
        unread,
        participantProfiles: conversation.participantWallets.map(
          (wallet) =>
            participantProfiles.get(wallet) ?? {
              walletAddress: wallet,
              displayName: "Highrable member",
            },
        ),
      };
    }),
  );
  return rows.sort(
    (left, right) =>
      (right.lastMessageAt ?? right.updatedAt) - (left.lastMessageAt ?? left.updatedAt),
  );
}

export const getConversation = query({
  args: { conversationId: v.id("conversations"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    assertParticipant(conversation, viewer.walletAddress);
    return conversation;
  },
});

export const getConversationByParent = query({
  args: {
    parentType: conversationParentTypeValidator,
    parentId: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await findConversationByParent(ctx, args.parentType, args.parentId);
    if (!conversation) return null;
    assertParticipant(conversation, viewer.walletAddress);
    return conversation;
  },
});

export const getConversationsForCurrentWallet = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    return await listViewerConversations(ctx, viewer.walletAddress);
  },
});

export const getUnreadConversationCount = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversations = await listViewerConversations(ctx, viewer.walletAddress);
    return conversations.filter((conversation) => conversation.unread).length;
  },
});

export const getMessagesForConversation = query({
  args: {
    conversationId: v.id("conversations"),
    sessionToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    assertParticipant(conversation, viewer.walletAddress);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(limit);
    const visible = messages.filter((message) => message.status !== "hidden").reverse();
    const senderProfiles = await getSenderProfiles(
      ctx,
      visible.map((message) => message.senderWallet),
    );
    return await Promise.all(
      visible.map((message) =>
        withMessageAttachments(
          ctx,
          message,
          viewer.walletAddress,
          senderProfiles.get(message.senderWallet) ?? null,
        ),
      ),
    );
  },
});

export const getMessagesPage = query({
  args: {
    conversationId: v.id("conversations"),
    sessionToken: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    assertParticipant(conversation, viewer.walletAddress);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 50) });
    const visible = page.page.filter((message) => message.status !== "hidden");
    const senderProfiles = await getSenderProfiles(
      ctx,
      visible.map((message) => message.senderWallet),
    );
    return {
      ...page,
      page: await Promise.all(
        visible
          .reverse()
          .map((message) =>
            withMessageAttachments(
              ctx,
              message,
              viewer.walletAddress,
              senderProfiles.get(message.senderWallet) ?? null,
            ),
          ),
      ),
    };
  },
});

export const searchPeople = query({
  args: {
    sessionToken: v.string(),
    term: v.string(),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const excludedWallets = new Set([viewer.walletAddress]);
    if (args.conversationId) {
      const conversation = await getConversationOrThrow(ctx, args.conversationId);
      assertParticipant(conversation, viewer.walletAddress);
      conversation.participantWallets.forEach((walletAddress) =>
        excludedWallets.add(walletAddress),
      );
    }
    const term = args.term.trim().replace(/\s+/g, " ").slice(0, 80);
    if (term.length < 2) return [];
    const [users, profiles] = await Promise.all([
      ctx.db
        .query("users")
        .withSearchIndex("search_name", (q) => q.search("name", term))
        .take(20),
      ctx.db
        .query("socialProfiles")
        .withSearchIndex("search_name", (q) => q.search("name", term))
        .take(20),
    ]);
    const ids = new Set<string>();
    const results = [];
    for (const id of [
      ...users.map((user) => user._id),
      ...profiles.map((profile) => profile.authorId),
    ]) {
      if (ids.has(String(id))) continue;
      ids.add(String(id));
      const user = await ctx.db.get(id);
      if (!user) continue;
      if (excludedWallets.has(user.walletAddress)) continue;
      const profile = await ctx.db
        .query("socialProfiles")
        .withIndex("by_author", (q) => q.eq("authorId", user._id))
        .unique();
      const name = profile?.name?.trim() || getUserDisplayName(user);
      if (!name) continue;
      const avatarUrl = profile?.avatarUrl || user.avatarUrl || (await resolveAvatarUrl(ctx, user));
      results.push({
        userId: user._id,
        name,
        ...(profile?.headline ? { headline: profile.headline } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      });
    }
    return results.slice(0, 20);
  },
});

export const getConversationParticipants = query({
  args: { conversationId: v.id("conversations"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireSessionParticipant(ctx, args.sessionToken);
    const conversation = await getConversationOrThrow(ctx, args.conversationId);
    assertParticipant(conversation, viewer.walletAddress);
    return {
      participantWallets: conversation.participantWallets,
      participantWalletTypes: conversation.participantWalletTypes ?? [],
      clientWallet: conversation.clientWallet,
      freelancerWallet: conversation.freelancerWallet,
      groupOwnerWallet: conversation.groupOwnerWallet,
    };
  },
});
