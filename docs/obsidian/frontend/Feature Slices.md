---
type: reference
area: frontend
status: current
last_updated: 2026-11-28
source_of_truth: repository
---

# Feature Slices

| Slice | Main responsibility | Common entry points |
| --- | --- | --- |
| `admin` | Admin dashboard, dispute queue/detail, session gate, metrics/settlement UI. | `admin-dashboard-page.tsx`, `admin-disputes-page.tsx`, `admin-dispute-detail-page.tsx` |
| `attachments` | Uploads, attachment lists, protected viewer, access actions. | `components.tsx`, `protected-viewer.tsx` |
| `cancellations` | Cancellation request, eligibility, response, on-chain status/actions. | `components/`, `hooks/` |
| `chat` | Parent-linked collaboration UI. | `index.ts` plus consuming feature components |
| `client-profile` / `profile` | Public client trust/freelancer profile and editing. | `client-profile-page.tsx`, `freelancer-profile-page.tsx` |
| `dashboard` | Role-aware client/freelancer summaries and lists. | `dashboard-page.tsx`, dashboard hooks |
| `deadlines` | Deadline badges, reminder/notification panel. | `deadline-badge.tsx`, `notifications-panel.tsx` |
| `disputes` | Participant dispute list/detail and retryable chain marking. | `lib`, `types`, index exports |
| `jobs` | Job browsing/listing surface. | `jobs-page.tsx` |
| `landing` / `landing-v2` | Marketing/landing pages. | `landing-page.tsx`, `landing-v2-page.tsx` |
| `marketplace` | Marketplace, job detail, application, escrow and sync hooks. | `marketplace-page.tsx`, `job-detail-page.tsx`, hooks |
| `mode` | App-wide Freelancer/Client mode: provider, header switch, banner, `ModeGate`/`ModeOnly`, per-mode navigation. | `mode-provider.tsx`, `mode-config.ts`, `mode-gate.tsx` |
| `newsfeed` | Verified-session social feed, post/repost composer, expiring showcases, and media editing. | `newsfeed-page.tsx`, `composer.tsx`, `stories.tsx`, `image-editor.tsx` |
| `onboarding` | Wallet-linked profile setup and avatar upload. | `onboarding-page.tsx` |
| `post-job` | Job creation UI. | `post-job-page.tsx` |
| `proof` | Public escrow proof page and status/timeline/reputation display. | `escrow-proof-page.tsx` |
| `talent` | Planned directory presentation only. | `talent-page.tsx` |
| `work-agreements` | Agreement review and agreement UI. | `components.tsx`, index exports |
| `work-submissions` | Delivery/proof UI. | `index.ts` and consuming surfaces |

## UI mode and stepped forms

- `AppShell` wraps non-marketing routes in `AppModeProvider`. The mode (`freelancer` or `client`) reuses the per-wallet `highrable:dashboard:mode:<ADDRESS>` localStorage key and defaults from the user role. It is UI-only: it never changes backend authorization.
- The shell sets `data-mode` on its wrapper and on `<html>` (so portal dialogs inherit it). Product pages also set `data-product-ui="refresh"`; `/newsfeed` and `/messages` opt out, and the portaled work-chat sheet opts out locally. `apps/web/app/globals.css` re-points the `--highrable-orange-*` tokens to yellow under `[data-mode="client"]`; Freelancer keeps orange. `/admin` routes always use the default orange theme, a dedicated admin nav, and no mode switch.
- Client-only UI (`/post-job`, `/talent`, applicant lists, post-job button) is hidden in Freelancer mode, and apply forms/buttons are hidden in Client mode, using `ModeGate` (whole page) or `ModeOnly` (blocks).
- `features/common/components/form/form-stepper.tsx` provides `FormStepTabs`, `FormStepPanel`, `FormStepNav`. The connected step strip reports progress and supports arrow/Home/End keyboard navigation. Hidden panels keep job form state mounted, and onboarding exposes labeled panels for each step. The job form remains four steps; onboarding remains three; failed validation still selects the step that contains the error.
- Visual system: product routes use a neutral canvas, rounded white surfaces, restrained neutral fields, and a soft card shadow. Filled freelancer/admin actions use the orange-to-coral gradient; client actions remain yellow with dark labels (`--mode-on`). These shared styles do not apply to Newsfeed or Messages.
- Summary cards use `StatCard` (or `HighrableV2Metric` with `tone` + `icon`) with pastel `hr-tone-*` backgrounds. Wallet addresses always use `WalletAddressTile` (sky blue, copyable). The header shows a profile shortcut (`HeaderProfileLink`) that opens the profile matching the current mode.
- `/jobs` redirects to `/marketplace` (the single "Jobs and Applications" page). The My Work dashboard shows freelancer lists as tabs (Applied Jobs, Jobs in Progress, Payments Received). The mode switch and the connected-wallet card live only on the user's own profile pages. UI copy uses Title Case headings and plain words (payment hold, currency) instead of escrow/asset jargon, except on admin and dispute transaction-state screens.
- `StatusText` renders semantic status badges while domain status helpers continue to own label/tone mappings. `FileUploadZone` supplies an accessible drop and browse surface; attachment authorization, validation, upload progress, and retry remain feature-owned. `MilestoneTimeline` displays existing milestone records in order without changing their gates or actions.
- Disputes (list, detail, composers, timeline, dialog) and admin pages share the same cards, controls, and status tones. Protected admin access and role-specific controls remain unchanged.
- `TermHint` (`features/common/components/term-hint.tsx`) holds plain-language definitions (`PLAIN_TERMS`) for jargon such as escrow and wallet.
- Newsfeed supports inline text-only posts and opens the full composer to review selected media before publishing. Tags and milestones are optional and behind a disclosure. Attaching a milestone requires explicit public confirmation.
- Showcases require at least one photo or video, accept file selection or drag-and-drop, and display their public 24-hour lifespan at the top of the composer. Posts and showcases share media previews and show upload errors beside the publish controls.
- The mobile post and showcase composers fit inside the visual viewport while the software keyboard is open and scroll focused fields within the drawer body. Other responsive dialogs continue to use the shared drawer defaults.
- Newsfeed uses skeletons for route transitions, feed pagination, post and showcase details, and pending media. Post and showcase attachments use generic preview labels and omit original filenames from the interface. The showcase photo timer starts after the image is ready.
- Newsfeed creates opaque request IDs from Web Crypto's `getRandomValues()` during user actions so rendering and submission work when the browser lacks `randomUUID()`. Post and showcase drafts, comments, and replies reuse the same request ID on retry until success.
- Newsfeed post galleries use the existing media download when a video is at least half visible. Playback starts inline with sound when the browser permits it, retries muted when autoplay with sound is blocked, and pauses below the visibility threshold or when another post video starts. Native controls support manual playback and unmuting. Failed downloads can be retried from the media card.

## Cross-slice rules

- Use `@repo/convex-client` types rather than duplicating Convex document shapes.
- Use `core/stellar` for every direct chain operation; feature hooks coordinate UX and Convex bookkeeping.
- Use `core/wallet` identity instead of reading external/passkey contexts independently when a feature needs the active actor.
- Keep privacy/participant checks in backend helpers even if the UI hides a control.

See [[modules/README]], [[architecture/Frontend Architecture]], and [[frontend/Wallet and Stellar Client Layer]].
