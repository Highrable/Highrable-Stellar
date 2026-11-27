"use client";

import { Buffer } from "buffer";

import {
  getSmartAccountConfigOrThrow,
  type ISmartAccountConfig,
  PasskeyConfigError,
} from "@/core/stellar/smart-account-config";
import {
  IndexedDBStorage,
  IndexerError,
  LocalStorageAdapter,
  SmartAccountKit,
} from "smart-account-kit";

import type {
  ConnectWalletResult,
  IndexedContractSummary,
  StorageAdapter,
  StoredCredential,
  StoredSession,
} from "smart-account-kit";

import { readDefaultContextRule } from "./smart-account-context-rules";

type TSmartAccountKit = InstanceType<typeof SmartAccountKit>;
const SMART_ACCOUNT_STORAGE_KEY_PREFIX = "highrable-passkey-smart-accounts";
const WEBAUTHN_PUBLIC_KEY_LENGTH = 65;

let smartAccountKit: TSmartAccountKit | null = null;

export interface IConnectFreshPasskeyOptions {
  readonly preferredContractId?: string;
}

function normalizeContractId(contractId: string): string {
  return contractId.trim().toUpperCase();
}

function normalizeCredentialIdToHex(credentialId: string): string {
  const normalized = credentialId.trim().replace(/^0x/i, "");

  if (/^[0-9a-f]+$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  try {
    const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = atob(padded);

    return Array.from(decoded, (character) =>
      character.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return normalized.toLowerCase();
  }
}

function selectDiscoveredContract(
  contracts: readonly IndexedContractSummary[],
  preferredContractId?: string,
): IndexedContractSummary | null {
  if (contracts.length === 0) {
    return null;
  }

  if (preferredContractId) {
    return (
      contracts.find(
        (contract) => normalizeContractId(contract.contract_id) === preferredContractId,
      ) ?? null
    );
  }

  return (
    [...contracts].sort((left, right) => right.last_seen_ledger - left.last_seen_ledger)[0] ?? null
  );
}

function isTransientIndexedDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("database connection is closing") ||
    normalizedMessage.includes("transaction") ||
    normalizedMessage.includes("indexeddb")
  );
}

class ResilientBrowserStorage implements StorageAdapter {
  private primary: StorageAdapter;
  private readonly fallback: StorageAdapter;

  public constructor(private readonly storageKey: string) {
    this.primary = new IndexedDBStorage(storageKey);
    this.fallback = new LocalStorageAdapter(storageKey);
  }

  private resetPrimary(): void {
    this.primary = new IndexedDBStorage(this.storageKey);
  }

  private async run<T>(operation: (storage: StorageAdapter) => Promise<T>): Promise<T> {
    try {
      return await operation(this.primary);
    } catch (error) {
      if (!isTransientIndexedDbError(error)) {
        throw error;
      }
    }

    this.resetPrimary();

    try {
      return await operation(this.primary);
    } catch (error) {
      if (!isTransientIndexedDbError(error)) {
        throw error;
      }

      return await operation(this.fallback);
    }
  }

  public async save(credential: StoredCredential): Promise<void> {
    await this.run((storage) => storage.save(credential));
  }

  public async get(credentialId: string): Promise<StoredCredential | null> {
    return await this.run((storage) => storage.get(credentialId));
  }

  public async getByContract(contractId: string): Promise<StoredCredential[]> {
    return await this.run((storage) => storage.getByContract(contractId));
  }

  public async getAll(): Promise<StoredCredential[]> {
    return await this.run((storage) => storage.getAll());
  }

  public async delete(credentialId: string): Promise<void> {
    await this.run((storage) => storage.delete(credentialId));
  }

  public async update(
    credentialId: string,
    updates: Partial<Omit<StoredCredential, "credentialId" | "publicKey">>,
  ): Promise<void> {
    await this.run((storage) => storage.update(credentialId, updates));
  }

  public async clear(): Promise<void> {
    await Promise.allSettled([this.primary.clear(), this.fallback.clear()]);
    this.resetPrimary();
  }

  public async saveSession(session: StoredSession): Promise<void> {
    await this.run((storage) => storage.saveSession(session));
  }

  public async getSession(): Promise<StoredSession | null> {
    return await this.run((storage) => storage.getSession());
  }

  public async clearSession(): Promise<void> {
    await Promise.allSettled([this.primary.clearSession(), this.fallback.clearSession()]);
    this.resetPrimary();
  }
}

function createStorageKey(
  config: Pick<ISmartAccountConfig, "accountWasmHash" | "webauthnVerifierAddress" | "rpId">,
): string {
  return [
    SMART_ACCOUNT_STORAGE_KEY_PREFIX,
    config.accountWasmHash.slice(0, 16),
    config.webauthnVerifierAddress.slice(0, 16),
    config.rpId,
  ].join(":");
}

function createStorage(config: ISmartAccountConfig): StorageAdapter {
  if (typeof window === "undefined") {
    throw new PasskeyConfigError("Passkey smart accounts can only be initialized in the browser.");
  }

  const storageKey = createStorageKey(config);

  if ("indexedDB" in window) {
    return new ResilientBrowserStorage(storageKey);
  }

  return new LocalStorageAdapter(storageKey);
}

export async function resetSmartAccountKit(): Promise<void> {
  if (smartAccountKit) {
    try {
      await smartAccountKit.disconnect();
    } catch {
      // A stale SDK instance should not block recreating it with fresh storage.
    }
  }

  smartAccountKit = null;
}

export function getSmartAccountKit(): TSmartAccountKit {
  if (typeof window === "undefined") {
    throw new PasskeyConfigError("Passkey smart accounts can only be initialized in the browser.");
  }

  if (smartAccountKit) {
    return smartAccountKit;
  }

  const config = getSmartAccountConfigOrThrow();

  smartAccountKit = new SmartAccountKit({
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    accountWasmHash: config.accountWasmHash,
    webauthnVerifierAddress: config.webauthnVerifierAddress,
    rpId: config.rpId,
    rpName: config.rpName,
    storage: createStorage(config),
    ...(config.relayerUrl ? { relayerUrl: config.relayerUrl } : {}),
  });

  return smartAccountKit;
}

function isIndexerUnavailable(error: unknown): boolean {
  return (
    error instanceof IndexerError &&
    (error.status === 0 || (error.status >= 500 && error.status < 600))
  );
}

export async function discoverPasskeyContracts(kit: TSmartAccountKit, credentialId: string) {
  try {
    const contracts = await kit.discoverContractsByCredential(credentialId);
    return { contracts, indexerUnavailable: false };
  } catch (error) {
    if (!isIndexerUnavailable(error)) {
      throw error;
    }
    return { contracts: null, indexerUnavailable: true };
  }
}

export async function connectPasskeySmartAccount(
  kit: TSmartAccountKit,
  options: {
    readonly credentialId: string;
    readonly contractId?: string;
    readonly indexerUnavailable?: boolean;
  },
): Promise<ConnectWalletResult | null> {
  const { credentialId, indexerUnavailable } = options;
  const contractId =
    options.contractId ??
    (indexerUnavailable && kit.credentialId === credentialId ? kit.contractId : undefined);
  let result: ConnectWalletResult | null;
  try {
    result = await kit.connectWallet({ credentialId, contractId, fresh: true });
  } catch (error) {
    if (
      indexerUnavailable &&
      error instanceof Error &&
      error.message.startsWith("Smart account contract not found on-chain for credential ")
    ) {
      throw new Error(
        "The passkey indexer is unavailable and Stellar RPC could not locate this smart account. Try reconnecting when the indexer is available.",
      );
    }
    throw error;
  }

  if (result) {
    if (
      indexerUnavailable &&
      contractId &&
      normalizeContractId(result.contractId) !== normalizeContractId(contractId)
    ) {
      await kit.disconnect().catch(() => undefined);
      throw new Error("The passkey resolved to a different smart account.");
    }
    await ensureConnectedPasskeyWalletShape({
      contractId: result.contractId,
      credentialId: result.credentialId,
      kit,
      indexerUnavailable,
    });
  }

  return result;
}

export async function connectFreshPasskeySmartAccount(
  options: IConnectFreshPasskeyOptions = {},
): Promise<ConnectWalletResult> {
  const kit = getSmartAccountKit();
  const preferredContractId = options.preferredContractId
    ? normalizeContractId(options.preferredContractId)
    : undefined;
  const { credentialId } = await kit.authenticatePasskey();
  const { contracts, indexerUnavailable } = await discoverPasskeyContracts(kit, credentialId);
  const matchedContract = contracts
    ? selectDiscoveredContract(contracts, preferredContractId)
    : null;

  if (preferredContractId && contracts && contracts.length > 0 && !matchedContract) {
    throw new Error(
      `The selected passkey is not linked to smart account ${preferredContractId}. Select the passkey that owns that smart account or switch to the matching smart account before retrying.`,
    );
  }

  const result = await connectPasskeySmartAccount(kit, {
    credentialId,
    contractId: matchedContract
      ? normalizeContractId(matchedContract.contract_id)
      : preferredContractId,
    indexerUnavailable,
  });

  if (!result) {
    throw new Error("Reconnect your passkey smart account to continue.");
  }

  return result;
}

async function verifyPasskeySignerOnChain(
  kit: TSmartAccountKit,
  config: ISmartAccountConfig,
  contractId: string,
  credentialId?: string | null,
): Promise<void> {
  try {
    const rule = await readDefaultContextRule({
      contractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      sourceAccount: kit.deployerPublicKey,
      expectedWasmHash: config.accountWasmHash,
    }).catch(() => null);

    if (!rule) {
      throw new Error(
        "The passkey indexer is unavailable and Stellar RPC could not verify a single-passkey default rule for this smart account.",
      );
    }
    if (rule.valid_until !== null && rule.valid_until < rule.latestLedger) {
      throw new Error("The smart account's default passkey rule has expired.");
    }

    const credential = Buffer.from(
      (credentialId ?? "").replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    if (
      credential.length === 0 ||
      !rule.signer.keyData.subarray(WEBAUTHN_PUBLIC_KEY_LENGTH).equals(credential)
    ) {
      throw new Error("The authenticated passkey is not an active signer on this smart account.");
    }
    if (rule.signer.verifier !== config.webauthnVerifierAddress) {
      throw new Error(
        `This smart account uses WebAuthn verifier ${rule.signer.verifier} instead of the configured verifier ${config.webauthnVerifierAddress}.`,
      );
    }
    if (kit.contractId !== contractId || kit.credentialId !== credentialId) {
      throw new Error(
        "The connected smart account changed during verification. Reconnect to continue.",
      );
    }
  } catch (error) {
    // The SDK records a session before Highrable verifies its signer.
    if (kit.contractId === contractId && kit.credentialId === credentialId) {
      await kit.disconnect().catch(() => undefined);
    }
    throw error;
  }
}

export async function ensureConnectedPasskeyWalletShape(params: {
  readonly contractId: string;
  readonly credentialId?: string | null;
  readonly kit?: TSmartAccountKit;
  readonly indexerUnavailable?: boolean;
}): Promise<void> {
  const kit = params.kit ?? getSmartAccountKit();
  const config = getSmartAccountConfigOrThrow();
  const contractId = normalizeContractId(params.contractId);
  if (params.indexerUnavailable) {
    return await verifyPasskeySignerOnChain(kit, config, contractId, params.credentialId);
  }

  let details;
  try {
    details = await kit.getContractDetailsFromIndexer(contractId);
  } catch (error) {
    if (!isIndexerUnavailable(error)) {
      throw error;
    }
    return await verifyPasskeySignerOnChain(kit, config, contractId, params.credentialId);
  }

  if (!details || !kit.wallet) {
    return;
  }

  const activeSigners = details.contextRules.flatMap((rule) => rule.signers);

  if (details.contextRules.length > 0 && activeSigners.length === 0) {
    throw new Error("Failed to load active signer details for the connected smart account.");
  }

  if (!params.credentialId) {
    return;
  }

  const credentialId = normalizeCredentialIdToHex(params.credentialId);

  const activeSigner = activeSigners.find(
    (signer) =>
      signer.credential_id && normalizeCredentialIdToHex(signer.credential_id) === credentialId,
  );

  if (!activeSigner) {
    throw new Error("The authenticated passkey is not an active signer on this smart account.");
  }

  if (activeSigner.signer_type !== "External") {
    throw new Error("The authenticated signer is not a current WebAuthn signer.");
  }

  if (!activeSigner.signer_address) {
    throw new Error("The authenticated signer is missing its WebAuthn verifier address.");
  }

  if (normalizeContractId(activeSigner.signer_address) !== config.webauthnVerifierAddress) {
    throw new Error(
      `This smart account uses WebAuthn verifier ${activeSigner.signer_address} instead of the configured verifier ${config.webauthnVerifierAddress}.`,
    );
  }
}

export async function clearSmartAccountLocalSession(): Promise<void> {
  if (typeof window === "undefined") {
    throw new PasskeyConfigError("Passkey smart accounts can only be managed in the browser.");
  }

  const config = getSmartAccountConfigOrThrow();
  const currentStorage = createStorage(config);
  const legacyStorage =
    "indexedDB" in window
      ? new ResilientBrowserStorage(SMART_ACCOUNT_STORAGE_KEY_PREFIX)
      : new LocalStorageAdapter(SMART_ACCOUNT_STORAGE_KEY_PREFIX);

  try {
    await Promise.allSettled([currentStorage.clear(), legacyStorage.clear()]);
  } catch {
    await Promise.allSettled([currentStorage.clearSession(), legacyStorage.clearSession()]);
  }

  if (smartAccountKit) {
    try {
      await smartAccountKit.disconnect();
    } catch {
      // The local storage clear above is the source of truth for this recovery action.
    }
  }

  smartAccountKit = null;
}
