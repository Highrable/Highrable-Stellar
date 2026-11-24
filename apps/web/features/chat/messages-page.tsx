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
import { SocialSession, useSocialSession } from "@/features/newsfeed/session";
import { api, type TConvexId } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
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
        <main className="mx-auto max-w-3xl rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-semibold">Messages could not be loaded</h1>
          <p role="alert" className="mt-2 text-sm">
            {getReadableChatError(
              this.state.error,
              "Your session may have expired. Reconnect and verify your wallet, then reload messages.",
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Reload messages
          </Button>
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
        className="block overflow-hidden rounded-md border bg-background"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          loading="lazy"
          className="max-h-72 w-full bg-muted/40 object-contain"
        />
        <span className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
          <span className="truncate text-xs font-medium">{attachment.name}</span>
          <AttachmentTypeBadge type={attachment.type as TAttachmentType} />
        </span>
      </a>
    );
  }

  if (attachment.type === "video" && attachment.url) {
    return (
      <figure className="overflow-hidden rounded-md border bg-background">
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Chat uploads do not collect caption tracks yet. */}
        <video
          controls
          preload="metadata"
          className="max-h-72 w-full bg-black"
          aria-label={attachment.name}
        >
          <source src={attachment.url} type={attachment.mimeType ?? undefined} />
        </video>
        <figcaption className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
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
      className="flex min-w-48 items-center gap-2 rounded-md border bg-background px-3 py-2 hover:border-primary/50"
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
      conversation.participantProfiles.find((participant) => participant.walletAddress !== wallet)
        ?.displayName ?? "Direct conversation"
    );
  }
  return conversation.title || "Work conversation";
}

function relativePreview(conversation: TConversation) {
  return conversation.lastMessagePreview || "No messages yet";
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
    <section className="space-y-3 border-b border-border p-4" aria-label="Start a conversation">
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
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
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
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
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
    <details className="border-b border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">
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
    if (!body.trim() && readyAttachmentIds.length === 0) return;
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
    <section className="flex min-h-[65vh] min-w-0 flex-1 flex-col" aria-label="Conversation">
      <header className="flex items-center gap-3 border-b border-border p-4">
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
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{conversationLabel(conversation, wallet)}</h2>
          <p className="text-xs text-muted-foreground">
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
      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4" aria-live="polite">
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
          <div className="grid min-h-48 place-items-center text-center">
            <div>
              <MessageCircle className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 font-medium">No messages yet</p>
              <p className="text-sm text-muted-foreground">
                Send the first message to start the conversation.
              </p>
            </div>
          </div>
        ) : null}
        {messages.map((message) => {
          if (message.kind !== "user")
            return (
              <p
                key={message._id}
                className="mx-auto max-w-lg rounded-md border bg-background px-3 py-2 text-center text-xs text-muted-foreground"
              >
                {message.body}
              </p>
            );
          const own = message.senderWallet === wallet;
          const reply = message.replyToMessageId
            ? messageById.get(message.replyToMessageId)
            : undefined;
          return (
            <article key={message._id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-lg border px-3 py-2 ${own ? "border-orange-300 bg-orange-50 dark:bg-orange-950/30" : "bg-background"}`}
              >
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {own
                    ? "You"
                    : (message.senderProfile?.displayName ?? shortWallet(message.senderWallet))}
                </p>
                {reply ? (
                  <div className="mb-2 border-l-2 border-orange-400 pl-2 text-xs text-muted-foreground">
                    <p>
                      Reply to {reply.senderProfile?.displayName ?? shortWallet(reply.senderWallet)}
                    </p>
                    <p className="line-clamp-2">
                      {reply.status === "deleted" ? "Message deleted" : reply.body}
                    </p>
                  </div>
                ) : null}
                <p className="text-sm break-words whitespace-pre-wrap">
                  {message.status === "deleted" ? <i>Message deleted.</i> : message.body}
                </p>
                {message.status !== "deleted" && message.attachments.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {message.attachments.map((attachment) => (
                      <MessageAttachment key={attachment._id} attachment={attachment} />
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-4 text-[0.68rem] text-muted-foreground">
                  <time dateTime={new Date(message.createdAt).toISOString()}>
                    {new Date(message.createdAt).toLocaleString()}
                  </time>
                  {message.status !== "deleted" ? (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setReplyTo(message)}
                      >
                        Reply
                      </button>
                      {own ? (
                        <button
                          type="button"
                          className="underline"
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
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="border-t border-border bg-background p-3">
        {replyTo ? (
          <div className="mb-2 flex items-start gap-2 rounded bg-muted p-2 text-xs">
            <p className="min-w-0 flex-1 truncate">
              Replying to {replyTo.senderProfile?.displayName ?? "member"}: {replyTo.body}
            </p>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {showAttachments ? (
          <div className="mb-3 max-h-72 overflow-y-auto rounded-md border bg-muted/20 p-2">
            <AttachmentUploader
              value={attachments}
              onChange={setAttachments}
              disabled={sending}
              context="chat"
            />
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setShowAttachments((value) => !value)}
            disabled={sending}
            aria-label={showAttachments ? "Hide attachment uploader" : "Attach files or media"}
            aria-expanded={showAttachments}
          >
            <Paperclip className="size-4" />
          </Button>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 4000))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!hasUploadingAttachments) void submit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Write a message…"
            aria-label="Message text"
            className="resize-none"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void submit()}
            disabled={
              sending ||
              hasUploadingAttachments ||
              (!body.trim() && readyAttachmentIds.length === 0)
            }
            aria-label="Send message"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
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
  const { token } = useSocialSession();
  const wallet = useHighrableWalletIdentity().walletAddress?.toUpperCase() ?? "";
  const [tab, setTab] = useState<"general" | "clients">("general");
  const [selectedId, setSelectedId] = useState<TConvexId<"conversations"> | null>(null);
  const [showSearch, setShowSearch] = useState(false);
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
      <main className="mx-auto w-full max-w-4xl space-y-3">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Inbox
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
        <div className="rounded-lg border bg-background p-5 text-sm" role="status">
          Verify your connected wallet or passkey to open messages.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Inbox{unreadCount ? ` · ${unreadCount} unread` : ""}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Messages</h1>
        </div>
        <Button
          type="button"
          onClick={() => setShowSearch((value) => !value)}
          aria-expanded={showSearch}
        >
          <Plus className="mr-2 size-4" /> New message
        </Button>
      </header>
      {showSearch && token ? (
        <SearchPeople token={token} onStartDirect={startDirect} onStartGroup={startGroup} />
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      <div className="grid min-h-[70vh] overflow-hidden rounded-lg border bg-background md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside
          className={`min-w-0 border-r md:flex md:flex-col ${selected ? "hidden" : "flex flex-col"}`}
        >
          <div
            className="grid grid-cols-2 border-b p-2"
            role="group"
            aria-label="Message categories"
          >
            <button
              type="button"
              aria-pressed={tab === "general"}
              onClick={() => setTab("general")}
              className={`rounded px-3 py-2 text-sm font-medium ${tab === "general" ? "bg-muted" : "text-muted-foreground"}`}
            >
              General <span className="sr-only">direct and group chats</span>
            </button>
            <button
              type="button"
              aria-pressed={tab === "clients"}
              onClick={() => setTab("clients")}
              className={`rounded px-3 py-2 text-sm font-medium ${tab === "clients" ? "bg-muted" : "text-muted-foreground"}`}
            >
              Clients
            </button>
          </div>
          {conversations === undefined ? (
            <p role="status" className="p-4 text-sm text-muted-foreground">
              Loading conversations…
            </p>
          ) : visible.length === 0 ? (
            <div className="p-5 text-center">
              <MessageCircle className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">
                {tab === "general" ? "No general chats yet" : "No client conversations yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tab === "general"
                  ? "Search for a person or create a group to begin."
                  : "Work conversations will appear here when you are a participant."}
              </p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {visible.map((conversation) => {
                const label = conversationLabel(conversation, wallet);
                return (
                  <li key={conversation._id} className="border-b last:border-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation._id)}
                      aria-current={selectedId === conversation._id ? "page" : undefined}
                      className="w-full px-4 py-3 text-left hover:bg-muted/50 aria-[current=page]:bg-muted"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{label}</span>
                        {conversation.unread ? (
                          <span
                            className="size-2 shrink-0 rounded-full bg-orange-500"
                            aria-label="Unread"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {relativePreview(conversation)}
                      </p>
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
          <div className="hidden flex-1 place-items-center p-8 text-center text-sm text-muted-foreground md:grid">
            Select a conversation to read and reply.
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
