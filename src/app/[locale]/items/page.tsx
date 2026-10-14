import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { NewItemForm } from "./new-item-form";
import { ItemRow, type ItemRowData } from "./item-row";

export async function generateMetadata({ params }: PageProps<"/[locale]/items">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await getMessages(locale)).items.title } : {};
}

export default async function ItemsPage({ params }: PageProps<"/[locale]/items">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">{t.items.title}</h1>
      <NewItemForm locale={locale} t={{ items: t.items, errors: t.errors, onboarding: t.onboarding }} />
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <MyItems locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

/** The caller's own items, public and private. */
async function MyItems({ locale, t }: { locale: Locale; t: Messages }) {
  const user = await requireOnboardedProfile(locale);
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("bucket_items")
    .select("id, title, status, visibility, timeframe, flexibility, budget, goal:goals(slug, status)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load items");

  if (items.length === 0) return <p className="text-muted-foreground">{t.items.empty}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item: ItemRowData) => (
        <ItemRow key={item.id} item={item} locale={locale} t={{ items: t.items, errors: t.errors, findBuddies: t.matches.findBuddies }} />
      ))}
    </ul>
  );
}
