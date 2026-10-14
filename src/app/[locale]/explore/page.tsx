import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";

export async function generateMetadata({ params }: PageProps<"/[locale]/explore">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await getMessages(locale)).explore.title } : {};
}

export default async function ExplorePage({ params }: PageProps<"/[locale]/explore">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.explore.title}</h1>
        <p className="text-muted-foreground">{t.explore.subtitle}</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <PublicFeed t={t} />
      </Suspense>
    </div>
  );
}

/** Latest public items from everyone. RLS hides private items. */
async function PublicFeed({ t }: { t: Messages }) {
  const supabase = await createClient();
  // TODO(feed): add pagination (cursor on created_at) once volume grows.
  const { data: items, error } = await supabase
    .from("bucket_items")
    .select("id, title, category, place_name, owner:profiles(username, display_name)")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load feed");

  if (items.length === 0) return <p className="text-muted-foreground">{t.explore.empty}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="font-medium break-words">{item.title}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>{t.items.category[item.category]}</span>
            {item.place_name && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {item.place_name}
              </span>
            )}
            <span>
              {t.explore.by} {item.owner?.display_name ?? item.owner?.username ?? t.explore.anonymous}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
