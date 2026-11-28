import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

function normalizeConvexUrl(value) {
  const match = /^https:\/\/([a-z0-9-]+)\.convex\.cloud\/?$/u.exec(value?.trim() ?? "");
  if (!match) {
    throw new Error("Expected a hosted Convex deployment URL (https://<deployment>.convex.cloud).");
  }
  return `https://${match[1]}.convex.cloud`;
}

export function validateConvexTarget(deployKey, expectedUrl) {
  const match = /^prod:([a-z0-9-]+)\|\S+$/u.exec(deployKey?.trim() ?? "");
  if (!match) {
    throw new Error("CONVEX_DEPLOY_KEY must be a Convex production deploy key.");
  }
  if (`https://${match[1]}.convex.cloud` !== normalizeConvexUrl(expectedUrl)) {
    throw new Error("CONVEX_DEPLOY_KEY does not target EXPECTED_CONVEX_URL.");
  }
}

export function validateVercelSettings(contents, expectedUrl) {
  const values = parseEnv(contents);
  if (values.NEXT_PUBLIC_STELLAR_NETWORK !== "testnet") {
    throw new Error("Vercel production must be configured for Stellar Testnet.");
  }
  if (normalizeConvexUrl(values.NEXT_PUBLIC_CONVEX_URL) !== normalizeConvexUrl(expectedUrl)) {
    throw new Error("Vercel production NEXT_PUBLIC_CONVEX_URL does not match EXPECTED_CONVEX_URL.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const expectedUrl = process.env.EXPECTED_CONVEX_URL;
    switch (process.argv[2]) {
      case "check-vercel":
        validateVercelSettings(readFileSync(".vercel/.env.production.local", "utf8"), expectedUrl);
        break;
      case "check-convex":
        validateConvexTarget(process.env.CONVEX_DEPLOY_KEY, expectedUrl);
        break;
      default:
        throw new Error("Expected check-vercel or check-convex.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
