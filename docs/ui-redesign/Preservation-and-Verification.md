# UI redesign preservation and verification checklist

This checklist is the baseline for the Highrable visual redesign. The repository does not
currently contain the referenced `docs/obsidian/` vault, so source code, tests, and current
configuration remain authoritative.

## Preservation rules

- Keep all App Router routes, redirects, metadata, and route fallbacks.
- Keep mode-dependent navigation and visibility (`freelancer`, `client`, and verified `admin`). The
  shared shell now presents these links in a collapsible shadcn sidebar with a mobile Sheet; the
  top bar no longer repeats navigation tabs or the mode switch. The marketing footer remains on
  the landing page only.
- Keep Convex queries and mutations, wallet/passkey providers, Soroban transaction execution,
  transaction recovery, attachment uploads, and generated Convex files unchanged by visual work.
- Keep existing form schemas, validation, loading/error states, and success/error toasts.
- Keep the staged newsfeed implementation and its current session, media, moderation, reaction,
  comment, and repost boundaries unchanged.
- Do not add placeholder listings or imply that incomplete marketplace/networking features exist.

## Route and interaction inventory

| Route family                                                                | Content and controls                                                               | Data / boundary to preserve                                           | Verification                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `/`, `/home`                                                                | Marketing sections, waitlist/forms, wallet CTA, theme toggle                       | Landing content and links                                             | [ ] light/dark, natural scroll, mobile widths       |
| `/marketplace`, `/jobs`                                                     | Search, sort, payment filter, job cards, apply dialog, client posting form         | `api.jobs`, `api.applications`, job safety ordering, `/jobs` redirect | [ ] empty/loading/populated, apply guards           |
| `/marketplace/jobs/[jobId]`                                                 | Job details, applications, escrow, milestones, attachments, chat                   | Escrow hooks, wallet signing, job permissions                         | [ ] unauthorized, failure recovery, actions         |
| `/post-job`, `/onboarding`                                                  | Multi-step fields, uploads, validation, progress, registration                     | Zod schemas, storage uploads, registry registration                   | [ ] keyboard steps, upload failure, retry           |
| `/dashboard`                                                                | Mode-specific summaries, applications, ongoing jobs, payments, deadlines, registry | Dashboard queries and onboarding/admin gates                          | [ ] disconnected, role/mode, loading                |
| `/clients/[walletAddress]`, `/freelancers/[walletAddress]`                  | Cover, identity, trust/reputation, editing, activity                               | Profile queries and owner-only editing                                | [ ] missing/loading, edit dialog/form               |
| `/newsfeed`, `/newsfeed/[postId]`, moderation                               | Composer, media, posts, reactions, comments, reports, moderation                   | Social session token, media upload, Convex newsfeed APIs              | [ ] anonymous, connected, upload retry              |
| `/work-agreements/[agreementId]/review`, `/proof/[escrowId]`                | Terms, acceptance, evidence, chain links, proof timeline                           | Agreement permissions, wallet and transaction recovery                | [ ] unauthorized, pending, success/error            |
| `/disputes`, `/disputes/[disputeId]`                                        | Cases, evidence, responses, timeline, participant recovery                         | Participant action guards and dispute APIs                            | [ ] empty, failure boundary, recovery               |
| `/admin`, `/admin/disputes`, `/admin/disputes/[disputeId]`, `/admin/admins` | Metrics, queues, details, admin management, settlement                             | Server-auth owner checks and settlement boundaries                    | [ ] unauthorized, claim/review, settlement recovery |
| `/talent`                                                                   | Honest coming-soon state and job-posting action                                    | No invented listings                                                  | [ ] client-only gate, CTA                           |

## State matrix

Every redesigned surface should be checked in these states before handoff:

- [x] disconnected / wallet required remains represented in shared route states
- [x] loading, empty, populated, and recoverable failure states remain represented in route code
- [x] mode- and role-gated controls remain in place
- [x] mutation pending / progress and success/error feedback remain in place
- [x] keyboard-visible focus styles and Sheet escape behavior are implemented
- [ ] 375px, 768px, and 1440px layouts in light and dark themes: browser/device review unavailable in
      this environment

## Baseline checks recorded before redesign edits

- `pnpm --filter web typecheck`: passed.
- `pnpm --filter web lint:check`: passed with the repository's existing React/compiler warnings.
- `pnpm --filter web build`: passed after allowing the required Next.js/Turbopack worker processes;
  Next emitted existing Node `Buffer()` deprecation warnings.
- `pnpm --filter web test -- --reporter=dot`: 52 test files passed, 1 failed; 599 tests passed,
  9 failed. The nine failures remain isolated to
  `core/wallet/clients/stellar-wallet-kit-client.test.ts` and fail before assertions because
  `localStorage` is unavailable (`Cannot read properties of undefined (reading 'clear')`).
- Focused redesign/regression checks: 6 test files and 34 tests passed for newsfeed and dispute
  route recovery; the mode switch and composer checks also passed (4 tests).
- `pnpm --filter backend test`: 25 test files and 552 tests passed.
- `pnpm --filter backend typecheck`: passed.
- The dispute tests intentionally log sensitive-backend failure fixtures while validating route
  recovery; those cases passed.

## Review log

| Date       | Area                                                           | Result                | Notes                                                                                                                                      |
| ---------- | -------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-15 | Shared shell, route surfaces, and staged newsfeed presentation | Passed                | Visual-only changes; wallet/mode/data contracts retained                                                                                   |
| 2026-11-15 | Shared role-aware sidebar navigation                           | Passed                | Freelancer, client, admin filtering, profile route, mobile close behavior, and mode-switch ownership retained                              |
| 2026-11-15 | Shadcn sidebar and token alignment                             | Pending visual review | Sidebar uses semantic neutral surfaces, route breadcrumbs, mobile wallet access, and standard button variants; footer remains landing-only |
