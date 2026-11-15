# Newsfeed architecture and operations

## Existing infrastructure and scope

`users/schema.ts` and `profiles.ts` supply participant profiles and work/reputation statistics. Existing profile/attachment mutations accept wallet addresses without cryptographic authorization. They are not suitable authorization boundaries for new social actions. Existing external wallets have signed challenges and an HMAC session cookie in `core/wallet/server`; passkey discovery/connection is a client-side convenience, not server proof of ownership.

Social actions therefore use a separate short-lived verified session. New professional profile fields live in `socialProfiles`, so address-trusting legacy profile operations cannot overwrite them. Display names are resolved on each read from the verified professional profile, falling back to the existing participant name and then “Highrable participant.” Existing work/reputation data and routes remain in place. Legacy marketplace authorization is unchanged.

## Identity and authorization

`POST /api/newsfeed/session` accepts the current Highrable origin and binds the resulting session to it. External wallets reuse the existing verified wallet cookie, and the supplied connected address must match its subject. Passkeys use a fresh signed challenge, WebAuthn user presence and verification, exact origin/RP ID, and P-256 signature verification against the key and credential ID read from default on-chain context rule 0. Challenge consumption is atomic in Convex, preventing replay across web instances.

Only an unexpired default rule with exactly one external signer, the configured WebAuthn verifier, and no extra policies is supported. Multisigner/policy-controlled accounts fail closed; do not weaken this check to support them. RPC reads do not send chain transactions. The configured RPC, passphrase and verifier must match the deployed account network.

Social session HMAC tokens carry an address, `highrable-social` audience, current site origin, and a 15-minute expiry. They are held in browser component memory and usable only for the connected wallet. The newsfeed automatically establishes a session when a wallet connects and renews it after expiry; there is no separate newsfeed sign-in/sign-out. External wallets first reuse the verified server cookie, requesting wallet authentication only when needed. Passkeys still require device verification. Failed or cancelled verification exposes a retry control without repeatedly prompting. Disconnects and wallet changes immediately stop exposing the previous token, and stale verification responses are ignored. Convex validates the signature and expiration independently for every write. Authorship always comes from that verified subject, never mutation arguments. Any authenticated external-wallet or supported passkey account can contribute; onboarding, participant role, and participant-name completion are not required. A minimal user record is created on first verified newsfeed sign-in. Admin moderation separately checks the configured administrator wallet; ordinary participant roles cannot grant moderation privileges.

Public queries need no session. HTTP upload uses a Bearer token and exact CORS origin rather than ambient cookies. Cross-origin browser scripts cannot mint a social token through the session route. Tokens and secrets must not be logged.

## Storage design and tradeoffs

The existing attachment UI/storage policy has product caps and protected-deliverable semantics. Social media uses Convex file storage and familiar file references, progress and preview behavior, but independent records and authorization. It never adopts user-supplied `_storage` IDs or changes protected-deliverable handling.

A draft post owns media upload records. Files and post text are transferred as sequential 4 MiB chunks to a Convex HTTP action. This is a transport chunk size, **not** a total file-size, video-duration or attachment-count cap. The action verifies ownership, exact expected chunk size, and supported file signatures on the first chunk, then stores opaque bytes and records their reference through an internal mutation. Clients cannot call chunk acceptance directly. Supported formats are JPEG, PNG, GIF, WebP, MP4, WebM and UTF-8 post text; SVG/HTML/executables are not rendered as media. Signature checks are format identification, not full media decoding or malware scanning.

Retry identity is `(authorId, requestId)` for drafts, uploads and comments, `(mediaId, index)` for chunks, and `(postId, authorId)` for reactions. Convex transactional conflict handling protects counters and uniqueness under concurrency. Publication checks all pending media and body ownership/readiness in one mutation. Reposts store an original post reference and are canonicalized to the original.

Full post text uses the same chunked storage, with a 600-character card preview. No post description is truncated in storage. Reactions, comments and new profile fields use normal Convex documents; document/request infrastructure limits apply to comments/profile fields and are surfaced as save errors with form contents retained.

The feed is indexed by publication time, with separate author/status pagination. Media pages are small and actual bytes load only when requested. The browser assembles a file Blob from paginated chunks before displaying it; video has standard controls. This avoids one gigantic Convex document/response but is **not streaming playback or resumable disk download**. Viewing very large files can exceed browser memory, especially on mobile. Browser memory, HTTP execution limits, storage/egress quotas and database limits remain infrastructure constraints. There is no invented 10 MB image or 25 MB video policy.

Feed and permalink card queries return the viewer's reaction when a valid social token is present, plus metadata for the first four attachments. This avoids starting reaction and media subscriptions for every visible card. Additional attachment metadata is paginated only after “Show more media”; file bytes still load on demand. The optional token does not gate public reads. Convex allows only one paginated query per function execution, so card attachment metadata uses a bounded indexed read while the feed itself remains paginated. The moderation route imports its error boundary independently of the feed, and profile activity loads the composer only when a repost is opened.

The current local Convex SDK exposes file `store/get` in actions, not mutations. Unlike current online examples for newer capabilities, storage writes here cannot be made atomic with document insertion. Normal action errors delete the just-written chunk; a hard process crash between storage creation and reference insertion can leave an unindexed storage orphan. Operators must review such candidates; do not globally purge `_storage` because protected marketplace attachments share it.

Sources consulted for feasibility: [Convex upload limits](https://docs.convex.dev/file-storage/upload-files), [database/platform limits](https://docs.convex.dev/production/state/limits), and [file URL security](https://docs.convex.dev/file-storage/overview). Local installed SDK types remain authoritative for available APIs.

## Cleanup, removal and visibility

Draft upload lifetime is 24 hours. Removed uploads and expired drafts are reclaimed by `newsfeed/media.cleanup` every 15 minutes in bounded batches (50 media records, 20 chunks per record). Expired draft posts are tombstoned before deleting bytes so cleanup cannot race successful publication. Live and hidden post media are retained; old text revisions and deleted post files become eligible after their retention check. Cleanup also expires used challenge nonce records.

Deletion/hiding immediately removes content from public queries and media discovery, including original repost content. Already downloaded bytes cannot be recalled. Convex storage URLs are bearer URLs; previously obtained chunk URLs remain usable until bytes are deleted. Hiding is reversible and retains bytes. Never describe this as DRM or immediate URL revocation. Moderation actions are append-only audit records; author deletions cannot be restored by the hide/restore action.

The configured platform administrator can review reports at `/newsfeed/moderation`. Hide/restore requires a reason. Ordinary users receive an authorization failure rather than report data.

## Required configuration

The ignored local development environment files now contain matching newsfeed and wallet session secrets so the local web server can authenticate. Deployment secrets must still be configured separately; they are never committed or copied into this document.

| Variable                                                                                                             | Where                     | Purpose                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEWSFEED_ENABLED`                                                                                                   | Local/deployment metadata | Retained for operational dashboards; it no longer gates authenticated newsfeed contributions                                                                                          |
| `NEWSFEED_SESSION_SECRET`                                                                                            | Web server and Convex     | Matching random secret, at least 32 characters; never use a public variable                                                                                                           |
| `NEWSFEED_WEB_ORIGIN`                                                                                                | Optional web server       | Preferred browser origin, e.g. `https://app.example.com`; the current request origin is accepted when omitted, while signed sessions still bind uploads to the origin used to sign in |
| `NEXT_PUBLIC_CONVEX_SITE_URL`                                                                                        | Web build                 | Deployment HTTP action origin, normally `https://<deployment>.convex.site`                                                                                                            |
| `NEXT_PUBLIC_CONVEX_URL`                                                                                             | Existing web config       | Same deployment's query/mutation URL                                                                                                                                                  |
| `WALLET_SESSION_SECRET`                                                                                              | Existing web server       | Required strong secret (at least 32 characters), including development social sign-in; the legacy development fallback is refused                                                     |
| `NEXT_PUBLIC_STELLAR_RPC_URL`, `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`, `NEXT_PUBLIC_WEBAUTHN_VERIFIER_CONTRACT_ID` | Existing web config       | Matching deployed passkey account network/verifier                                                                                                                                    |
| `HIGHRABLE_ADMIN_WALLET_ADDRESS`                                                                                     | Convex                    | Verified wallet allowed to moderate; unset denies moderation                                                                                                                          |

Run normal Convex code generation after source updates, then deploy schema/functions through the project's existing deployment workflow. Configure the matching session secret before allowing signed-in contributions. There is no migration copying existing posts or activity records.

Rollback: remove the newsfeed session secret from the web and Convex deployments to stop signed-in writes while preserving public reads and stored data; remove the navigation entry if a full UI rollback is required. Keep cleanup running. Rotate the social secret on both services to invalidate every social session. Do not roll back to an incompatible schema while rows exist, and do not delete existing marketplace tables or files.

## Operational checks

Use Convex function errors and scheduled-job logs to monitor upload failures, signature/expiry failures, cleanup exceptions, stale drafts and storage growth. Use web server logs for session endpoint/RPC availability; avoid request bodies containing signatures/tokens. Count/alert on repeated error rates in the deployment's monitoring system; no external monitoring account or alert policy was configured here. Inspect moderation audit entries when reviewing reports.

Investigate failed chunks by media ID and index, retry with the same request ID, and remove abandoned uploads through the owner operation or expiry cleanup. For storage orphans after a hard action crash, compare storage metadata with `socialChunks` and all existing attachment/avatar references before any deletion. Never automatically delete unreferenced marketplace storage based solely on age.

## Verification record

- Backend suite: 553 tests passed, including social authorization, retries/concurrency, long text, cleanup, canonical reposts, moderation and card pagination checks.
- Web suite: 610 tests passed with `NODE_OPTIONS=--no-experimental-webstorage pnpm --filter web test`. The default host Node runtime exposes unusable experimental `localStorage`, causing nine existing wallet-client tests to fail without this flag.
- Backend and web typechecks passed. Stale `.next/types` referring to absent routes were regenerated.
- Backend and web lint checks passed; unrelated existing web warnings remain.
- Production web build passed. Final post-format typechecks and lint checks passed; the newsfeed files have no lint warnings. The build compiled in 10.8 seconds in this environment; no comparable pre-refactor timing was available.
- Real-wallet/passkey device workflows, screen-reader/mobile QA and large-media soak checks have **not** been performed. The release gate remains pending. The repository is implemented for review, not certified production-ready.
