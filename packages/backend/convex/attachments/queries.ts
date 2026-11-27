import { v } from "convex/values";

import { query } from "../_generated/server";
import { NotFoundError } from "../_shared/errors";
import { normalizeWalletAddress } from "../_shared/input";
import {
  assertChatAttachmentSession,
  assertChatMessageSession,
  assertCanPreviewAttachment,
  assertCanViewAttachment,
  FREELANCER_DELIVERABLE_BLOCKED_DOWNLOAD_MESSAGE,
  getAttachmentAccessPolicy as resolveAttachmentAccessPolicy,
  getAttachmentsForParent,
  sanitizeParentReference,
  serializeAttachmentForViewer,
} from "./helpers";
import { attachmentParentTypeValidator } from "./schema";

export const listByParent = query({
  args: {
    parentType: attachmentParentTypeValidator,
    parentId: v.string(),
    viewerWallet: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parent = sanitizeParentReference(args);
    if (parent.parentType === "chat_message" && parent.parentId) {
      await assertChatMessageSession(
        ctx,
        parent.parentId as import("../_generated/dataModel").Id<"messages">,
        args.sessionToken,
        args.viewerWallet,
      );
    }
    const attachments = await getAttachmentsForParent(ctx, {
      ...parent,
      viewerWallet: args.viewerWallet,
    });

    return await Promise.all(
      attachments.map((attachment) =>
        serializeAttachmentForViewer(ctx, attachment, args.viewerWallet),
      ),
    );
  },
});

export const getById = query({
  args: {
    attachmentId: v.id("attachments"),
    viewerWallet: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) {
      throw new NotFoundError("Attachment not found.");
    }

    await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);

    await assertCanViewAttachment(ctx, attachment, args.viewerWallet);
    return await serializeAttachmentForViewer(ctx, attachment, args.viewerWallet);
  },
});

export const getManyByIds = query({
  args: {
    attachmentIds: v.array(v.id("attachments")),
    viewerWallet: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const attachmentId of args.attachmentIds) {
      const attachment = await ctx.db.get(attachmentId);
      if (!attachment) {
        continue;
      }

      await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);

      await assertCanViewAttachment(ctx, attachment, args.viewerWallet);
      results.push(await serializeAttachmentForViewer(ctx, attachment, args.viewerWallet));
    }

    return results;
  },
});

export const getProtectedAttachment = query({
  args: {
    attachmentId: v.id("attachments"),
    viewerWallet: v.string(),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) {
      throw new NotFoundError("Attachment not found.");
    }

    await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);

    await assertCanPreviewAttachment(ctx, attachment, args.viewerWallet);
    return await serializeAttachmentForViewer(ctx, attachment, args.viewerWallet);
  },
});

export const getAttachmentAccessPolicy = query({
  args: {
    attachmentId: v.id("attachments"),
    viewerWallet: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) {
      throw new NotFoundError("Attachment not found.");
    }

    await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);

    return await resolveAttachmentAccessPolicy(ctx, attachment, args.viewerWallet);
  },
});

export const getAttachmentProtectionSettings = query({
  args: {
    attachmentId: v.id("attachments"),
    viewerWallet: v.string(),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) {
      throw new NotFoundError("Attachment not found.");
    }
    await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);
    await assertCanViewAttachment(ctx, attachment, args.viewerWallet);
    const policy = await resolveAttachmentAccessPolicy(ctx, attachment, args.viewerWallet);
    const viewerWallet = normalizeWalletAddress(args.viewerWallet);
    if (attachment.uploadedByWallet !== viewerWallet && policy.viewerRole !== "admin") {
      return {
        protectionMode: policy.protectionMode,
        downloadAllowed: policy.downloadAllowed,
        previewAllowed: policy.previewAllowed,
        watermarkEnabled: policy.watermarkEnabled,
        accessLoggingEnabled: policy.accessLoggingEnabled,
      };
    }

    return {
      protectionMode: policy.protectionMode,
      downloadAllowed: policy.downloadAllowed,
      previewAllowed: policy.previewAllowed,
      watermarkEnabled: policy.watermarkEnabled,
      accessLoggingEnabled: policy.accessLoggingEnabled,
      allowedViewerRoles: policy.allowedViewerRoles,
      expiresAt: attachment.expiresAt,
      protectedReason: attachment.protectedReason,
    };
  },
});

export const canPreviewAttachment = query({
  args: {
    attachmentId: v.id("attachments"),
    viewerWallet: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) return { allowed: false, reason: "Attachment not found." };
    await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);
    const policy = await resolveAttachmentAccessPolicy(ctx, attachment, args.viewerWallet);
    return { allowed: policy.canPreview, reason: policy.canPreview ? null : policy.reason };
  },
});

export const canDownloadAttachment = query({
  args: {
    attachmentId: v.id("attachments"),
    viewerWallet: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) return { allowed: false, reason: "Attachment not found." };
    await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);
    const policy = await resolveAttachmentAccessPolicy(ctx, attachment, args.viewerWallet);
    return {
      allowed: policy.canDownload,
      reason: policy.canDownload ? null : FREELANCER_DELIVERABLE_BLOCKED_DOWNLOAD_MESSAGE,
    };
  },
});

export const getAttachmentAccessLogs = query({
  args: {
    attachmentId: v.id("attachments"),
    viewerWallet: v.string(),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) {
      throw new NotFoundError("Attachment not found.");
    }
    await assertChatAttachmentSession(ctx, attachment, args.sessionToken, args.viewerWallet);
    const viewerWallet = normalizeWalletAddress(args.viewerWallet);
    const policy = await resolveAttachmentAccessPolicy(ctx, attachment, viewerWallet);
    if (!policy.canView) {
      throw new NotFoundError("Attachment not found.");
    }
    if (
      attachment.uploadedByWallet !== viewerWallet &&
      policy.viewerRole !== "admin" &&
      policy.viewerRole !== "client"
    ) {
      throw new NotFoundError("Attachment not found.");
    }

    return await ctx.db
      .query("attachmentAccessLogs")
      .withIndex("by_attachment", (q) => q.eq("attachmentId", args.attachmentId))
      .order("desc")
      .take(100);
  },
});
