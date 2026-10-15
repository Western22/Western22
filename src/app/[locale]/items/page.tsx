import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/seo";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { NewItemForm } from "./new-item-form";
import { ItemRow, type ItemRowData } from "./item-row";
import { getViewerRegion } from "@/lib/region-server";
import { budgetLabels } from "@/lib/region";

export async function generateMetadata({ params }: PageProps<"/[locale]/items">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { ...PRIVATE_PAGE, title: (await getMessages(locale)).items.title } : {};
}

export default async function ItemsPage({ params }: PageProps<"/[locale]/items">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">{t.items.title}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <ItemsBody locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

/**
 * The add form and the caller's own items. Budget labels are shown in the
 * viewer's currency, which depends on their settings, so both stream.
 */
async function ItemsBody({ locale, t }: { locale: Locale; t: Messages }) {
  const user = await requireOnboardedProfile(locale);
  const region = await getViewerRegion(locale);
  const items = { ...t.items, budget: budgetLabels(region, t.items.budgetRange) };
  return (
    <>
      <NewItemForm locale={locale} t={{ items, errors: t.errors, onboarding: t.onboarding }} />
      <MyItems userId={user.id} locale={locale} t={t} items={items} />
    </>
  );
}

/** The caller's own items, public and private. */
async function MyItems({ userId, locale, t, items: itemsT }: { userId: string; locale: Locale; t: Messages; items: Messages["items"] }) {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("bucket_items")
    .select("id, title, status, visibility, timeframe, flexibility, budget, goal:goals(slug, status)")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load items");

  if (items.length === 0) return <p className="text-muted-foreground">{t.items.empty}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item: ItemRowData) => (
        <ItemRow key={item.id} item={item} locale={locale} t={{ items: itemsT, errors: t.errors, findBuddies: t.matches.findBuddies, shareStory: t.stories.share }} />
      ))}
    </ul>
  );
}
