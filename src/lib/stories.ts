import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { StoryCard } from "@/lib/supabase/database.types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Hydrate story ids into cards (author, goal, tags, reactions, counts), keeping their order. */
export async function loadStoryCards(supabase: SupabaseClient, ids: string[], locale: string): Promise<StoryCard[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("story_cards", { p_ids: ids, p_locale: locale });
  if (error) throw new Error("Could not load stories");
  return data;
}
