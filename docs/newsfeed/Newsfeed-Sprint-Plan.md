# Participant Newsfeed — Phased Sprint Plan

Five estimated two-week sprints for one frontend and one backend engineer, with shared design and QA. Every ticket starts **planned**. The current column records implemented source and automated verification; it does not imply production deployment or manual release acceptance.

The referenced `docs/obsidian/Home.md`, `Repository Map.md`, and vault are absent in this checkout. No vault notes were invented. Read `GEMINI.md` and relevant implementation directly. This backlog was also absent and is now created.

## Scope

Public reading; any verified signed-in wallet account can contribute. Text, photos, videos, six reactions, flat comments, reposts, shareable links, and profile Activity. Participant names are used when available, with a safe fallback for accounts that have not created a profile. No ranking, follows, nested replies, résumé sections, or notifications. No changes to contracts, escrow synchronization, reputation calculations, or chain writes.

## Sprint 1 — Identity and foundations

| Ticket                          | Dependency | Acceptance criteria                                                                                            | Initial | Current                                                                                       |
| ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| NF-101 Inventory                | —          | Document existing profiles, attachments, external sessions, and passkey behavior                               | planned | Implemented: Architecture-and-Operations.md                                                   |
| NF-102 Verified identity        | NF-101     | Never trust a supplied author address; reject impersonation, expired sessions and mismatched passkey proofs    | planned | Implemented; token authorization and P-256 proof tests pass; live wallet verification pending |
| NF-103 Contribution eligibility | NF-102     | Require a verified signed-in wallet; do not block contribution on onboarding, role, or profile-name completion | planned | Implemented and tested                                                                        |
| NF-104 Social data model        | NF-102     | Author IDs, ownership checks, cursor indexes and retry-safe operations                                         | planned | Implemented and tested                                                                        |
| NF-105 Storage feasibility      | NF-101     | Document long text, media limits, ownership, cancellation and recovery without inherited attachment caps       | planned | Implemented chunk transport; large-device soak testing pending                                |
| NF-106 Profile authorization    | NF-102     | New professional profile fields use verified identity; leave unrelated marketplace writes scoped out           | planned | Implemented in isolated socialProfiles table                                                  |

## Sprint 2 — Publishing and public reading

| Ticket                            | Dependency     | Acceptance criteria                                                                               | Initial | Current                                                                        |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| NF-201 Routes and slice           | NF-104         | Thin `/newsfeed`, `/newsfeed/[postId]` routes, public reading and navigation                      | planned | Implemented; onboarding exemption added                                        |
| NF-202 Composer                   | NF-103, NF-105 | Text-only, media-only, mixed; progress, cancel, retry, preview, remove; retain failed drafts      | planned | Implemented; failure/retry tests pass                                          |
| NF-203 Media lifecycle            | NF-105         | Server ownership and signature validation; reject incomplete publication; clean abandoned uploads | planned | Implemented and tested for tracked chunks; hard-crash orphan review documented |
| NF-204 Feed                       | NF-201, NF-203 | Newest published first, cursors, name/avatar/time, expandable text and incremental media          | planned | Implemented; pagination and long-text backend tests pass                       |
| NF-205 Author controls and states | NF-202, NF-204 | Author text edit/delete; loading, empty, failure, unavailable and signed-out states               | planned | Implemented; live UI acceptance pending                                        |

## Sprint 3 — Interactions

| Ticket                          | Dependency | Acceptance criteria                                                                                                | Initial | Current                                                                                  |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------- |
| NF-301 Reactions                | NF-204     | Like/Celebrate/Support/Love/Insightful/Funny; one per participant; retry-safe counters                             | planned | Implemented; concurrent backend tests pass                                               |
| NF-302 Comments                 | NF-204     | Paginated flat comments, owner edit/delete, participant names                                                      | planned | Implemented; backend retry tests pass                                                    |
| NF-303 Reposts and links        | NF-205     | Optional commentary, canonical original reference, original attribution, unavailable original, native/copy sharing | planned | Implemented; canonicalization/deletion tests pass                                        |
| NF-304 Consistency and recovery | NF-301–303 | Single shared records across feed/profile/permalink; retries do not duplicate; optimistic failure rolls back       | planned | Backend verified; Convex optimistic update rollback used; live cross-view checks pending |

## Sprint 4 — Professional profiles

| Ticket                            | Dependency     | Acceptance criteria                                                                                            | Initial | Current                                                                                        |
| --------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| NF-401 Profile fields             | NF-106         | Both profiles expose cover/avatar, participant name, headline, About, skills and links                         | planned | Implemented; image URLs supported alongside existing avatar storage                            |
| NF-402 Existing identity and work | NF-401         | Preserve URLs, escrow stats/history and reputation; company secondary; legacy fallback “Highrable participant” | planned | Implemented; regression suite passes                                                           |
| NF-403 Activity                   | NF-204, NF-303 | Reuse cards and author query for authored posts/reposts; no copied records                                     | planned | Implemented; backend pagination verified                                                       |
| NF-404 Responsive and keyboard QA | NF-401–403     | Mobile profile/feed layouts, accessible control names, keyboard operation                                      | planned | Responsive source and labeled controls implemented; manual device/screen-reader checks pending |

## Sprint 5 — Release readiness

| Ticket                             | Dependency     | Acceptance criteria                                                                              | Initial | Current                                                                                 |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------- |
| NF-501 Reporting/moderation        | NF-302         | Post/comment reports, restricted admin hide/restore and audit records                            | planned | Implemented at `/newsfeed/moderation`; authorization tests pass                         |
| NF-502 Security checks             | NF-203, NF-501 | Safe text, supported MIME signatures, ownership, exact origins, session expiry                   | planned | Automated checks pass; production origin and account binding smoke tests pending        |
| NF-503 Integration and regressions | NF-304, NF-404 | Pagination, concurrency, failed media, deleted originals, large text, existing marketplace tests | planned | Automated checks recorded in operations note; browser memory/media soak testing pending |
| NF-504 Operational readiness       | NF-503         | Configuration, cleanup, monitoring, rollout and rollback documented                              | planned | Implemented; deployment configuration intentionally not changed                         |
| NF-505 Release gate                | NF-501–504     | External-wallet and passkey users complete entire workflow; device QA and release checks pass    | planned | **Pending manual verification; deployment session secret must be configured**           |

## Release acceptance checklist

- [ ] Configure matching web/Convex social secrets, origins, RPC and upload site URL in staging.
- [ ] Verify a real external wallet and a real supported single-signer passkey account.
- [ ] Publish text, a >25 MB video, multiple images, and a post exceeding 1 MiB of text.
- [ ] Cancel/retry an upload, expire a session, disconnect/switch wallets, and retry an ambiguously completed publish.
- [ ] Compare reactions, comment edits, reposts and deletions across feed, permalink and both profile routes.
- [ ] Exercise administrator report review, hide, restore, and audit inspection.
- [ ] Check narrow mobile layouts, keyboard focus, screen-reader labels and video controls.
- [ ] Review chunk-storage quotas, stale uploads, crash-orphan procedure and operational logging.
- [ ] Configure the deployment session secret and record the manual results here.
