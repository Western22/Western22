import "server-only";
import { heuristicsProvider } from "./heuristics";
import type { ModerationContext, ModerationProvider, ModerationVerdict } from "./types";

export type { ModerationContext, ModerationVerdict } from "./types";

/**
 * Pluggable text moderation. Server Actions call moderateText() before saving
 * a message, story, comment or group; "block" stops the write and "review"
 * saves it and files an automatic report (flag_my_content) for moderators.
 *
 * Pick the provider with MODERATION_PROVIDER (default "heuristics", free and
 * local). To add one, implement ModerationProvider and register it below.
 * TODO(moderation-provider): an external classifier (e.g. a hosted moderation
 * API) for hate and sexual content in many languages; ask before adding a paid one.
 */
const providers: Record<string, ModerationProvider> = {
  heuristics: heuristicsProvider,
};

function provider(): ModerationProvider {
  const name = process.env.MODERATION_PROVIDER || "heuristics";
  const chosen = providers[name];
  if (!chosen) throw new Error(`Unknown MODERATION_PROVIDER "${name}". Known: ${Object.keys(providers).join(", ")}`);
  return chosen;
}

export async function moderateText(text: string, context: ModerationContext): Promise<ModerationVerdict> {
  const trimmed = text.trim();
  if (!trimmed) return { decision: "allow", categories: [] };
  try {
    return await provider().check(trimmed, context);
  } catch (error) {
    // A provider outage shouldn't stop people talking; the database term list still applies.
    console.error("moderation provider failed", error);
    return { decision: "allow", categories: [] };
  }
}
