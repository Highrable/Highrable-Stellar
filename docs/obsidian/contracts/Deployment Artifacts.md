---
type: contract
area: deployment
status: current
last_updated: 2026-11-25
source_of_truth: repository
---

# Deployment Artifacts

## Tracked artifacts

- `deployments/testnet.json`: recorded Stellar Testnet network/RPC/Horizon values, escrow/reputation IDs, platform admin, deployer metadata, and deployment timestamp.
- deployments/testnet-multi-admin.json: a separate Testnet record added on 2026-09-29 with a different escrow/reputation pair and deployment timestamp for the multi-admin work.
- `deployments/mainnet.json`: recorded Stellar Mainnet network/RPC/Horizon values, escrow/reputation IDs, platform admin, deployer metadata, and deployment timestamp.
- `deployments/smart-accounts/testnet.json`: smart-account metadata placeholder with empty WASM/verifier/factory/relayer/verification fields.
- `deployments/smart-accounts/mainnet.json`: smart-account metadata placeholder with empty WASM/verifier/factory/relayer/verification fields and an explicit warning that configuration readiness is not an audit.
- `deployments/registry-<network>.json`: reserved output of `scripts/deploy-registry.sh`; no registry deployment artifact is currently present.

The escrow/reputation JSON files contain public contract/account metadata; the smart-account files do not prove that smart-account artifacts are deployed or verified. Never add private deployment identities, secret keys, or credentials to these notes.

## Deployment workflow

`scripts/deploy-contracts.sh`:

1. Validates network, endpoints, deployer identity, platform-admin public key, and account existence.
2. Builds both Rust contracts.
3. Estimates upload/invocation fees.
4. Uploads/deploys reputation and escrow WASM.
5. Initializes/wires the contracts in the expected order.
6. Verifies contract wiring and optionally allowlists configured token contracts.
7. Writes the selected JSON artifact and prints environment variable names/values for operators.

`scripts/deploy-registry.sh` is an independent path. It builds only the registry crate, uploads/deploys only the registry WASM, derives a deterministic ID, and writes a separate registry artifact. `scripts/verify-registry.sh` uses read-only invocations and does not submit transactions. Neither script was executed for this change.

`deploy-testnet.sh` supplies testnet defaults. `deploy-mainnet.sh` requires `MAINNET_DEPLOY_CONFIRM=deploy-highrable-mainnet`, HTTPS non-testnet endpoints, and mainnet-specific environment. `verify-testnet.sh` checks contract links, platform admin, next escrow ID, and configured allowlist values.

## Smart-account metadata

The web readiness code expects public metadata such as account WASM hash, verifier contract ID/hash, factory ID, deployment label/version/source repository, app domain/RP ID, payment assets, and relayer kind. The tracked smart-account artifacts currently leave those values empty. Fill them only from verified deployment evidence.

## Production distinction

The read-only `scripts/verify-deployment-identity.mjs` compares explicit backend scope and operator-attested tested build hashes against RPC network, instance identities, reciprocal links, and actual code bytes. Its final observation also requires each code entry's observed lifetime to reach the final ledger; insufficient lifetime yields an unknown result instead of a false match. See [Deliverable 2 C20 evidence](../../instawards/Deliverable-2-C20-Deployment-Identity-Evidence.md). Local fixture tests do not establish live deployment identity.

Recorded contract IDs, configured environment, readiness checks, and a successful deployment are separate claims. None alone proves audited production infrastructure, funded relayer operation, or safe mainnet passkey escrow.

## Dispute-admin contract version

The canonical `deployments/testnet.json` and `deployments/mainnet.json` record earlier deployments. On 2026-11-25, a read-only Stellar Testnet RPC check at ledger 5915483 found the live escrow instance from `deployments/testnet-multi-admin.json`. The deployed WASM exports `add_dispute_admin`, `remove_dispute_admin`, `is_dispute_admin`, and `resolve_dispute`. Simulations returned the recorded owner from `get_platform_admin` and `true` from `is_dispute_admin` for that wallet.

The artifact predates the checked-in membership and event changes and has no deployment transaction link or WASM hash. The RPC observations establish the live interface and owner membership. The exact source build, delegated settlement behavior, participant-conflict enforcement, and C16 event emission remain unverified. Keep Convex deployments isolated across contract scopes with overlapping escrow IDs.

## Related Notes

[[operations/Deployment]], [[stellar/Mainnet Readiness and Relayers]], [[contracts/Contracts Overview]]
