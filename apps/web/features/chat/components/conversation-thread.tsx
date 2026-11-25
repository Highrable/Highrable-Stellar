"use client";

import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import {
  AttachmentFileIcon,
  AttachmentTypeBadge,
  AttachmentUploader,
} from "@/features/attachments/components";
import { formatAttachmentSize } from "@/features/attachments/lib";
import { getReadableChatError } from "@/features/chat/lib/errors";
import { sanitizeMultilineInput, showWarningToast } from "@/features/common";
import { useSocialSession } from "@/features/newsfeed/session";
import { api } from "@repo/convex-client";
import { HighrableV2Badge } from "@repo/ui/components/highrable/v2-marketing";
import { V2_BUTTON_PRIMARY_CLASS } from "@repo/ui/components/highrable/v2-theme";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button as AppButton } from "@repo/ui/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  CircleDot,
  ExternalLink,
  Loader2,
  MessageCircle,
  Paperclip,
  Reply,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import type { TDraftAttachment } from "@/features/attachments/types";
import type { TConvexDoc, TConvexId } from "@repo/convex-client";
import type { KeyboardEvent } from "react";

type TConversationParentType =
  | "job"
  | "micro_gig"
  | "milestone"
  | "escrow"
  | "work_submission"
  | "dispute"
  | "direct";

interface IConversationThreadProps {
  parentType: TConversationParentType;
  parentId: string;
  title?: string;
}

type TMessageWithAttachments = TConvexDoc<"messages"> & {
  attachments: Array<TConvexDoc<"attachments"> & { url?: string | null }>;
  senderProfile?: TMessageSenderProfile | null;
};

type TMessageAttachment = TMessageWithAttachments["attachments"][number];

type TMessageSenderProfile = {
  walletAddress: string;
  displayName: string;
  avatarUrl?: string;
};

interface IMessageAttachmentListProps {
  attachments: readonly TMessageAttachment[];
  isOwnMessage: boolean;
}

interface IMessageComposerProps {
  conversationId: TConvexId<"conversations">;
  disabled?: boolean;
  senderRole: "client" | "freelancer";
  replyToMessage: TReplyTarget | null;
  onCancelReply: () => void;
}

interface IMessageBubbleProps {
  message: TMessageWithAttachments;
  currentWallet: string;
  replyToMessage: TReplyTarget | null;
  onReply: (message: TMessageWithAttachments) => void;
  onError: (message: string) => void;
}

type TReplyTarget = Pick<
  TMessageWithAttachments,
  "_id" | "body" | "senderRole" | "senderWallet" | "attachmentIds" | "senderProfile"
>;

const MAX_MESSAGE_BODY_LENGTH = 4000;
const MAX_REPLY_PREVIEW_LENGTH = 86;

const TMessageBodySchema = z
  .string()
  .max(MAX_MESSAGE_BODY_LENGTH, `Message must be ${MAX_MESSAGE_BODY_LENGTH} characters or fewer.`)
  .transform(sanitizeMultilineInput);

type TComposerValidationResult =
  | {
      isValid: true;
      body: string;
    }
  | {
      isValid: false;
      error: string;
    };

function validateComposerPayload(input: {
  body: string;
  readyAttachmentCount: number;
}): TComposerValidationResult {
  const parsedBody = TMessageBodySchema.safeParse(input.body);
  if (!parsedBody.success) {
    return {
      isValid: false,
      error: parsedBody.error.issues[0]?.message ?? "Message is invalid.",
    };
  }

  if (parsedBody.data.length === 0 && input.readyAttachmentCount === 0) {
    return {
      isValid: false,
      error: "Write a message or attach a file before sending.",
    };
  }

  return {
    isValid: true,
    body: parsedBody.data,
  };
}

function getReplyPreview(message: TReplyTarget): string {
  const body = message.body.trim().replace(/\s+/g, " ");
  if (body.length > 0) {
    return body.length > MAX_REPLY_PREVIEW_LENGTH
      ? `${body.slice(0, MAX_REPLY_PREVIEW_LENGTH - 3)}...`
      : body;
  }

  if (message.attachmentIds.length > 0) {
    return `${message.attachmentIds.length} attachment${message.attachmentIds.length === 1 ? "" : "s"}`;
  }

  return "Message";
}

function formatMessageTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function getSenderLabel(message: TMessageWithAttachments, isOwnMessage: boolean): string {
  if (message.senderProfile?.displayName) {
    return message.senderProfile.displayName;
  }

  if (isOwnMessage) {
    return "You";
  }
  return message.senderRole === "client" ? "Client" : "Freelancer";
}

function getReplySenderLabel(message: TReplyTarget): string {
  return (
    message.senderProfile?.displayName ??
    (message.senderRole === "client" ? "Client" : "Freelancer")
  );
}

function getSafeAvatarUrl(avatarUrl: string | undefined): string | undefined {
  const sanitizedUrl = avatarUrl?.trim();

  if (!sanitizedUrl) {
    return undefined;
  }

  if (sanitizedUrl.startsWith("/")) {
    return sanitizedUrl;
  }

  try {
    const parsedUrl = new URL(sanitizedUrl);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:"
      ? parsedUrl.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function shouldShowDateDivider(
  message: TMessageWithAttachments,
  previousMessage?: TMessageWithAttachments,
): boolean {
  if (!previousMessage) {
    return true;
  }

  return (
    new Date(message.createdAt).toDateString() !==
    new Date(previousMessage.createdAt).toDateString()
  );
}

function isPreviewableImage(attachment: TMessageAttachment): boolean {
  return attachment.type === "image" && Boolean(attachment.url);
}

function isPreviewableVideo(attachment: TMessageAttachment): boolean {
  return attachment.type === "video" && Boolean(attachment.url);
}

function getAttachmentHref(attachment: TMessageAttachment): string | null {
  return attachment.externalUrl ?? attachment.url ?? null;
}

function WalletTypeBadge({ walletType }: { walletType?: string }) {
  if (!walletType || walletType === "system") {
    return null;
  }

  return (
    <HighrableV2Badge className="px-2 py-0 text-[0.55rem]">
      {walletType === "passkey_smart_account" ? "Passkey" : "Wallet"}
    </HighrableV2Badge>
  );
}

function SystemMessage({ message }: { message: TMessageWithAttachments }) {
  return (
    <div className="mx-auto flex max-w-[88%] items-center gap-2 rounded-xl border border-(--mode-border) bg-(--mode-soft) px-3 py-2 text-center">
      <CircleDot className="hr-mode-text h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-left">
        <p className="text-xs leading-snug font-medium text-foreground">{message.body}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatMessageTimestamp(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function MessageAvatar({
  avatarUrl,
  isOwnMessage,
  label,
}: {
  avatarUrl?: string;
  isOwnMessage: boolean;
  label: string;
}) {
  const safeAvatarUrl = getSafeAvatarUrl(avatarUrl);

  return (
    <Avatar
      className={cn(
        "h-9 w-9 shrink-0 rounded-full border",
        isOwnMessage
          ? "border-(--mode-border) bg-(--mode-solid) text-[var(--mode-on)]"
          : "border-(--mode-border) bg-(--mode-soft) text-(--mode-text)",
      )}
      role="img"
      aria-label={`${label} avatar`}
    >
      {safeAvatarUrl ? <AvatarImage src={safeAvatarUrl} alt={`${label} avatar`} /> : null}
      <AvatarFallback
        className={cn(
          "rounded-full",
          isOwnMessage
            ? "bg-(--mode-solid) text-[var(--mode-on)]"
            : "bg-(--mode-soft) text-(--mode-text)",
        )}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}

function DateDivider({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const label =
    date.toDateString() === today.toDateString()
      ? "Today"
      : date.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
          }).format(date);

  return (
    <div className="flex justify-center py-1">
      <p className="rounded-full border border-border bg-card px-3 py-1 text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase shadow-sm">
        {label}
      </p>
    </div>
  );
}

function InlineAttachmentPreview({
  attachment,
  isOwnMessage,
}: {
  attachment: TMessageAttachment;
  isOwnMessage: boolean;
}) {
  const href = getAttachmentHref(attachment);
  const meta = [formatAttachmentSize(attachment.size), attachment.mimeType]
    .filter(Boolean)
    .join(" · ");

  if (isPreviewableImage(attachment)) {
    return (
      <figure className="overflow-hidden rounded-xl border border-border bg-card">
        <img
          src={attachment.url ?? undefined}
          alt={attachment.name}
          loading="lazy"
          className="max-h-56 w-full bg-muted object-contain"
        />
        <figcaption className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
          <span className="truncate text-xs font-medium text-foreground">{attachment.name}</span>
          <AttachmentTypeBadge type={attachment.type} />
        </figcaption>
      </figure>
    );
  }

  if (isPreviewableVideo(attachment)) {
    return (
      <figure className="overflow-hidden rounded-xl border border-border bg-card">
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Chat uploads do not collect caption tracks yet. */}
        <video
          controls
          preload="metadata"
          className="max-h-56 w-full bg-black"
          aria-label={attachment.name}
        >
          <source src={attachment.url ?? undefined} type={attachment.mimeType ?? undefined} />
        </video>
        <figcaption className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
          <span className="truncate text-xs font-medium text-foreground">{attachment.name}</span>
          <AttachmentTypeBadge type={attachment.type} />
        </figcaption>
      </figure>
    );
  }

  return (
    <a
      href={href ?? undefined}
      target={href ? "_blank" : undefined}
      rel={href ? "noreferrer" : undefined}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
        isOwnMessage
          ? "border-white/20 bg-white/10 text-current hover:bg-white/15"
          : "border-border bg-card text-foreground hover:border-(--mode-border)"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center border ${
          isOwnMessage ? "border-white/20 bg-white/10" : "border-border bg-muted"
        }`}
      >
        <AttachmentFileIcon type={attachment.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{attachment.name}</span>
        <span
          className={`mt-0.5 block font-mono text-[0.68rem] ${isOwnMessage ? "text-current/70" : "text-muted-foreground"}`}
        >
          {meta || "Link"}
        </span>
      </span>
      {href ? <ExternalLink className="h-4 w-4 shrink-0" /> : null}
    </a>
  );
}

function MessageAttachmentList({ attachments, isOwnMessage }: IMessageAttachmentListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((attachment) => (
        <InlineAttachmentPreview
          key={attachment._id}
          attachment={attachment}
          isOwnMessage={isOwnMessage}
        />
      ))}
    </div>
  );
}

function ReplyPreview({
  replyToMessage,
  isOwnMessage,
}: {
  replyToMessage: TReplyTarget | null;
  isOwnMessage: boolean;
}) {
  if (!replyToMessage) {
    return null;
  }

  return (
    <div
      className={`mb-2 rounded-lg border-l-2 py-1.5 pr-2 pl-2 ${
        isOwnMessage
          ? "border-black/20 bg-black/5 text-[var(--mode-on)]/90"
          : "border-(--mode-text) bg-(--mode-soft) text-foreground"
      }`}
    >
      <p className="text-xs opacity-80">Replying to {getReplySenderLabel(replyToMessage)}</p>
      <p className="mt-0.5 line-clamp-2 text-[0.72rem] leading-snug">
        {getReplyPreview(replyToMessage)}
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  currentWallet,
  replyToMessage,
  onReply,
  onError,
}: IMessageBubbleProps) {
  const { token } = useSocialSession();
  const deleteMessage = useMutation(api.conversations.softDeleteMessage);
  if (message.kind !== "user") {
    return <SystemMessage message={message} />;
  }

  const isOwnMessage = message.senderWallet === currentWallet.toUpperCase();
  const senderLabel = getSenderLabel(message, isOwnMessage);

  return (
    <div className={`flex items-end gap-2 ${isOwnMessage ? "justify-end" : "justify-start"}`}>
      {!isOwnMessage ? (
        <MessageAvatar
          avatarUrl={message.senderProfile?.avatarUrl}
          isOwnMessage={false}
          label={senderLabel}
        />
      ) : null}
      <div
        className={`flex max-w-[min(82%,38rem)] flex-col ${isOwnMessage ? "items-end" : "items-start"}`}
      >
        <article
          className={`group w-fit max-w-full rounded-[20px] border px-4 py-3 shadow-sm ${
            isOwnMessage
              ? "hr-gradient-primary rounded-br-sm border-transparent text-[var(--mode-on)]"
              : "rounded-bl-sm border-border bg-card text-foreground"
          }`}
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold opacity-80">{senderLabel}</span>
            <WalletTypeBadge walletType={message.senderWalletType} />
          </div>
          <ReplyPreview replyToMessage={replyToMessage} isOwnMessage={isOwnMessage} />
          {message.status === "deleted" ? (
            <p
              className={
                isOwnMessage
                  ? "text-sm text-current/70 italic"
                  : "text-sm text-muted-foreground italic"
              }
            >
              Message deleted.
            </p>
          ) : message.body.trim() ? (
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {message.body}
            </p>
          ) : null}
          <MessageAttachmentList attachments={message.attachments} isOwnMessage={isOwnMessage} />
          {message.status !== "deleted" ? (
            <div
              className={`mt-2 flex gap-3 text-xs ${isOwnMessage ? "text-current/80" : "text-muted-foreground"}`}
            >
              <button
                type="button"
                onClick={() => onReply(message)}
                className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Reply className="mr-1 inline h-3 w-3" /> Reply
              </button>
              {isOwnMessage ? (
                <button
                  type="button"
                  onClick={() => {
                    void deleteMessage({ messageId: message._id, sessionToken: token }).catch(
                      (caughtError) =>
                        onError(getReadableChatError(caughtError, "Message could not be deleted.")),
                    );
                  }}
                  className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </article>
        <p className="mt-1.5 px-2 text-xs text-muted-foreground">
          {formatMessageTimestamp(message.createdAt)}
        </p>
      </div>
      {isOwnMessage ? (
        <MessageAvatar
          avatarUrl={message.senderProfile?.avatarUrl}
          isOwnMessage
          label={senderLabel}
        />
      ) : null}
    </div>
  );
}

function EmptyConversationState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
      <div className="hr-mode-text mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-(--mode-border) bg-(--mode-soft)">
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">No messages yet.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Start with a short update or attach a file for the work context.
      </p>
    </div>
  );
}

function MessageComposer({
  conversationId,
  disabled,
  senderRole,
  replyToMessage,
  onCancelReply,
}: IMessageComposerProps) {
  const walletIdentity = useHighrableWalletIdentity();
  const { token } = useSocialSession();
  const sendMessage = useMutation(api.conversations.sendMessage);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<TDraftAttachment[]>([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyAttachmentIds = useMemo(
    () =>
      attachments
        .filter((attachment) => attachment.status === "ready")
        .map((attachment) => attachment.id as TConvexId<"attachments">),
    [attachments],
  );
  const hasUploadingAttachments = attachments.some(
    (attachment) => attachment.status === "uploading",
  );
  const sanitizedBody = sanitizeMultilineInput(body);
  const canSend = sanitizedBody.length > 0 || readyAttachmentIds.length > 0;

  const handleSend = async () => {
    if (!walletIdentity.walletAddress || !walletIdentity.walletType || !token) {
      const nextWarning = "Verify your wallet session before sending a message.";
      setError(nextWarning);
      showWarningToast(nextWarning);
      return;
    }

    const validatedPayload = validateComposerPayload({
      body,
      readyAttachmentCount: readyAttachmentIds.length,
    });
    if (!validatedPayload.isValid) {
      setError(validatedPayload.error);
      showWarningToast(validatedPayload.error);
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      await sendMessage({
        conversationId,
        sessionToken: token,
        body: validatedPayload.body,
        attachmentIds: readyAttachmentIds,
        ...(replyToMessage ? { replyToMessageId: replyToMessage._id } : {}),
      });
      setBody("");
      setAttachments([]);
      setShowAttachments(false);
      onCancelReply();
    } catch (error) {
      setError(getReadableChatError(error, "One or more attachments could not be sent."));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSending && !hasUploadingAttachments) {
        void handleSend();
      }
    }
  };

  return (
    <div className="space-y-2 border-t border-border bg-card pt-3">
      {showAttachments ? (
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-border bg-muted p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="hr-text-muted text-xs">Attachments</p>
            <AppButton
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowAttachments(false)}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-card"
              aria-label="Hide attachments"
            >
              <X className="h-4 w-4" />
            </AppButton>
          </div>
          <AttachmentUploader
            value={attachments}
            onChange={setAttachments}
            disabled={disabled || isSending}
            ownerRole={senderRole}
            context="chat"
          />
        </div>
      ) : null}

      <div className="flex items-end gap-2 rounded-2xl border border-input bg-muted/40 p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
        <AppButton
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || isSending}
          onClick={() => setShowAttachments((current) => !current)}
          className={`h-10 w-10 shrink-0 rounded-xl border-0 ${
            showAttachments || readyAttachmentIds.length > 0
              ? "hr-mode-text border-highrable-orange-2 bg-accent hover:bg-accent"
              : "border-input bg-card text-muted-foreground hover:bg-muted"
          }`}
          aria-label={showAttachments ? "Hide attachment uploader" : "Show attachment uploader"}
        >
          <Paperclip className="h-4 w-4" />
        </AppButton>
        <Textarea
          value={body}
          disabled={disabled || isSending}
          onChange={(event) => {
            setBody(event.target.value.slice(0, MAX_MESSAGE_BODY_LENGTH));
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Write a secure work update..."
          aria-label="Message text"
          rows={1}
          maxLength={MAX_MESSAGE_BODY_LENGTH}
          className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm leading-5 shadow-none focus-visible:ring-0"
        />
        <AppButton
          type="button"
          disabled={disabled || isSending || hasUploadingAttachments || !canSend}
          onClick={() => void handleSend()}
          className={cn(
            V2_BUTTON_PRIMARY_CLASS,
            "h-10 w-10 shrink-0 rounded-xl p-0 text-primary-foreground shadow-none disabled:cursor-not-allowed disabled:opacity-60",
          )}
          aria-label="Send message"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </AppButton>
      </div>
      {readyAttachmentIds.length > 0 && !showAttachments ? (
        <p className="hr-mode-text px-12 text-[0.7rem]">
          {readyAttachmentIds.length} attachment{readyAttachmentIds.length === 1 ? "" : "s"} ready
          to send.
        </p>
      ) : null}
      {replyToMessage ? (
        <div className="mx-12 flex items-start gap-2 rounded-xl border border-(--mode-border) bg-(--mode-soft) px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-(--mode-text)">
              Replying to {getReplySenderLabel(replyToMessage)}
            </p>
            <p className="mt-0.5 truncate text-xs text-foreground">
              {getReplyPreview(replyToMessage)}
            </p>
          </div>
          <AppButton
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancelReply}
            className="h-7 w-7 shrink-0 rounded-lg text-(--mode-text) hover:bg-(--mode-soft-2)"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </AppButton>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-12">
        {error ? <p className="text-sm text-red-700">{error}</p> : <span />}
        <p className="font-mono text-[0.62rem] text-muted-foreground">
          {sanitizedBody.length}/{MAX_MESSAGE_BODY_LENGTH}
        </p>
      </div>
    </div>
  );
}

export function ConversationThread({ parentType, parentId, title }: IConversationThreadProps) {
  const walletIdentity = useHighrableWalletIdentity();
  const { token } = useSocialSession();
  const getOrCreateConversation = useMutation(api.conversations.getOrCreateConversationForParent);
  const markConversationRead = useMutation(api.conversations.markConversationRead);
  const [conversationId, setConversationId] = useState<TConvexId<"conversations"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<TReplyTarget | null>(null);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const viewerWallet = walletIdentity.walletAddress;
  const conversation = useQuery(
    api.conversations.getConversationByParent,
    token
      ? {
          parentType,
          parentId,
          sessionToken: token,
        }
      : "skip",
  );
  const activeConversationId = conversation?._id ?? conversationId;
  const {
    results,
    status: messageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.conversations.getMessagesPage,
    activeConversationId && token
      ? {
          conversationId: activeConversationId,
          sessionToken: token,
        }
      : "skip",
    { initialNumItems: 50 },
  );
  const messages = useMemo(
    () =>
      [...(results as TMessageWithAttachments[])].sort(
        (left, right) => left.createdAt - right.createdAt,
      ),
    [results],
  );
  const messagesById = useMemo(() => {
    const byId = new Map<string, TMessageWithAttachments>();
    for (const message of messages ?? []) {
      byId.set(message._id, message);
    }
    return byId;
  }, [messages]);
  const latestMessageId = messages.at(-1)?._id;
  const isReadOnly = conversation?.status === "locked" || conversation?.status === "archived";
  const readOnlyMessage =
    conversation?.status === "locked"
      ? "This conversation is locked. New messages are unavailable."
      : "This conversation is archived. New messages are unavailable.";

  useEffect(() => {
    if (!token || activeConversationId) {
      return;
    }

    let cancelled = false;
    void getOrCreateConversation({
      parentType,
      parentId,
      sessionToken: token,
      ...(title ? { title } : {}),
    })
      .then((id) => {
        if (!cancelled) setConversationId(id);
      })
      .catch((error) => {
        if (!cancelled)
          setError(
            getReadableChatError(
              error,
              "Only the client and assigned freelancer can use this chat.",
            ),
          );
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, getOrCreateConversation, parentId, parentType, title, token]);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: "end" });
  }, [activeConversationId, latestMessageId]);

  useEffect(() => {
    if (!activeConversationId || !token) {
      return;
    }
    void markConversationRead({
      conversationId: activeConversationId,
      sessionToken: token,
      ...(conversation?.lastMessageId ? { lastReadMessageId: conversation.lastMessageId } : {}),
    });
  }, [activeConversationId, conversation?.lastMessageId, markConversationRead, token]);

  const senderRole =
    viewerWallet && conversation?.clientWallet?.toUpperCase() === viewerWallet.toUpperCase()
      ? "client"
      : "freelancer";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <AppButton
          type="button"
          data-product-ui="preserve"
          aria-label="Open work chat"
          className={cn(
            V2_BUTTON_PRIMARY_CLASS,
            "h-11 rounded-xl px-5 text-sm font-semibold shadow-sm",
          )}
        >
          <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          Messages
        </AppButton>
      </SheetTrigger>
      <SheetContent
        data-product-ui="preserve"
        side="right"
        className="w-full gap-0 border-l border-border bg-background p-0 sm:max-w-[480px]"
        aria-describedby="work-chat-description"
        showCloseButton={false}
      >
        <SheetHeader className="flex-row items-start justify-between gap-3 border-b bg-card p-5">
          <div className="min-w-0 flex-1">
            <SheetTitle className="hr-text-primary truncate text-base font-semibold">
              {title ?? "Work chat"}
            </SheetTitle>
            <SheetDescription
              id="work-chat-description"
              className="hr-text-secondary mt-0.5 text-xs"
            >
              Only the client and freelancer on this work can read these messages.
              {conversation?.status ? ` Status: ${conversation.status}.` : null}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <AppButton
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Close work chat"
            >
              <X className="h-4 w-4" />
            </AppButton>
          </SheetClose>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          {!token ? (
            <p
              role="status"
              className="m-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
            >
              Verify your wallet session to view messages.
            </p>
          ) : error ? (
            <p
              role="alert"
              className="m-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground"
            >
              {error}
            </p>
          ) : !activeConversationId || messageStatus === "LoadingFirstPage" ? (
            <p role="status" className="p-4 text-sm text-muted-foreground">
              Loading conversation...
            </p>
          ) : (
            <>
              <div
                className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-background/70 p-4 sm:p-5"
                aria-live="polite"
              >
                {messageStatus === "CanLoadMore" ? (
                  <div className="text-center">
                    <AppButton
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => loadMore(50)}
                    >
                      Load older messages
                    </AppButton>
                  </div>
                ) : null}
                {messageStatus === "LoadingMore" ? (
                  <p role="status" className="text-center text-xs text-muted-foreground">
                    Loading older messages…
                  </p>
                ) : null}
                {messages.length === 0 ? (
                  <EmptyConversationState />
                ) : (
                  messages.map((message, index) => (
                    <div key={message._id} className="space-y-3">
                      {shouldShowDateDivider(message, messages[index - 1]) ? (
                        <DateDivider timestamp={message.createdAt} />
                      ) : null}
                      <MessageBubble
                        message={message}
                        currentWallet={viewerWallet ?? ""}
                        replyToMessage={
                          message.replyToMessageId
                            ? (messagesById.get(message.replyToMessageId) ?? null)
                            : null
                        }
                        onReply={setReplyToMessage}
                        onError={setError}
                      />
                    </div>
                  ))
                )}
                <div ref={latestMessageRef} />
              </div>
              <div className="bg-card px-4 pb-4">
                {isReadOnly ? (
                  <p
                    role="status"
                    className="mb-3 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
                  >
                    {readOnlyMessage}
                  </p>
                ) : null}
                <MessageComposer
                  conversationId={activeConversationId}
                  disabled={isReadOnly}
                  senderRole={senderRole}
                  replyToMessage={replyToMessage}
                  onCancelReply={() => setReplyToMessage(null)}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
