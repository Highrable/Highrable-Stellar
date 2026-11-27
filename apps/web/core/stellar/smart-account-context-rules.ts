import { Buffer } from "buffer";

import {
  Account,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { bytesToHex } from "./hashes";

const DEFAULT_CONTEXT_RULE_ID = 0;

type TDefaultPasskeyRule = {
  readonly latestLedger: number;
  readonly valid_until: number | null;
  readonly signer: { readonly verifier: string; readonly keyData: Buffer };
};

export async function readDefaultContextRule(params: {
  readonly rpcUrl: string;
  readonly networkPassphrase: string;
  readonly contractId: string;
  readonly sourceAccount: string;
  readonly expectedWasmHash: string;
}): Promise<TDefaultPasskeyRule | null> {
  const server = new rpc.Server(params.rpcUrl, {
    allowHttp: params.rpcUrl.startsWith("http://"),
    timeout: 30_000,
  });
  const account = new Contract(params.contractId);
  const footprint = account.getFootprint();
  const { entries } = await server.getLedgerEntries(footprint);
  const [entry] = entries;
  if (!entry || entry.key.toXDR("base64") !== footprint.toXDR("base64")) {
    return null;
  }
  const instance = entry.val.contractData().val();
  const executable = instance.instance().executable();
  if (
    executable?.switch().name !== "contractExecutableWasm" ||
    bytesToHex(executable.wasmHash()) !== params.expectedWasmHash.toLowerCase()
  ) {
    return null;
  }

  const transaction = new TransactionBuilder(new Account(params.sourceAccount, "0"), {
    fee: BASE_FEE,
    networkPassphrase: params.networkPassphrase,
  })
    .addOperation(
      account.call("get_context_rule", nativeToScVal(DEFAULT_CONTEXT_RULE_ID, { type: "u32" })),
    )
    .setTimeout(30)
    .build();
  const simulation = await server.simulateTransaction(transaction);
  if (
    rpc.Api.isSimulationError(simulation) ||
    !simulation.result?.retval ||
    !Number.isSafeInteger(simulation.latestLedger) ||
    simulation.latestLedger < 0
  ) {
    return null;
  }

  const rule: unknown = scValToNative(simulation.result.retval);
  if (
    !rule ||
    typeof rule !== "object" ||
    !("id" in rule) ||
    rule.id !== DEFAULT_CONTEXT_RULE_ID ||
    !("context_type" in rule) ||
    !Array.isArray(rule.context_type) ||
    rule.context_type.length !== 1 ||
    rule.context_type[0] !== "Default" ||
    !("policies" in rule) ||
    !Array.isArray(rule.policies) ||
    rule.policies.length !== 0 ||
    !("signers" in rule) ||
    !Array.isArray(rule.signers) ||
    rule.signers.length !== 1 ||
    !("valid_until" in rule) ||
    (rule.valid_until !== null &&
      (typeof rule.valid_until !== "number" ||
        !Number.isInteger(rule.valid_until) ||
        rule.valid_until < 0))
  ) {
    return null;
  }

  const signer: unknown = rule.signers[0];
  if (
    !Array.isArray(signer) ||
    signer.length !== 3 ||
    signer[0] !== "External" ||
    typeof signer[1] !== "string" ||
    !(signer[2] instanceof Uint8Array) ||
    signer[2].length <= 65
  ) {
    return null;
  }

  return {
    latestLedger: simulation.latestLedger,
    valid_until: rule.valid_until,
    signer: { verifier: signer[1], keyData: Buffer.from(signer[2]) },
  };
}
