import assert from "node:assert/strict";
import test from "node:test";

import { validateConvexTarget, validateVercelSettings } from "./deploy-production.mjs";

const expectedUrl = "https://release-test.convex.cloud";
const deployKey = "prod:release-test|synthetic-key";

function vercelSettings(network = "testnet", url = expectedUrl) {
  return `NEXT_PUBLIC_CONVEX_URL="${url}"\nNEXT_PUBLIC_STELLAR_NETWORK="${network}"\n`;
}

test("accepts a matching production key and Vercel configuration", () => {
  assert.doesNotThrow(() => validateConvexTarget(deployKey, expectedUrl));
  assert.doesNotThrow(() => validateVercelSettings(vercelSettings(), `${expectedUrl}/`));
});

test("rejects missing keys, preview keys, and production keys for another deployment", () => {
  assert.throws(() => validateConvexTarget(undefined, expectedUrl), /production deploy key/u);
  assert.throws(
    () => validateConvexTarget("preview:team:project|synthetic-key", expectedUrl),
    /production deploy key/u,
  );
  assert.throws(
    () => validateConvexTarget("prod:another-project|synthetic-key", expectedUrl),
    /does not target/u,
  );
});

test("rejects a different frontend target, a non-Testnet release, or an invalid expected URL", () => {
  assert.throws(
    () =>
      validateVercelSettings(vercelSettings("testnet", "https://other.convex.cloud"), expectedUrl),
    /does not match/u,
  );
  assert.throws(() => validateVercelSettings(vercelSettings("mainnet"), expectedUrl), /Testnet/u);
  assert.throws(() => validateConvexTarget(deployKey, undefined), /hosted Convex deployment URL/u);
  assert.throws(
    () => validateVercelSettings(vercelSettings(), `${expectedUrl}:1234`),
    /hosted Convex deployment URL/u,
  );
});
