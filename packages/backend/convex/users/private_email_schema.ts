import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Owner-only contact data. Never embed this in the publicly returned users document. */
export default defineTable({
  walletAddress: v.string(),
  email: v.string(),
  updatedAt: v.number(),
}).index("by_walletAddress", ["walletAddress"]);
