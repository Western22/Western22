/**
 * Text moderation contract. A provider looks at one piece of text and says
 * whether to allow it, let it through but send it to the moderation queue,
 * or block it outright.
 */
export type ModerationDecision = "allow" | "review" | "block";

export type ModerationCategory = "threat" | "hate" | "harassment" | "sexual" | "scam" | "spam" | "other";

export type ModerationVerdict = {
  decision: ModerationDecision;
  categories: ModerationCategory[];
};

/** What is being checked, so a provider can be stricter for some kinds. */
export type ModerationContext = { kind: "message" | "story" | "comment" | "group" };

export interface ModerationProvider {
  readonly name: string;
  check(text: string, context: ModerationContext): Promise<ModerationVerdict>;
}
