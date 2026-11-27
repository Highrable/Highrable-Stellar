---
type: module
area: identity
status: current
last_updated: 2026-11-26
source_of_truth: repository
---

# Profiles and Reputation

## Purpose

Represent wallet-linked users/profiles and expose completed-work reputation and client trust surfaces.

## Current Status

Implemented for public freelancer/client profile routes, Convex reputation mirrors, and Soroban completion data. New onboarding uses consecutive role-choice and profile dialogs after wallet/passkey connection. The selected Client/Freelancer role is saved as the initial role and initializes app mode; people can switch modes later. The profile dialog requires first name, last name, username, and a private, format-validated email; email-address verification is not part of signup. Avatar is optional. Skills and social handles remain optional during signup, while profile editing retains its existing skill validation. New accounts complete only after a valid private email and a wallet-authorized registry entry read from the configured chain and mirrored in Convex. Existing completed accounts keep working without a retroactive email requirement. The registry contract is prepared but has not been deployed. Directory-wide talent search is not implemented.

## Primary Locations

- `packages/backend/convex/users/`
- `packages/backend/convex/registry/`
- `contracts/registry/`
- `packages/backend/convex/profiles.ts`
- `packages/backend/convex/reputation_records/`
- `contracts/reputation/src/lib.rs`
- `apps/web/features/profile/`, `client-profile/`, `talent/`
- `apps/web/app/freelancers/[walletAddress]/`, `clients/[walletAddress]/`, `talent/`

## Responsibilities

- Store normalized wallet address, initial role, wallet type, names, handles, optional skills/links, and onboarding state in `users`; store email separately in owner-only `privateEmails`.
- Build freelancer public profiles with completion/reputation data.
- Build client trust profiles with job, escrow, report, and payment-derived data.
- Mirror release-backed reputation into `reputationRecords` and query it by freelancer/job/milestone/escrow.

## Main Entry Points

Users: `upsertUser`, `recordWalletIdentity`, `saveProfileDraft`, `savePrivateEmail`, `getPrivateEmail`, `completeOnboarding`, and user queries. Registry: `syncUserRegistration`, `getVerifiedRegistration`, and internal `applyVerifiedRegistration`. Profiles: `updateFreelancerProfile`, `updateClientProfile`, `getFreelancerProfile`, `getClientTrustProfile`. Reputation: `createReputationRecord` and reputation queries.

## Data Model

`users` is wallet-keyed and supports `client`, `freelancer`, `admin` plus `external_wallet`/`passkey_smart_account`; it does not contain email. `privateEmails` stores one email per normalized wallet address. Email writes and owner reads require the signed wallet/passkey session token, derive the wallet from that token, and reject a supplied wallet claim that does not match. `saveProfileDraft` applies onboarding validation, handle uniqueness, and avatar checks without setting completion; empty skills are allowed only on this path. `completeOnboarding` preserves existing completion timestamps and, for new users, requires a valid saved profile, a private email, and a verified `registryRegistrations` row in configured network/contract scope. That row mirrors only wallet address, registration timestamp, and verification time. `reputationRecords` links an escrow/job/milestone to client/freelancer, amount, rating, optional review text/hash, tx hash, and timestamp.

## External Dependencies

Soroban reputation contract, Convex escrow sync, public profile routes, and optional avatar storage.

## Internal Dependencies

Jobs, escrows, applications, transactions, reports, and wallet identity.

## Important Flows

```text
wallet/passkey identity → role choice → profile + private email draft → signed registry registration → RPC verification/mirror → onboarding complete
released escrow → contract record_completion → optional sync → Convex reputationRecords
profile route → public stats and verified work/review queries
```

Registry registration is self-registration, not Highrable approval or identity verification. Any caller can invoke the contract, but the registered `G...` or `C...` address must authorize itself. Profiles remain in Convex.

## Common Change Locations

Use `users/schema.ts` for role/wallet enum changes; `users/mutations.ts` for draft/completion gates; `registry/` for verified registry mirrors; `profiles.ts` for profile response composition; `reputation_records/` for Convex mirror rules; `contracts/registry` and `contracts/reputation` for their on-chain record semantics.

## Risks / Gotchas

- Convex record creation must correspond to a released escrow and should not be treated as independent proof of chain settlement.
- `average_rating` on chain is integer division of total rating by completed count.
- Profiles are wallet-address based; switching between external and passkey modes can represent distinct addresses for the same human.

## Related Notes

[[contracts/Reputation Contract]], [[stellar/Wallet Identity Model]], [[modules/Marketplace and Jobs]]
