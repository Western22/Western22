"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Camera, Check, LocateFixed, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipPicker } from "@/components/chip-picker";
import { GoalSearch } from "@/components/goal-search";
import { createClient } from "@/lib/supabase/client";
import {
  addFirstItem,
  confirmAdult,
  declineAdult,
  finishOnboarding,
  saveBasics,
  saveHome,
  saveTastes,
} from "@/lib/actions/onboarding";
import { deleteItem } from "@/lib/actions/items";
import { saveMyLocation } from "@/lib/actions/profile";
import {
  FIRST_ITEMS_TARGET,
  INTERESTS,
  LANGUAGE_CODES,
  MAX_LANGUAGES,
  TRAVEL_STYLES,
  languageName,
  type Interest,
  type TravelStyle,
} from "@/lib/onboarding";
import type { GoalSuggestion } from "@/lib/supabase/database.types";
import type { ErrorKey, Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";

type Step = "age" | "you" | "home" | "tastes" | "dreams" | "done";
type AddedItem = { itemId: string; goalId: string; title: string };
type LanguageCode = (typeof LANGUAGE_CODES)[number];

type Props = {
  locale: string;
  profile: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    homeCity: string;
    homeCountry: string;
    languages: string[];
    interests: Interest[];
    travelStyles: TravelStyle[];
    adultConfirmed: boolean;
    hasLocation: boolean;
  };
  featured: GoalSuggestion[];
  initialItems: AddedItem[];
  t: Pick<Messages, "onboarding" | "interests" | "travelStyles" | "errors" | "common">;
};

/** Decorative emoji. Not translated: they carry no meaning a screen reader needs. */
const STEP_ART: Record<Step, string> = { age: "🎟️", you: "👋", home: "🧭", tastes: "💫", dreams: "🌋", done: "🎉" };
const STEP_GRADIENT: Record<Step, string> = {
  age: "from-sky-200/70 via-indigo-100/60",
  you: "from-amber-200/70 via-rose-100/60",
  home: "from-emerald-200/70 via-teal-100/60",
  tastes: "from-fuchsia-200/70 via-pink-100/60",
  dreams: "from-orange-200/70 via-amber-100/60",
  done: "from-violet-200/70 via-sky-100/60",
};
const INTEREST_EMOJI: Record<Interest, string> = {
  hiking: "🥾", diving: "🤿", surfing: "🏄", climbing: "🧗", skiing: "⛷️", running: "🏃", cycling: "🚴",
  wildlife: "🦁", photography: "📷", music: "🎶", festivals: "🎪", art: "🎨", history: "🏛️", food: "🍜",
  cooking: "🍳", wine: "🍷", wellness: "🧘", languages: "🗣️", volunteering: "🤝", road_trips: "🚐",
  camping: "🏕️", nightlife: "🌃", dance: "💃", space: "🔭",
};
const STYLE_EMOJI: Record<TravelStyle, string> = { solo: "🎒", budget: "🪙", luxury: "🥂", adventure: "🌋" };
const CATEGORY_EMOJI: Record<string, string> = {
  adventure: "🪂", travel: "✈️", learning: "📚", creative: "🎨", sport: "🏅",
  food: "🍜", nature: "🌿", culture: "🏛️", social: "🎉", other: "✨",
};

const AVATAR_SIZE = 512;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Square-crop and shrink a photo in the browser before upload. Re-encoding
 * through a canvas also strips EXIF metadata (including GPS coordinates).
 */
async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))), "image/jpeg", 0.85),
  );
}

/** Browser languages that we offer, e.g. ["fr-CA", "en"] -> ["fr", "en"]. Cached so the snapshot is stable. */
let browserLanguagesCache: LanguageCode[] | null = null;
function browserLanguages(): LanguageCode[] {
  if (!browserLanguagesCache) {
    const codes = (navigator.languages ?? [navigator.language]).map((l) => l.split("-")[0].toLowerCase());
    browserLanguagesCache = [...new Set(codes)]
      .filter((c): c is LanguageCode => (LANGUAGE_CODES as readonly string[]).includes(c))
      .slice(0, MAX_LANGUAGES);
  }
  return browserLanguagesCache;
}
const NO_LANGUAGES: LanguageCode[] = [];
const noSubscribe = () => () => {};

/**
 * The onboarding journey: one idea per screen, big tap targets, saving as you
 * go. Every step except the age check can be skipped.
 */
export function OnboardingFlow({ locale, profile, featured, initialItems, t }: Props) {
  const o = t.onboarding;
  const steps: Step[] = [...(profile.adultConfirmed ? [] : (["age"] as const)), "you", "home", "tastes", "dreams", "done"];
  const [step, setStep] = useState<Step>(steps[0]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);

  // Step state, prefilled from whatever the profile already has.
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [homeCity, setHomeCity] = useState(profile.homeCity);
  const [homeCountry, setHomeCountry] = useState(profile.homeCountry);
  // Until the person picks, suggest their saved languages or else the browser's
  // (read on the client only; the server render starts with none).
  const suggestedLanguages = useSyncExternalStore(noSubscribe, browserLanguages, () => NO_LANGUAGES);
  const [pickedLanguages, setLanguages] = useState<LanguageCode[] | null>(
    profile.languages.length > 0
      ? profile.languages.filter((c): c is LanguageCode => (LANGUAGE_CODES as readonly string[]).includes(c))
      : null,
  );
  const languages = pickedLanguages ?? suggestedLanguages;
  const [location, setLocation] = useState<"idle" | "busy" | "saved" | "denied">(profile.hasLocation ? "saved" : "idle");
  const [interests, setInterests] = useState<Interest[]>(profile.interests);
  const [travelStyles, setTravelStyles] = useState<TravelStyle[]>(profile.travelStyles);
  const [items, setItems] = useState<AddedItem[]>(initialItems);
  const [query, setQuery] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const index = steps.indexOf(step);
  const countedSteps = steps.filter((s) => s !== "done").length;
  const goNext = () => {
    setError(null);
    setStep(steps[Math.min(index + 1, steps.length - 1)]);
    window.scrollTo({ top: 0 });
  };
  const goBack = () => {
    setError(null);
    setStep(steps[Math.max(index - 1, 0)]);
  };

  /** Run a save action; advance on success, show the error otherwise. */
  const saveThenNext = (save: () => Promise<{ ok?: boolean; error?: ErrorKey; fieldErrors?: object }>) =>
    startTransition(async () => {
      const result = await save();
      if (result.ok) goNext();
      else setError(result.error ?? "invalidInput");
    });

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    setPhotoError(false);
    if (!file.type.startsWith("image/") || file.size > MAX_PHOTO_BYTES) {
      setPhotoError(true);
      return;
    }
    setUploading(true);
    try {
      const blob = await resizeToJpeg(file);
      const supabase = createClient();
      // Storage policies only allow writes inside the caller's own folder.
      const path = `${profile.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      setAvatarUrl(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    } catch {
      setPhotoError(true);
    } finally {
      setUploading(false);
    }
  }

  function shareLocation() {
    if (!("geolocation" in navigator)) {
      setLocation("denied");
      return;
    }
    setLocation("busy");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // The server snaps this to a ~5 km grid before storing it.
        const result = await saveMyLocation(pos.coords.latitude, pos.coords.longitude);
        setLocation(result.ok ? "saved" : "idle");
        if (!result.ok) setError(result.error ?? "generic");
      },
      () => setLocation("denied"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  }

  function addDream(title: string, goalId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await addFirstItem(title, goalId, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((prev) => [...prev, { itemId: result.itemId, goalId: goalId ?? "", title }]);
      setQuery("");
    });
  }

  function removeDream(item: AddedItem) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteItem(item.itemId);
        setItems((prev) => prev.filter((i) => i.itemId !== item.itemId));
      } catch {
        setError("generic");
      }
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await finishOnboarding();
      if (!result.ok) {
        setError("generic");
        return;
      }
      setUsername(result.username);
      setStep("done");
    });
  }

  const addedGoalIds = new Set(items.map((i) => i.goalId));
  const firstName = displayName.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 pb-10">
      {/* Progress: one segment per step, filling as you go. */}
      {step !== "done" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5" aria-hidden>
            {steps
              .filter((s) => s !== "done")
              .map((s, i) => (
                <span
                  key={s}
                  className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", i <= index ? "bg-primary" : "bg-muted")}
                />
              ))}
          </div>
          <p className="text-muted-foreground text-xs">{format(o.stepOf, { step: index + 1, total: countedSteps })}</p>
        </div>
      )}

      <section
        key={step}
        aria-labelledby="step-title"
        className={cn("animate-step-in overflow-hidden rounded-3xl bg-gradient-to-br to-transparent p-6 sm:p-8", STEP_GRADIENT[step])}
      >
        <div aria-hidden className="animate-float mb-4 text-5xl">
          {STEP_ART[step]}
        </div>

        {step === "age" && (
          <div className="flex flex-col gap-4">
            <h1 id="step-title" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{o.age.title}</h1>
            <p className="text-muted-foreground text-pretty">{o.age.body}</p>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button size="lg" disabled={pending} onClick={() => saveThenNext(confirmAdult)}>
                {o.age.confirm}
              </Button>
              <Button size="lg" variant="ghost" disabled={pending} onClick={() => startTransition(() => declineAdult(locale))}>
                {o.age.under}
              </Button>
            </div>
          </div>
        )}

        {step === "you" && (
          <div className="flex flex-col gap-5">
            <Header eyebrow={o.you.eyebrow} title={o.you.title} body={o.you.body} />
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="bg-background/80 hover:ring-primary/40 relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed shadow-sm transition hover:ring-4"
                aria-label={avatarUrl ? o.you.changePhoto : o.you.photo}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
                  <img src={avatarUrl} alt="" className="animate-pop size-full object-cover" />
                ) : (
                  <Camera className="text-muted-foreground size-8" aria-hidden />
                )}
              </button>
              <div className="flex flex-col gap-1">
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? o.you.uploading : avatarUrl ? o.you.changePhoto : o.you.photo}
                </Button>
                <p className="text-muted-foreground text-xs">{o.you.photoHint}</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                data-testid="avatar-input"
                onChange={(e) => onPhotoPicked(e.target.files?.[0])}
              />
            </div>
            {photoError && (
              <p role="alert" className="text-destructive text-sm">
                {o.you.photoError}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">{o.you.name}</Label>
              <Input
                id="displayName"
                value={displayName}
                maxLength={60}
                autoComplete="name"
                placeholder={o.you.namePlaceholder}
                className="bg-background/80 h-12 text-lg"
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === "home" && (
          <div className="flex flex-col gap-5">
            <Header eyebrow={o.home.eyebrow} title={o.home.title} body={o.home.body} />
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="homeCity">{o.home.city}</Label>
                <Input
                  id="homeCity"
                  value={homeCity}
                  maxLength={100}
                  autoComplete="address-level2"
                  placeholder={o.home.cityPlaceholder}
                  className="bg-background/80 h-11"
                  onChange={(e) => setHomeCity(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="homeCountry">{o.home.country}</Label>
                <Input
                  id="homeCountry"
                  value={homeCountry}
                  maxLength={2}
                  autoComplete="country"
                  placeholder={o.home.countryPlaceholder}
                  className="bg-background/80 h-11 uppercase"
                  onChange={(e) => setHomeCountry(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                className="bg-background/80 self-start"
                disabled={location === "busy" || location === "saved"}
                onClick={shareLocation}
              >
                {location === "saved" ? <Check aria-hidden /> : <LocateFixed aria-hidden />}
                {location === "saved" ? o.home.locationSaved : o.home.useLocation}
              </Button>
              {location === "denied" && <p className="text-muted-foreground text-sm">{o.home.locationDenied}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{o.home.languages}</p>
              <p className="text-muted-foreground text-xs">{format(o.home.languagesHint, { max: MAX_LANGUAGES })}</p>
              <ChipPicker
                options={LANGUAGE_CODES}
                selected={languages}
                onChange={setLanguages}
                label={(code) => languageName(code, locale)}
                max={MAX_LANGUAGES}
                groupLabel={o.home.languages}
              />
            </div>
          </div>
        )}

        {step === "tastes" && (
          <div className="flex flex-col gap-6">
            <Header eyebrow={o.tastes.eyebrow} title={o.tastes.title} body={o.tastes.body} />
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{o.tastes.interests}</p>
              <ChipPicker
                options={INTERESTS}
                selected={interests}
                onChange={setInterests}
                label={(i) => `${INTEREST_EMOJI[i]} ${t.interests[i]}`}
                groupLabel={o.tastes.interests}
                size="lg"
              />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{o.tastes.travelStyle}</p>
              <div role="group" aria-label={o.tastes.travelStyle} className="grid grid-cols-2 gap-3">
                {TRAVEL_STYLES.map((style) => {
                  const on = travelStyles.includes(style);
                  return (
                    <button
                      key={style}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTravelStyles(on ? travelStyles.filter((s) => s !== style) : [...travelStyles, style])}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98]",
                        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                        on ? "border-primary bg-background shadow-md" : "bg-background/70 hover:border-primary/50 border-transparent",
                      )}
                    >
                      <span aria-hidden className="text-3xl">
                        {STYLE_EMOJI[style]}
                      </span>
                      <span className="font-semibold">{t.travelStyles[style]}</span>
                      <span className="text-muted-foreground text-xs">{o.tastes.travelStyleHints[style]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === "dreams" && (
          <div className="flex flex-col gap-5">
            <Header eyebrow={o.dreams.eyebrow} title={o.dreams.title} body={o.dreams.body} />
            <DreamMeter count={items.length} label={format(o.dreams.added, { count: items.length, target: FIRST_ITEMS_TARGET })} />

            {items.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={format(o.dreams.added, { count: items.length, target: FIRST_ITEMS_TARGET })}>
                {items.map((item) => (
                  <li key={item.itemId} className="animate-pop bg-primary text-primary-foreground flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm shadow-sm">
                    {item.title}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeDream(item)}
                      className="hover:bg-primary-foreground/20 rounded-full p-1"
                      aria-label={`${o.dreams.remove}: ${item.title}`}
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <GoalSearch
              locale={locale}
              value={query}
              onChange={setQuery}
              onSelect={(goal) => addDream(goal.title, goal.goal_id)}
              placeholder={o.dreams.searchPlaceholder}
              wantedLabel={(count) => format(o.dreams.wanted, { count })}
              footer={
                query.trim().length >= 3 ? (
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addDream(query.trim(), null)}
                  >
                    <Plus className="size-4" aria-hidden />
                    {format(o.dreams.addOwn, { title: query.trim() })}
                  </button>
                ) : undefined
              }
            />

            <ul className="grid grid-cols-2 gap-3">
              {featured.map((goal) => {
                const added = addedGoalIds.has(goal.goal_id);
                const item = items.find((i) => i.goalId === goal.goal_id);
                return (
                  <li key={goal.goal_id}>
                    <button
                      type="button"
                      aria-pressed={added}
                      disabled={pending}
                      onClick={() => (item ? removeDream(item) : addDream(goal.title, goal.goal_id))}
                      className={cn(
                        "relative flex h-full w-full flex-col items-start gap-2 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98]",
                        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                        added ? "border-primary bg-background shadow-md" : "bg-background/70 hover:border-primary/50 border-transparent",
                      )}
                    >
                      <span aria-hidden className="text-2xl">
                        {CATEGORY_EMOJI[goal.category_slug] ?? "✨"}
                      </span>
                      <span className="text-sm leading-snug font-medium">{goal.title}</span>
                      {goal.wanted_count > 0 && (
                        <span className="text-muted-foreground text-xs">{format(o.dreams.wanted, { count: goal.wanted_count })}</span>
                      )}
                      {added && (
                        <span className="animate-pop bg-primary text-primary-foreground absolute top-2 right-2 rounded-full p-1">
                          <Check className="size-3" aria-hidden />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-start gap-4">
            <h1 id="step-title" className="animate-pop text-3xl font-bold tracking-tight text-balance">
              {firstName ? format(o.done.title, { name: firstName }) : o.done.titleNoName}
            </h1>
            <p className="text-muted-foreground text-pretty">{o.done.body}</p>
            {items.length > 0 && (
              <ul className="flex flex-col gap-1">
                {items.map((item) => (
                  <li key={item.itemId} className="flex items-center gap-2">
                    <span aria-hidden>✨</span> {item.title}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              {username && (
                <Button asChild size="lg">
                  <Link href={`/${locale}/u/${username}`}>{o.done.cta}</Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline" className="bg-background/80">
                <Link href={`/${locale}/items`}>{o.done.ctaList}</Link>
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive mt-4 text-sm">
            {t.errors[error]}
          </p>
        )}
      </section>

      {/* Navigation. The age step has its own buttons and can't be skipped. */}
      {step !== "age" && step !== "done" && (
        <div className="flex items-center gap-2">
          {index > 0 && steps[index - 1] !== "age" && (
            <Button variant="ghost" disabled={pending} onClick={goBack}>
              {o.back}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" disabled={pending} onClick={step === "dreams" ? finish : goNext}>
              {o.skip}
            </Button>
            <Button
              size="lg"
              disabled={pending || uploading}
              onClick={() => {
                if (step === "you") {
                  if (!displayName.trim()) return goNext();
                  saveThenNext(() => saveBasics({ displayName, avatarUrl }));
                } else if (step === "home") {
                  saveThenNext(() => saveHome({ homeCity, homeCountry, languages }));
                } else if (step === "tastes") {
                  saveThenNext(() => saveTastes({ interests, travelStyles }));
                } else {
                  finish();
                }
              }}
            >
              {step === "dreams" ? o.finish : o.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-primary text-sm font-semibold tracking-wide uppercase">{eyebrow}</p>
      <h1 id="step-title" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        {title}
      </h1>
      <p className="text-muted-foreground text-pretty">{body}</p>
    </div>
  );
}

/** Three stars that light up as dreams are added. */
function DreamMeter({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: FIRST_ITEMS_TARGET }, (_, i) => (
          <span key={i} className={cn("text-2xl transition-all duration-300", i < count ? "animate-pop" : "opacity-25 grayscale")}>
            ⭐
          </span>
        ))}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
