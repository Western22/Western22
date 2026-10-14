import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BADGE_EMOJI, earnedBadges } from "@/lib/badges";
import { languageName } from "@/lib/onboarding";
import { usernameSchema } from "@/lib/validation";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

/**
 * Public profile. Shows only public fields and public items; never location,
 * email or phone. The username is only known at request time, so everything,
 * including reading params, happens inside the Suspense boundary.
 */
export default function PublicProfilePage({ params }: PageProps<"/[locale]/u/[username]">) {
  return (
    <Suspense fallback={<div aria-hidden className="bg-muted/60 h-64 animate-pulse rounded-3xl" />}>
      <PublicProfile params={params} />
    </Suspense>
  );
}

async function PublicProfile({ params }: { params: PageProps<"/[locale]/u/[username]">["params"] }) {
  const { locale, username } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) notFound();

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, home_city, home_country, languages, interests, travel_styles")
    .eq("username", parsed.data)
    .maybeSingle();
  if (error) throw new Error("Could not load profile");
  if (!profile) notFound();

  const [stats, items, viewer] = await Promise.all([
    supabase.rpc("profile_stats", { p_profile_id: profile.id }),
    supabase
      .from("bucket_items")
      .select("id, title, status")
      .eq("owner_id", profile.id)
      .eq("visibility", "public")
      .neq("status", "done")
      .order("created_at", { ascending: false })
      .limit(50),
    getCurrentUser(),
  ]);
  if (stats.error || items.error) throw new Error("Could not load profile");

  const completedCount = Number(stats.data[0]?.completed_count ?? 0);
  const activeCount = Number(stats.data[0]?.active_count ?? 0);
  const badges = earnedBadges({ activeCount, completedCount, languageCount: profile.languages.length });
  const name = profile.display_name || `@${profile.username}`;
  const place = [profile.home_city, profile.home_country].filter(Boolean).join(", ");
  const p = t.publicProfile;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <section className="from-primary/15 via-accent to-background flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br p-6 text-center">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
          <img src={profile.avatar_url} alt="" className="border-background size-24 rounded-full border-4 object-cover shadow-md" />
        ) : (
          <div aria-hidden className="bg-background flex size-24 items-center justify-center rounded-full border-4 text-4xl shadow-md">
            {name.replace("@", "").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
          <p className="text-muted-foreground text-sm">@{profile.username}</p>
        </div>
        {/* Only the city label the person typed; their stored location is never exposed. */}
        {place && (
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            <MapPin className="size-4" aria-hidden />
            {format(p.from, { place })}
          </p>
        )}
        {profile.bio && <p className="max-w-prose text-pretty">{profile.bio}</p>}
        <dl className="mt-2 flex gap-8">
          <div className="flex flex-col-reverse">
            <dt className="text-muted-foreground text-xs">{p.completed}</dt>
            <dd className="text-2xl font-bold">{completedCount}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-muted-foreground text-xs">{p.active}</dt>
            <dd className="text-2xl font-bold">{activeCount}</dd>
          </div>
        </dl>
        {viewer?.id === profile.id && (
          <Button asChild variant="outline" size="sm" className="bg-background/80">
            <Link href={`/${locale}/profile`}>{p.editProfile}</Link>
          </Button>
        )}
      </section>

      {(profile.languages.length > 0 || profile.interests.length > 0 || profile.travel_styles.length > 0) && (
        <section className="flex flex-col gap-3">
          {profile.languages.length > 0 && (
            <p className="text-sm">
              <span className="font-medium">{p.languages}: </span>
              {profile.languages.map((code) => languageName(code, locale)).join(", ")}
            </p>
          )}
          <ul className="flex flex-wrap gap-2">
            {profile.travel_styles.map((s) => (
              <li key={s} className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium">
                {t.travelStyles[s]}
              </li>
            ))}
            {profile.interests.map((i) => (
              <li key={i} className="bg-muted rounded-full px-3 py-1 text-sm">
                {t.interests[i]}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{p.badges}</h2>
        {badges.length === 0 ? (
          <p className="text-muted-foreground text-sm">{p.noBadges}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {badges.map((badge) => (
              <li key={badge} className="bg-card flex items-center gap-3 rounded-2xl border p-3">
                <span aria-hidden className="text-2xl">
                  {BADGE_EMOJI[badge]}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{t.badges[badge].name}</span>
                  <span className="text-muted-foreground text-xs">{t.badges[badge].description}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{p.bucketList}</h2>
        {items.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{p.emptyList}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.data.map((item) => (
              <li key={item.id} className="bg-card flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <span className="font-medium">{item.title}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    item.status === "planning" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.items.status[item.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
