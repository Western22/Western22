"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { isLocale } from "@/i18n/config";
import { getTranslationProvider } from "@/lib/translation";

/**
 * The Translate button. Signed-in people can translate a story, a comment or
 * a group chat message into the language they're reading the app in.
 *
 * 1. The text is read with the person's own Supabase client, so RLS decides
 *    whether they may see it (chat stays members-only). We never accept the
 *    text itself from the browser, so this can't be used as a free
 *    translation proxy.
 * 2. Translations are cached by sha256(text) + language in
 *    content_translations (server-only table), so each text is sent to the
 *    service at most once per language.
 * 3. translation_allowed() caps use per person: 60 an hour, and 20,000
 *    uncached characters a day.
 */

export type TranslateKind = "story" | "comment" | "message";
export type TranslateResult =
  | { ok: true; text: string; sourceLang: string | null; sameLanguage: boolean }
  | { ok: false; error: "notSignedIn" | "translationUnavailable" | "tooManyTranslations" | "notFound" | "generic" };

const input = z.object({
  kind: z.enum(["story", "comment", "message"]),
  id: z.string().uuid(),
  lang: z.string().refine((l) => isLocale(l)),
});

async function readText(kind: TranslateKind, id: string): Promise<string | null> {
  const supabase = await createClient();
  if (kind === "story") {
    const { data } = await supabase.from("stories").select("body").eq("id", id).maybeSingle();
    return data?.body ?? null;
  }
  if (kind === "comment") {
    const { data } = await supabase.from("story_comments").select("body").eq("id", id).maybeSingle();
    return data?.body ?? null;
  }
  const { data } = await supabase.from("group_messages").select("body, hidden_at").eq("id", id).maybeSingle();
  // Messages hidden by moderators aren't worth translating.
  return data && !data.hidden_at ? data.body : null;
}

export async function translateContent(kind: TranslateKind, id: string, lang: string): Promise<TranslateResult> {
  const parsed = input.safeParse({ kind, id, lang });
  if (!parsed.success) return { ok: false, error: "notFound" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "notSignedIn" };

  const provider = getTranslationProvider();
  const admin = createAdminClient();
  if (!provider || !admin) return { ok: false, error: "translationUnavailable" };

  const text = (await readText(parsed.data.kind, parsed.data.id))?.trim();
  if (!text) return { ok: false, error: "notFound" };
  const target = parsed.data.lang;
  const sourceHash = createHash("sha256").update(text).digest("hex");

  const { data: cached } = await admin
    .from("content_translations")
    .select("translated, source_lang")
    .eq("source_hash", sourceHash)
    .eq("target_lang", target)
    .maybeSingle();

  const chars = cached ? 0 : text.length;
  const { data: allowed, error: limitError } = await admin.rpc("translation_allowed", { p_user: user.id, p_chars: chars });
  if (limitError) {
    console.error("[translation] limit check failed", limitError.message);
    return { ok: false, error: "generic" };
  }
  if (!allowed) return { ok: false, error: "tooManyTranslations" };

  let translated: string;
  let sourceLang: string | null;
  if (cached) {
    translated = cached.translated;
    sourceLang = cached.source_lang;
  } else {
    if (!(await provider.supportsTarget(target))) return { ok: false, error: "translationUnavailable" };
    try {
      const result = await provider.translate(text, target);
      translated = result.text.slice(0, 8000);
      sourceLang = result.detectedSource;
    } catch (err) {
      console.error(`[translation] ${provider.name} failed`, err);
      return { ok: false, error: "generic" };
    }
    const { error } = await admin
      .from("content_translations")
      .upsert({ source_hash: sourceHash, target_lang: target, translated, source_lang: sourceLang, provider: provider.name });
    if (error) console.error("[translation] cache write failed", error.message);
  }

  await admin.from("translation_usage").insert({ user_id: user.id, chars, cached: Boolean(cached) });

  return { ok: true, text: translated, sourceLang, sameLanguage: sourceLang === target };
}
