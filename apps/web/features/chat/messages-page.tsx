"use client";

import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import {
  AttachmentFileIcon,
  AttachmentPreviewCard,
  AttachmentTypeBadge,
  AttachmentUploader,
} from "@/features/attachments/components";
import { formatAttachmentSize } from "@/features/attachments/lib";
import { getReadableChatError } from "@/features/chat/lib/errors";
import { ProductPageHero } from "@/features/common/components/layout/product-page-hero";
import { SocialSession, useSocialSession } from "@/features/newsfeed/session";
import { api, type TConvexId } from "@repo/convex-client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  Loader2,
  MessageCircle,
  PenLine,
  Paperclip,
  Plus,
  Search,
  Send,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Component, useEffect, useMemo, useState } from "react";

import type {
  TAttachmentProtectionSummary,
  TAttachmentType,
  TDraftAttachment,
} from "@/features/attachments/types";
import type { TConvexDoc } from "@repo/convex-client";

type TConversation = TConvexDoc<"conversations"> & {
  unread: boolean;
  participantProfiles: Array<{ walletAddress: string; displayName: string; avatarUrl?: string }>;
};
type TMessage = TConvexDoc<"messages"> & {
  attachments: Array<
    TConvexDoc<"attachments"> & {
      url?: string | null;
      protection?: TAttachmentProtectionSummary;
    }
  >;
  senderProfile?: { walletAddress: string; displayName: string; avatarUrl?: string } | null;
};
type TMessageAttachment = TMessage["attachments"][number];
type TPerson = { userId: TConvexId<"users">; name: string; headline?: string; avatarUrl?: string };

class MessagesErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="w-full max-w-4xl space-y-6">
          <ProductPageHero title="Messages" meta="Inbox" />
          <section className="hr-card-surface space-y-4 rounded-3xl p-5 sm:p-7">
            <div>
              <h2 className="text-lg font-semibold">Messages could not be loaded</h2>
              <p role="alert" className="mt-2 text-sm text-destructive">
                {getReadableChatError(
                  this.state.error,
                  "Your session may have expired. Reconnect and verify your wallet, then reload messages.",
                )}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Reload messages
            </Button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 5)}…${wallet.slice(-4)}`;
}

function MessageAttachment({ attachment }: { attachment: TMessageAttachment }) {
  const href = attachment.externalUrl ?? attachment.url ?? undefined;

  if (
    attachment.protection?.isProtected ||
    (attachment.type !== "image" && attachment.type !== "video")
  ) {
    return <AttachmentPreviewCard attachment={attachment} readOnly />;
  }

  if (attachment.type === "image" && attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-xl border border-border bg-card"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          loading="lazy"
          className="max-h-72 w-full bg-muted object-contain"
        />
        <span className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="truncate text-xs font-medium">{attachment.name}</span>
          <AttachmentTypeBadge type={attachment.type as TAttachmentType} />
        </span>
      </a>
    );
  }

  if (attachment.type === "video" && attachment.url) {
    return (
      <figure className="overflow-hidden rounded-xl border border-border bg-card">
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Chat uploads do not collect caption tracks yet. */}
        <video
          controls
          preload="metadata"
          className="max-h-72 w-full bg-black"
          aria-label={attachment.name}
        >
          <source src={attachment.url} type={attachment.mimeType ?? undefined} />
        </video>
        <figcaption className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="truncate text-xs font-medium">{attachment.name}</span>
          <AttachmentTypeBadge type={attachment.type as TAttachmentType} />
        </figcaption>
      </figure>
    );
  }

  return (
    <a
      href={href}
      target={href ? "_blank" : undefined}
      rel={href ? "noreferrer" : undefined}
      className="flex min-w-48 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 hover:border-primary/50"
    >
      <AttachmentFileIcon type={attachment.type as TAttachmentType} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.name}</span>
        <span className="block truncate text-[0.68rem] text-muted-foreground">
          {[formatAttachmentSize(attachment.size), attachment.mimeType].filter(Boolean).join(" · ")}
        </span>
      </span>
      <AttachmentTypeBadge type={attachment.type as TAttachmentType} />
    </a>
  );
}

function conversationLabel(conversation: TConversation, wallet: string) {
  if (conversation.parentType === "group") return conversation.title || "Group conversation";
  if (conversation.parentType === "direct") {
    return (
      conversation.participantProfiles.find(
        (participant) => participant.walletAddress.toUpperCase() !== wallet.toUpperCase(),
      )?.displayName ?? "Direct conversation"
    );
  }
  return conversation.title || "Work conversation";
}

function relativePreview(conversation: TConversation) {
  return conversation.lastMessagePreview || "No messages yet";
}

function conversationProfile(conversation: TConversation, wallet: string) {
  return conversation.parentType === "direct"
    ? conversation.participantProfiles.find(
        (participant) => participant.walletAddress.toUpperCase() !== wallet.toUpperCase(),
      )
    : undefined;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function conversationTimestamp(conversation: TConversation) {
  const timestamp = conversation.lastMessageAt ?? conversation.updatedAt;
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function messageTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(timestamp),
  );
}

function messageDateLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function ConversationAvatar({
  conversation,
  wallet,
}: {
  conversation: TConversation;
  wallet: string;
}) {
  const profile = conversationProfile(conversation, wallet);
  const label = profile?.displayName ?? conversationLabel(conversation, wallet);

  return (
    <Avatar className="size-12 shrink-0 border border-border" aria-hidden="true">
      {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={`${label} avatar`} /> : null}
      <AvatarFallback className="bg-muted text-muted-foreground">
        {profile?.displayName ? (
          initials(profile.displayName)
        ) : (
          <Users className="size-5" aria-hidden="true" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

function MessageAvatar({ profile, label }: { profile?: TMessage["senderProfile"]; label: string }) {
  return (
    <Avatar
      className="mb-5 size-10 shrink-0 border border-border"
      role="img"
      aria-label={`${label} avatar`}
    >
      {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={`${label} avatar`} /> : null}
      <AvatarFallback className="bg-muted text-muted-foreground">
        {profile?.displayName ? (
          initials(profile.displayName)
        ) : (
          <UserRound className="size-4" aria-hidden="true" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

function SearchPeople({
  token,
  onStartDirect,
  onStartGroup,
}: {
  token: string;
  onStartDirect: (person: TPerson, conversationId: TConvexId<"conversations">) => void;
  onStartGroup: (conversationId: TConvexId<"conversations">) => void;
}) {
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<TPerson[]>([]);
  const [groupName, setGroupName] = useState("");
  const [showGroup, setShowGroup] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const people = useQuery(
    api.conversations.searchPeople,
    token && term.trim().length >= 2 ? { sessionToken: token, term } : "skip",
  ) as TPerson[] | undefined;
  const startDirect = useMutation(api.conversations.startDirectConversation);
  const createGroup = useMutation(api.conversations.createGroupConversation);

  const togglePerson = (person: TPerson) => {
    setSelected((current) =>
      current.some((candidate) => candidate.userId === person.userId)
        ? current.filter((candidate) => candidate.userId !== person.userId)
        : [...current, person],
    );
  };

  const handleDirect = async (person: TPerson) => {
    setBusy(true);
    setError("");
    try {
      const conversationId = await startDirect({ sessionToken: token, otherUserId: person.userId });
      onStartDirect(person, conversationId);
      setTerm("");
    } catch (caught) {
      setError(getReadableChatError(caught, "Could not start this conversation."));
    } finally {
      setBusy(false);
    }
  };

  const handleGroup = async () => {
    if (!groupName.trim()) {
      setError("Enter a group name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const conversationId = await createGroup({
        sessionToken: token,
        title: groupName,
        memberUserIds: selected.map((person) => person.userId),
      });
      setSelected([]);
      setGroupName("");
      setShowGroup(false);
      setTerm("");
      onStartGroup(conversationId);
    } catch (caught) {
      setError(getReadableChatError(caught, "Could not create the group."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-background/80 p-3"
      aria-label="Start a conversation"
    >
      <div className="flex gap-2">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Find a Highrable member"
          aria-label="Search registered people"
          className="min-w-0"
        />
        <Button
          type="button"
          variant="outline"
          aria-expanded={showGroup}
          onClick={() => setShowGroup((value) => !value)}
          className="shrink-0"
        >
          <Users className="mr-2 size-4" aria-hidden="true" /> Group
        </Button>
      </div>
      {showGroup ? (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4">
          <label className="sr-only" htmlFor="new-group-name">
            Group name
          </label>
          <Input
            id="new-group-name"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Group name"
            maxLength={80}
          />
          <p className="text-xs text-muted-foreground">
            Select members from the search results. You can manage membership after creating the
            group.
          </p>
          <Button type="button" size="sm" disabled={busy} onClick={() => void handleGroup()}>
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Create group{selected.length ? ` · ${selected.length + 1} members` : ""}
          </Button>
        </div>
      ) : null}
      {term.trim().length >= 2 ? (
        people === undefined ? (
          <p role="status" className="text-sm text-muted-foreground">
            Searching people…
          </p>
        ) : people.length ? (
          <ul className="max-h-52 space-y-1 overflow-y-auto" aria-label="Registered people">
            {people.map((person) => {
              const isSelected = selected.some((candidate) => candidate.userId === person.userId);
              return (
                <li
                  key={person.userId}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-muted"
                >
                  {showGroup ? (
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => togglePerson(person)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="grid size-5 shrink-0 place-items-center rounded border"
                        aria-hidden="true"
                      >
                        {isSelected ? <Check className="size-3" /> : null}
                      </span>
                      <Avatar className="size-8 shrink-0" aria-hidden="true">
                        {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="text-[0.65rem]">
                          {initials(person.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate text-sm">{person.name}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDirect(person)}
                      disabled={busy}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    >
                      <MessageCircle
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Avatar className="size-8 shrink-0" aria-hidden="true">
                        {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="text-[0.65rem]">
                          {initials(person.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{person.name}</span>
                      {person.headline ? (
                        <span className="hidden truncate text-xs text-muted-foreground sm:block">
                          {person.headline}
                        </span>
                      ) : null}
                    </button>
                  )}
                  {!showGroup ? <span className="sr-only">Start direct conversation</span> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No registered people matched that search.</p>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function MemberManager({
  conversation,
  token,
  onLeave,
}: {
  conversation: TConversation;
  token: string;
  onLeave: () => void;
}) {
  const wallet = useHighrableWalletIdentity().walletAddress?.toUpperCase() ?? "";
  const [term, setTerm] = useState("");
  const [error, setError] = useState("");
  const participants = useQuery(
    api.conversations.getConversationParticipants,
    token ? { conversationId: conversation._id, sessionToken: token } : "skip",
  );
  const people = useQuery(
    api.conversations.searchPeople,
    token && term.trim().length >= 2
      ? { sessionToken: token, term, conversationId: conversation._id }
      : "skip",
  ) as TPerson[] | undefined;
  const changeMembers = useMutation(api.conversations.changeGroupMembers);
  const transferOwner = useMutation(api.conversations.transferGroupOwnership);
  const leaveGroup = useMutation(api.conversations.leaveGroupConversation);
  if (conversation.parentType !== "group") return null;
  const isOwner = conversation.groupOwnerWallet === wallet;
  const activeWallets = participants?.participantWallets ?? [];
  const available = people ?? [];
  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(getReadableChatError(caught, "Group membership could not be changed."));
    }
  };

  return (
    <details className="border-b border-border bg-card px-4 py-3">
      <summary className="cursor-pointer rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Group members · {activeWallets.length}
      </summary>
      <div className="mt-3 space-y-3">
        <ul className="space-y-2">
          {activeWallets.map((memberWallet) => {
            const member = conversation.participantProfiles.find(
              (profile) => profile.walletAddress === memberWallet,
            );
            const isMemberOwner = memberWallet === conversation.groupOwnerWallet;
            return (
              <li key={memberWallet} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {member?.displayName ?? shortWallet(memberWallet)}
                  {isMemberOwner ? " · creator" : ""}
                </span>
                {isOwner && memberWallet !== wallet ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        void run(() =>
                          transferOwner({
                            sessionToken: token,
                            conversationId: conversation._id,
                            newOwnerWallet: memberWallet,
                          }),
                        )
                      }
                    >
                      Make creator
                    </button>
                    <button
                      type="button"
                      className="text-destructive underline"
                      onClick={() =>
                        void run(() =>
                          changeMembers({
                            sessionToken: token,
                            conversationId: conversation._id,
                            addUserIds: [],
                            removeWallets: [memberWallet],
                          }),
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {isOwner ? (
          <div className="space-y-2">
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search people to add"
              aria-label="Search people to add to group"
            />
            {available.length ? (
              <ul className="space-y-1">
                {available.map((person) => (
                  <li key={person.userId}>
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() =>
                        void run(() =>
                          changeMembers({
                            sessionToken: token,
                            conversationId: conversation._id,
                            addUserIds: [person.userId],
                            removeWallets: [],
                          }),
                        )
                      }
                    >
                      Add {person.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void run(async () => {
              await leaveGroup({ sessionToken: token, conversationId: conversation._id });
              onLeave();
            })
          }
        >
          Leave group
        </Button>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function ConversationPane({
  conversation,
  token,
  onBack,
  onLeave,
}: {
  conversation: TConversation;
  token: string;
  onBack: () => void;
  onLeave: () => void;
}) {
  const wallet = useHighrableWalletIdentity().walletAddress?.toUpperCase() ?? "";
  const isReadOnly = conversation.status === "locked" || conversation.status === "archived";
  const readOnlyMessage =
    conversation.status === "locked"
      ? "This conversation is locked. New messages are unavailable."
      : "This conversation is archived. New messages are unavailable.";
  const markRead = useMutation(api.conversations.markConversationRead);
  const sendMessage = useMutation(api.conversations.sendMessage);
  const deleteMessage = useMutation(api.conversations.softDeleteMessage);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<TDraftAttachment[]>([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const [replyTo, setReplyTo] = useState<TMessage | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
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
  const { results, status, loadMore } = usePaginatedQuery(
    api.conversations.getMessagesPage,
    token ? { conversationId: conversation._id, sessionToken: token } : "skip",
    { initialNumItems: 30 },
  );
  const messages = useMemo(
    () => [...(results as TMessage[])].sort((a, b) => a.createdAt - b.createdAt),
    [results],
  );
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message._id, message])),
    [messages],
  );

  useEffect(() => {
    if (!token || !conversation.lastMessageId) return;
    void markRead({
      conversationId: conversation._id,
      sessionToken: token,
      lastReadMessageId: conversation.lastMessageId,
    });
  }, [conversation._id, conversation.lastMessageId, markRead, token]);

  const submit = async () => {
    if (isReadOnly || (!body.trim() && readyAttachmentIds.length === 0)) return;
    setSending(true);
    setError("");
    try {
      await sendMessage({
        conversationId: conversation._id,
        sessionToken: token,
        body: body.trim(),
        attachmentIds: readyAttachmentIds,
        ...(replyTo ? { replyToMessageId: replyTo._id } : {}),
      });
      setBody("");
      setAttachments([]);
      setShowAttachments(false);
      setReplyTo(null);
    } catch (caught) {
      setError(getReadableChatError(caught, "Message could not be sent."));
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className="hr-card-surface flex min-h-[68vh] min-w-0 flex-1 flex-col overflow-hidden rounded-3xl"
      aria-label="Conversation"
    >
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-4 sm:px-6">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="md:hidden"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <ConversationAvatar conversation={conversation} wallet={wallet} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {conversationLabel(conversation, wallet)}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {conversation.parentType === "group"
              ? "Group conversation"
              : conversation.parentType === "direct"
                ? "Direct conversation"
                : `Work conversation · ${conversation.status}`}
          </p>
        </div>
      </header>
      {conversation.parentType === "group" ? (
        <MemberManager conversation={conversation} token={token} onLeave={onLeave} />
      ) : null}
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-background/70 p-4 sm:p-6"
        aria-live="polite"
      >
        {status === "LoadingFirstPage" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading messages…
          </p>
        ) : null}
        {status === "CanLoadMore" ? (
          <div className="text-center">
            <Button type="button" variant="outline" size="sm" onClick={() => loadMore(30)}>
              Load older messages
            </Button>
          </div>
        ) : null}
        {status === "LoadingMore" ? (
          <p role="status" className="text-center text-xs text-muted-foreground">
            Loading older messages…
          </p>
        ) : null}
        {messages.length === 0 && status !== "LoadingFirstPage" ? (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <div>
              <MessageCircle className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 font-medium">No messages yet</p>
              <p className="text-sm text-muted-foreground">
                Send the first message to start the conversation.
              </p>
            </div>
          </div>
        ) : null}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const showDateDivider =
            !previous ||
            new Date(previous.createdAt).toDateString() !==
              new Date(message.createdAt).toDateString();
          if (message.kind !== "user") {
            return (
              <div key={message._id} className="space-y-3">
                {showDateDivider ? (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase shadow-sm">
                      {messageDateLabel(message.createdAt)}
                    </span>
                  </div>
                ) : null}
                <p className="mx-auto max-w-lg rounded-xl border border-border bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
                  {message.body}
                </p>
              </div>
            );
          }
          const own = message.senderWallet.toUpperCase() === wallet;
          const senderName =
            message.senderProfile?.displayName ?? shortWallet(message.senderWallet);
          const reply = message.replyToMessageId
            ? messageById.get(message.replyToMessageId)
            : undefined;
          return (
            <div key={message._id} className="space-y-3">
              {showDateDivider ? (
                <div className="flex justify-center py-1">
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase shadow-sm">
                    {messageDateLabel(message.createdAt)}
                  </span>
                </div>
              ) : null}
              <article className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}>
                {!own ? <MessageAvatar profile={message.senderProfile} label={senderName} /> : null}
                <div
                  className={`flex max-w-[min(84%,42rem)] flex-col ${own ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`w-fit max-w-full rounded-[20px] border px-4 py-3 shadow-sm ${own ? "hr-gradient-primary rounded-br-sm border-transparent text-[var(--mode-on)]" : "rounded-bl-sm border-border bg-card text-foreground"}`}
                  >
                    {conversation.parentType !== "direct" ? (
                      <p
                        className={`mb-1 text-xs font-semibold ${own ? "text-current/80" : "text-muted-foreground"}`}
                      >
                        {own ? "You" : senderName}
                      </p>
                    ) : null}
                    {reply ? (
                      <div
                        className={`mb-2 rounded-lg border-l-2 py-1 pl-2 text-xs ${own ? "border-black/20 bg-black/5 text-[var(--mode-on)]/80" : "border-(--mode-text) bg-(--mode-soft) text-foreground"}`}
                      >
                        <p>
                          Reply to{" "}
                          {reply.senderProfile?.displayName ?? shortWallet(reply.senderWallet)}
                        </p>
                        <p className="line-clamp-2">
                          {reply.status === "deleted" ? "Message deleted" : reply.body}
                        </p>
                      </div>
                    ) : null}
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {message.status === "deleted" ? <i>Message deleted.</i> : message.body}
                    </p>
                    {message.status !== "deleted" && message.attachments.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {message.attachments.map((attachment) => (
                          <MessageAttachment key={attachment._id} attachment={attachment} />
                        ))}
                      </div>
                    ) : null}
                    {message.status !== "deleted" ? (
                      <div
                        className={`mt-2 flex gap-3 text-xs ${own ? "text-current/80" : "text-muted-foreground"}`}
                      >
                        <button
                          type="button"
                          className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          onClick={() => setReplyTo(message)}
                        >
                          Reply
                        </button>
                        {own ? (
                          <button
                            type="button"
                            className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            onClick={() =>
                              void deleteMessage({
                                messageId: message._id,
                                sessionToken: token,
                              }).catch((caught) =>
                                setError(
                                  getReadableChatError(caught, "Message could not be deleted."),
                                ),
                              )
                            }
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <time
                    dateTime={new Date(message.createdAt).toISOString()}
                    className="mt-1.5 px-2 text-xs text-muted-foreground"
                  >
                    {messageTime(message.createdAt)}
                  </time>
                </div>
              </article>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border bg-card p-3 sm:p-4">
        {isReadOnly ? (
          <p
            role="status"
            className="mb-3 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            {readOnlyMessage}
          </p>
        ) : null}
        {replyTo ? (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-border bg-muted p-3 text-xs">
            <p className="min-w-0 flex-1 truncate">
              Replying to {replyTo.senderProfile?.displayName ?? "member"}: {replyTo.body}
            </p>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="rounded-lg p-1 text-muted-foreground hover:bg-background"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {showAttachments ? (
          <div className="mb-3 max-h-72 overflow-y-auto rounded-2xl border bg-muted/70 p-3">
            <AttachmentUploader
              value={attachments}
              onChange={setAttachments}
              disabled={sending || isReadOnly}
              context="chat"
            />
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-muted/40 p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setShowAttachments((value) => !value)}
            disabled={sending || isReadOnly}
            className="size-9 shrink-0 rounded-xl border-0 bg-transparent shadow-none"
            aria-label={showAttachments ? "Hide attachment uploader" : "Attach files or media"}
            aria-expanded={showAttachments}
          >
            <Paperclip className="size-4" />
          </Button>
          <Textarea
            value={body}
            disabled={isReadOnly}
            onChange={(event) => setBody(event.target.value.slice(0, 4000))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!hasUploadingAttachments) void submit();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Write a message…"
            aria-label="Message text"
            className="max-h-28 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="icon"
            className="size-9 shrink-0 rounded-xl"
            onClick={() => void submit()}
            disabled={
              isReadOnly ||
              sending ||
              hasUploadingAttachments ||
              (!body.trim() && readyAttachmentIds.length === 0)
            }
            aria-label="Send message"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        <div className="mt-2 flex justify-between px-1 text-xs text-muted-foreground">
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : (
            <span>Attach files, photos, or videos</span>
          )}
          <span>{body.length}/4000</span>
        </div>
      </div>
    </section>
  );
}

function MessagesContent() {
  const { token, status } = useSocialSession();
  const wallet = useHighrableWalletIdentity().walletAddress?.toUpperCase() ?? "";
  const [tab, setTab] = useState<"general" | "clients">("general");
  const [selectedId, setSelectedId] = useState<TConvexId<"conversations"> | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const conversations = useQuery(
    api.conversations.getConversationsForCurrentWallet,
    token ? { sessionToken: token } : "skip",
  ) as TConversation[] | undefined;
  const general =
    conversations?.filter(
      (conversation) => conversation.parentType === "direct" || conversation.parentType === "group",
    ) ?? [];
  const clients =
    conversations?.filter(
      (conversation) => conversation.parentType !== "direct" && conversation.parentType !== "group",
    ) ?? [];
  const visible = tab === "general" ? general : clients;
  const searchTerm = conversationSearch.trim().toLocaleLowerCase();
  const filtered = visible.filter((conversation) => {
    if (!searchTerm) return true;
    return `${conversationLabel(conversation, wallet)} ${relativePreview(conversation)}`
      .toLocaleLowerCase()
      .includes(searchTerm);
  });
  const selected =
    conversations?.find(
      (conversation) =>
        conversation._id === selectedId && visible.some((item) => item._id === conversation._id),
    ) ?? null;
  const unreadCount = conversations?.filter((conversation) => conversation.unread).length ?? 0;
  const [actionError, setActionError] = useState("");
  const startDirect = (person: TPerson, id: TConvexId<"conversations">) => {
    setSelectedId(id);
    setShowSearch(false);
    setActionError("");
  };
  const startGroup = (id: TConvexId<"conversations">) => {
    setSelectedId(id);
    setShowSearch(false);
    setActionError("");
  };

  if (!token) {
    return (
      <main className="w-full space-y-6">
        <ProductPageHero
          title="Messages"
          meta="Inbox"
          description="Your work conversations and direct chats in one place."
        />
        {status || (
          <div className="hr-card-surface rounded-3xl p-5 text-sm sm:p-7" role="status">
            Verify your connected wallet or passkey to open messages.
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="w-full">
      <div className="grid min-h-[68vh] gap-4 md:h-[min(78vh,900px)] md:min-h-[640px] md:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(19rem,27rem)_minmax(0,1fr)]">
        <aside
          className={`hr-card-surface min-w-0 flex-col overflow-hidden rounded-3xl p-4 sm:p-5 md:flex ${selected ? "hidden" : "flex"}`}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Messages</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {unreadCount
                  ? `${unreadCount} unread conversation${unreadCount === 1 ? "" : "s"}`
                  : "Your conversations"}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              className="size-10 shrink-0 rounded-full bg-accent text-primary shadow-none hover:bg-accent/80"
              onClick={() => setShowSearch((value) => !value)}
              aria-expanded={showSearch}
              aria-label="New message"
            >
              <PenLine className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <div
            className="mb-4 grid grid-cols-2 rounded-2xl bg-muted/70 p-1"
            role="group"
            aria-label="Message categories"
          >
            <button
              type="button"
              aria-pressed={tab === "general"}
              onClick={() => setTab("general")}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${tab === "general" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}
            >
              General <span className="sr-only">direct and group chats</span>
            </button>
            <button
              type="button"
              aria-pressed={tab === "clients"}
              onClick={() => setTab("clients")}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${tab === "clients" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}
            >
              Clients
            </button>
          </div>
          <label className="mb-4 flex h-11 items-center gap-2 rounded-xl bg-muted/70 px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <Input
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="h-full min-w-0 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </label>
          {showSearch && token ? (
            <div className="mb-4">
              <SearchPeople token={token} onStartDirect={startDirect} onStartGroup={startGroup} />
            </div>
          ) : null}
          {actionError ? (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {actionError}
            </p>
          ) : null}
          {conversations === undefined ? (
            <p role="status" className="p-4 text-sm text-muted-foreground">
              Loading conversations…
            </p>
          ) : filtered.length === 0 ? (
            <div className="m-4 rounded-2xl border border-dashed border-border bg-background/70 p-5 text-center">
              <MessageCircle className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">
                {searchTerm
                  ? "No conversations found"
                  : tab === "general"
                    ? "No general chats yet"
                    : "No client conversations yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {searchTerm
                  ? "Try a different name or message preview."
                  : tab === "general"
                    ? "Search for a person or create a group to begin."
                    : "Work conversations will appear here when you are a participant."}
              </p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Conversations">
              {filtered.map((conversation) => {
                const label = conversationLabel(conversation, wallet);
                return (
                  <li key={conversation._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation._id)}
                      aria-current={selectedId === conversation._id ? "page" : undefined}
                      className="group w-full rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:border-primary/30 aria-[current=page]:bg-accent/50"
                    >
                      <div className="flex items-center gap-3">
                        <ConversationAvatar conversation={conversation} wallet={wallet} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {label}
                            </span>
                            <span className="shrink-0 text-[0.68rem] text-muted-foreground">
                              {conversationTimestamp(conversation)}
                            </span>
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            <span className="truncate text-xs text-muted-foreground">
                              {relativePreview(conversation)}
                            </span>
                            {conversation.unread ? (
                              <span
                                className="size-2 shrink-0 rounded-full bg-primary"
                                role="img"
                                aria-label="Unread conversation"
                              />
                            ) : null}
                          </span>
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
        {selected && token ? (
          <ConversationPane
            conversation={selected}
            token={token}
            onBack={() => setSelectedId(null)}
            onLeave={() => setSelectedId(null)}
          />
        ) : (
          <div className="hr-card-surface hidden min-h-[68vh] flex-1 place-items-center rounded-3xl p-8 text-center text-sm text-muted-foreground md:grid">
            <div>
              <MessageCircle
                className="mx-auto size-9 text-muted-foreground/70"
                aria-hidden="true"
              />
              <p className="mt-3">Select a conversation to read and reply.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export function MessagesPage() {
  return (
    <MessagesErrorBoundary>
      <SocialSession>
        <MessagesContent />
      </SocialSession>
    </MessagesErrorBoundary>
  );
}
