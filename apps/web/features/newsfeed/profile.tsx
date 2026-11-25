"use client";

import { WalletStatusCard } from "@/core/wallet/components/wallet-status-card";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { ModeSwitchCard } from "@/features/mode";
import { api, type TConvexId } from "@repo/convex-client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import type { FunctionReturnType } from "convex/server";
import type { FormEvent } from "react";

import { Feed } from "./feed";
import { FeedBoundary } from "./feed-boundary";
import { FollowButton } from "./follow-button";
import { ImageEditor } from "./image-editor";
import { uploadProfileImage } from "./media-client";
import { SocialSession, SocialSessionStatus, useSocialSession } from "./session";

type ProfileResult = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.profileById>>;
type Details = ProfileResult["details"];
type WorkItem = Details["workHistory"][number];
type Certificate = Details["certificates"][number];
type PortfolioItem = Details["portfolio"][number];

function ProfileContent({ profileId, showHeader }: { profileId: string; showHeader: boolean }) {
  const profile = useQuery(api.newsfeed.queries.profileById, {
    profileId: profileId as TConvexId<"users">,
  });
  const { token, viewer } = useSocialSession();
  const wallet = useHighrableWalletIdentity();
  if (profile === undefined) return <p role="status">Loading professional profile…</p>;
  if (!profile) return <p>This professional profile is unavailable.</p>;
  const details = profile.details;
  const owner = Boolean(viewer && viewer._id === profile.id);
  return (
    <div className="space-y-6">
      {showHeader && (
        <section className="hr-card-surface overflow-hidden rounded-2xl">
          <div className="relative h-36 bg-gradient-to-r from-sky-700 via-indigo-700 to-violet-600 sm:h-52">
            {details.coverUrl && (
              <img src={details.coverUrl} alt="Profile cover" className="size-full object-cover" />
            )}
          </div>
          <div className="px-5 pb-5">
            <Avatar className="-mt-12 size-24 border-4 border-background sm:-mt-16 sm:size-32">
              <AvatarImage src={details.avatarUrl ?? undefined} alt="" />
              <AvatarFallback className="text-3xl">
                {details.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {details.name}
                </h1>
                {details.headline && (
                  <p className="mt-1 text-muted-foreground">{details.headline}</p>
                )}
                {details.workplace && <p className="mt-1 text-sm">{details.workplace}</p>}
                {details.availability && (
                  <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                    Available · {details.availability}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!owner && <FollowButton userId={profile.id} />}
                {owner && (
                  <p className="text-sm text-muted-foreground">Your public professional profile</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {showHeader && owner && token && wallet.isConnected && (
        <div className="grid gap-4 lg:grid-cols-2" aria-label="Owner wallet and mode controls">
          <WalletStatusCard />
          <ModeSwitchCard />
        </div>
      )}

      <section className="hr-card-surface rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Professional profile</h2>
          {owner && token && <ProfileEditor token={token} details={details} />}
        </div>
        {!showHeader && details.workplace && (
          <p className="mt-3 text-sm text-muted-foreground">
            Current workplace: {details.workplace}
          </p>
        )}
        {!showHeader && details.availability && (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
            Availability: {details.availability}
          </p>
        )}
        {details.about && (
          <p className="mt-4 text-sm leading-6 whitespace-pre-wrap">{details.about}</p>
        )}
        {!details.about && (
          <p className="mt-4 text-sm text-muted-foreground">No introduction yet.</p>
        )}
        {details.skills.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Skills</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {details.skills.map((skill, index) => (
                <li key={`${skill}-${index}`} className="rounded-full bg-muted px-3 py-1 text-sm">
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        )}
        {details.links.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Links</h3>
            <ul className="mt-2 space-y-1">
              {details.links.map((url, index) => (
                <li key={`${url}-${index}`}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm break-all text-primary underline"
                  >
                    {url} <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {details.workHistory.length > 0 && (
        <section className="hr-card-surface rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Work history</h2>
          <ol className="mt-4 space-y-0 border-l border-border pl-5">
            {[...details.workHistory].reverse().map((item, index) => (
              <li
                key={`${item.title}-${item.company}-${index}`}
                className="relative pb-6 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-1 -left-[1.55rem] size-3 rounded-full border-2 border-primary bg-background"
                />
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm">{item.company}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatMonth(item.startDate)} –{" "}
                  {item.endDate ? formatMonth(item.endDate) : "Present"}
                </p>
                {item.description && (
                  <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{item.description}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {details.certificates.length > 0 && (
        <section className="hr-card-surface rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Certificates</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Certificate details are self-published by this member.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {details.certificates.map((item, index) => (
              <li key={`${item.name}-${index}`} className="rounded-xl border p-4">
                <h3 className="font-semibold">{item.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {item.issuer}
                  {item.issuedAt ? ` · ${formatMonth(item.issuedAt)}` : ""}
                </p>
                {item.details && <p className="mt-2 text-sm whitespace-pre-wrap">{item.details}</p>}
                {item.url && (
                  <a
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary underline"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View certificate <ExternalLink className="size-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {details.portfolio.length > 0 && (
        <section className="hr-card-surface rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Portfolio</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {details.portfolio.map((item, index) => (
              <li key={`${item.title}-${index}`} className="overflow-hidden rounded-xl border">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-44 w-full object-cover"
                  />
                )}
                <div className="p-4">
                  <h3 className="font-semibold">{item.title}</h3>
                  {item.details && (
                    <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{item.details}</p>
                  )}
                  {item.url && (
                    <a
                      className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline"
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open project <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4" aria-label="Profile activity">
        <h2 className="text-xl font-semibold">Activity</h2>
        <Feed authorId={profile.id} />
      </section>
    </div>
  );
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

function ProfileEditor({ token, details }: { token: string; details: Details }) {
  const save = useMutation(api.newsfeed.mutations.saveProfile);
  const remove = useMutation(api.newsfeed.mutations.deleteProfile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workHistory, setWorkHistory] = useState<WorkItem[]>(details.workHistory);
  const [certificates, setCertificates] = useState<Certificate[]>(details.certificates);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(details.portfolio);
  const [imageBusy, setImageBusy] = useState<"avatar" | "cover" | null>(null);
  const [imageError, setImageError] = useState("");
  const [editingImage, setEditingImage] = useState<{
    purpose: "avatar" | "cover";
    file: File;
  } | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");
    try {
      await save({
        token,
        name: value("name"),
        headline: value("headline"),
        about: value("about"),
        workplace: value("workplace"),
        availability: value("availability"),
        skills: value("skills")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
        links: value("links")
          .split("\n")
          .map((part) => part.trim())
          .filter(Boolean),
        workHistory: workHistory.filter((item) => item.title.trim() && item.company.trim()),
        certificates: certificates.filter((item) => item.name.trim() && item.issuer.trim()),
        portfolio: portfolio.filter((item) => item.title.trim()),
      });
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadImage(purpose: "avatar" | "cover", file: File) {
    setImageBusy(purpose);
    setImageError("");
    try {
      await uploadProfileImage(token, purpose, file);
      setEditingImage(null);
    } catch (reason) {
      setImageError(reason instanceof Error ? reason.message : "Image could not be uploaded.");
    } finally {
      setImageBusy(null);
    }
  }
  async function deleteProfile() {
    if (
      !window.confirm("Delete your professional profile details? Your newsfeed posts will remain.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await remove({ token });
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "Close editor" : "Edit profile"}
      </Button>
      {open && (
        <form
          className="mt-5 space-y-6 border-t pt-5"
          onSubmit={(event) => void saveProfile(event)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="professional-name" className="block text-sm font-medium">
              Name
              <Input
                name="name"
                id="professional-name"
                defaultValue={details.name}
                maxLength={100}
                required
                className="mt-1"
              />
            </label>
            <label htmlFor="professional-headline" className="block text-sm font-medium">
              Headline
              <Input
                name="headline"
                id="professional-headline"
                defaultValue={details.headline}
                maxLength={220}
                className="mt-1"
              />
            </label>
            <label
              htmlFor="professional-workplace"
              className="block text-sm font-medium sm:col-span-2"
            >
              Current workplace
              <Input
                name="workplace"
                id="professional-workplace"
                defaultValue={details.workplace}
                maxLength={160}
                className="mt-1"
                placeholder="Company or independent practice"
              />
            </label>
            <label
              htmlFor="professional-availability"
              className="block text-sm font-medium sm:col-span-2"
            >
              Project availability
              <Input
                name="availability"
                id="professional-availability"
                defaultValue={details.availability}
                maxLength={120}
                className="mt-1"
                placeholder="Available for 20 hours/week"
              />
            </label>
            <label htmlFor="professional-about" className="block text-sm font-medium sm:col-span-2">
              Bio
              <Textarea
                name="about"
                id="professional-about"
                defaultValue={details.about}
                maxLength={4000}
                className="mt-1 min-h-24"
              />
            </label>
            <label htmlFor="professional-skills" className="block text-sm font-medium">
              Skills, separated by commas
              <Textarea
                name="skills"
                id="professional-skills"
                defaultValue={details.skills.join(", ")}
                className="mt-1 min-h-20"
              />
            </label>
            <label htmlFor="professional-links" className="block text-sm font-medium">
              Links, one URL per line
              <Textarea
                name="links"
                id="professional-links"
                defaultValue={details.links.join("\n")}
                className="mt-1 min-h-20"
              />
            </label>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Work history</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setWorkHistory((items) => [
                    ...items,
                    { title: "", company: "", startDate: "", description: "" },
                  ])
                }
              >
                <Plus className="mr-1 size-4" /> Add role
              </Button>
            </div>
            {workHistory.map((item, index) => (
              <fieldset key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs text-muted-foreground">Role {index + 1}</legend>
                <Input
                  aria-label="Job title"
                  placeholder="Job title"
                  value={item.title}
                  onChange={(event) =>
                    setWorkHistory((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, title: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Input
                  aria-label="Company"
                  placeholder="Company"
                  value={item.company}
                  onChange={(event) =>
                    setWorkHistory((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, company: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <label htmlFor={`work-start-${index}`} className="text-xs">
                  Start date
                  <Input
                    id={`work-start-${index}`}
                    type="month"
                    required
                    value={item.startDate}
                    onChange={(event) =>
                      setWorkHistory((items) =>
                        items.map((entry, i) =>
                          i === index ? { ...entry, startDate: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </label>
                <label htmlFor={`work-end-${index}`} className="text-xs">
                  End date (leave blank if current)
                  <Input
                    id={`work-end-${index}`}
                    type="month"
                    value={item.endDate ?? ""}
                    onChange={(event) =>
                      setWorkHistory((items) =>
                        items.map((entry, i) =>
                          i === index
                            ? { ...entry, endDate: event.target.value || undefined }
                            : entry,
                        ),
                      )
                    }
                  />
                </label>
                <Textarea
                  className="sm:col-span-2"
                  aria-label="Work description"
                  placeholder="Description"
                  value={item.description}
                  onChange={(event) =>
                    setWorkHistory((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, description: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start text-destructive"
                  onClick={() => setWorkHistory((items) => items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="mr-1 size-4" /> Remove role
                </Button>
              </fieldset>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Certificates</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCertificates((items) => [...items, { name: "", issuer: "", details: "" }])
                }
              >
                <Plus className="mr-1 size-4" /> Add certificate
              </Button>
            </div>
            {certificates.map((item, index) => (
              <fieldset key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs text-muted-foreground">
                  Certificate {index + 1}
                </legend>
                <Input
                  aria-label="Certificate name"
                  placeholder="Name"
                  value={item.name}
                  onChange={(event) =>
                    setCertificates((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Input
                  aria-label="Certificate issuer"
                  placeholder="Issuer"
                  value={item.issuer}
                  onChange={(event) =>
                    setCertificates((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, issuer: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <label htmlFor={`certificate-date-${index}`} className="text-xs">
                  Issued date
                  <Input
                    id={`certificate-date-${index}`}
                    type="month"
                    value={item.issuedAt ?? ""}
                    onChange={(event) =>
                      setCertificates((items) =>
                        items.map((entry, i) =>
                          i === index
                            ? { ...entry, issuedAt: event.target.value || undefined }
                            : entry,
                        ),
                      )
                    }
                  />
                </label>
                <Input
                  aria-label="Certificate link"
                  placeholder="External link (optional)"
                  value={item.url ?? ""}
                  onChange={(event) =>
                    setCertificates((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, url: event.target.value || undefined } : entry,
                      ),
                    )
                  }
                />
                <Textarea
                  className="sm:col-span-2"
                  aria-label="Certificate details"
                  placeholder="Details"
                  value={item.details}
                  onChange={(event) =>
                    setCertificates((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, details: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start text-destructive"
                  onClick={() => setCertificates((items) => items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="mr-1 size-4" /> Remove certificate
                </Button>
              </fieldset>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Portfolio</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPortfolio((items) => [...items, { title: "", details: "" }])}
              >
                <Plus className="mr-1 size-4" /> Add project
              </Button>
            </div>
            {portfolio.map((item, index) => (
              <fieldset key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs text-muted-foreground">Project {index + 1}</legend>
                <Input
                  aria-label="Project title"
                  placeholder="Title"
                  value={item.title}
                  onChange={(event) =>
                    setPortfolio((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, title: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Input
                  aria-label="Project link"
                  placeholder="External link (optional)"
                  value={item.url ?? ""}
                  onChange={(event) =>
                    setPortfolio((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, url: event.target.value || undefined } : entry,
                      ),
                    )
                  }
                />
                <Input
                  aria-label="Project image URL"
                  placeholder="Image URL (optional)"
                  value={item.imageUrl ?? ""}
                  onChange={(event) =>
                    setPortfolio((items) =>
                      items.map((entry, i) =>
                        i === index
                          ? { ...entry, imageUrl: event.target.value || undefined }
                          : entry,
                      ),
                    )
                  }
                />
                <Textarea
                  className="sm:col-span-2"
                  aria-label="Project details"
                  placeholder="Details"
                  value={item.details}
                  onChange={(event) =>
                    setPortfolio((items) =>
                      items.map((entry, i) =>
                        i === index ? { ...entry, details: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start text-destructive"
                  onClick={() => setPortfolio((items) => items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="mr-1 size-4" /> Remove project
                </Button>
              </fieldset>
            ))}
          </section>

          {imageError && (
            <p role="alert" className="text-sm text-destructive">
              {imageError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(imageBusy)}
              onClick={() => avatarInput.current?.click()}
            >
              {imageBusy === "avatar" ? "Uploading photo…" : "Change profile photo"}
            </Button>
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              aria-label="Choose profile photo"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setEditingImage({ purpose: "avatar", file });
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(imageBusy)}
              onClick={() => coverInput.current?.click()}
            >
              {imageBusy === "cover" ? "Uploading cover…" : "Change cover image"}
            </Button>
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              aria-label="Choose cover image"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setEditingImage({ purpose: "cover", file });
                event.target.value = "";
              }}
            />
          </div>
          <ImageEditor
            file={editingImage?.file ?? null}
            onOpenChange={(next) => {
              if (!next) setEditingImage(null);
            }}
            onSave={(file) => {
              if (editingImage) void uploadImage(editingImage.purpose, file);
            }}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => void deleteProfile()}
            >
              Delete professional profile
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}

export function SocialProfessionalProfile({ profileId }: { profileId: string }) {
  return (
    <FeedBoundary>
      <SocialSessionStatus />
      <ProfileContent profileId={profileId} showHeader />
    </FeedBoundary>
  );
}

export function ProfessionalActivity({ walletAddress }: { walletAddress: string }) {
  const profile = useQuery(api.newsfeed.queries.profile, { walletAddress });
  if (profile === undefined) return <p role="status">Loading professional details…</p>;
  if (!profile) return null;
  return (
    <FeedBoundary>
      <SocialSession>
        <SocialSessionStatus />
        <ProfileContent profileId={profile.author.id} showHeader={false} />
      </SocialSession>
    </FeedBoundary>
  );
}
