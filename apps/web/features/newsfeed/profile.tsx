"use client";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { api } from "@repo/convex-client";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { Feed, FeedBoundary } from "./feed";
import { SocialSession, useSocialSession } from "./session";
function ProfileContent({ walletAddress }: { walletAddress: string }) {
  const profile = useQuery(api.newsfeed.queries.profile, { walletAddress });
  const identity = useHighrableWalletIdentity();
  const { token } = useSocialSession();
  const save = useMutation(api.newsfeed.mutations.saveProfile);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const { details, author } = profile;
  return (
    <section className="space-y-5" aria-label="Professional profile">
      <h3 className="font-semibold">About</h3>
      <p className="break-words whitespace-pre-wrap">
        {details?.about || profile.bio || "This participant has not added an introduction yet."}
      </p>
      <ul className="flex flex-wrap gap-2">
        {(details?.skills ?? profile.skills).map((skill, i) => (
          <li className="rounded bg-muted px-2 py-1 text-sm" key={`${skill}-${i}`}>
            {skill}
          </li>
        ))}
      </ul>
      <ul>
        {details?.links.map((url, i) => (
          <li key={`${url}-${i}`}>
            <a className="break-all underline" href={url} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
          </li>
        ))}
      </ul>
      {token && identity.walletAddress === walletAddress && (
        <button className="underline" onClick={() => setEditing(!editing)}>
          Edit professional profile
        </button>
      )}
      {editing && (
        <form
          className="grid gap-3 rounded border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            const field = (name: string) => String(data.get(name) ?? "");
            try {
              await save({
                token,
                name: field("name"),
                headline: field("headline"),
                about: field("about"),
                skills: field("skills")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                links: field("links")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
                avatarUrl: field("avatarUrl") || undefined,
                coverUrl: field("coverUrl") || undefined,
              });
              setEditing(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Profile could not be saved.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {(
            [
              ["name", "Participant name", details?.name ?? author.name],
              ["headline", "Headline", details?.headline ?? ""],
              [
                "skills",
                "Skills (comma separated)",
                (details?.skills ?? profile.skills).join(", "),
              ],
              ["avatarUrl", "Avatar image URL", details?.avatarUrl ?? author.avatarUrl ?? ""],
              ["coverUrl", "Cover image URL", details?.coverUrl ?? ""],
            ] as const
          ).map(([name, label, value]) => (
            <label key={name}>
              {label}
              <input
                className="block w-full rounded border p-2"
                name={name}
                defaultValue={value}
                required={name === "name"}
              />
            </label>
          ))}
          <label>
            About
            <textarea
              className="block w-full border p-2"
              name="about"
              defaultValue={details?.about ?? profile.bio}
            />
          </label>
          <label>
            Links (one per line)
            <textarea
              className="block w-full border p-2"
              name="links"
              defaultValue={details?.links.join("\n") ?? ""}
            />
          </label>
          <button disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      <h3 className="text-xl font-semibold">Activity</h3>
      <Feed authorId={author.id} />
    </section>
  );
}
export function ProfessionalActivity({ walletAddress }: { walletAddress: string }) {
  return (
    <FeedBoundary>
      <SocialSession>
        <ProfileContent walletAddress={walletAddress} />
      </SocialSession>
    </FeedBoundary>
  );
}
