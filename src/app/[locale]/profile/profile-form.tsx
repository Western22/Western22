"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { ChipPicker } from "@/components/chip-picker";
import { INTERESTS, LANGUAGE_CODES, MAX_LANGUAGES, TRAVEL_STYLES, languageName } from "@/lib/onboarding";
import { updateProfile } from "@/lib/actions/profile";
import type { Profile } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

type Props = {
  locale: string;
  profile: Pick<
    Profile,
    "username" | "display_name" | "bio" | "home_city" | "home_country" | "languages" | "interests" | "travel_styles"
  >;
  t: Pick<Messages, "profile" | "errors" | "interests" | "travelStyles">;
};

type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** Edits the public profile fields. Email and phone are never shown or stored here. */
export function ProfileForm({ locale, profile, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  // Chip selections live in React state, so they survive the form reset after submit.
  const [languages, setLanguages] = useState<LanguageCode[]>(
    profile.languages.filter((c): c is LanguageCode => (LANGUAGE_CODES as readonly string[]).includes(c)),
  );
  const [interests, setInterests] = useState(profile.interests);
  const [travelStyles, setTravelStyles] = useState(profile.travel_styles);

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <FormError errorKey={state.error} errors={t.errors} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">{t.profile.username}</Label>
            <Input
              id="username"
              name="username"
              defaultValue={state.values?.username ?? profile.username ?? ""}
              required
              pattern="[a-z0-9_]{3,30}"
              autoCapitalize="none"
              aria-invalid={!!state.fieldErrors?.username}
              aria-describedby="username-hint"
            />
            <p id="username-hint" className="text-muted-foreground text-xs">
              {t.profile.usernameHint}
            </p>
            <FormError errorKey={state.fieldErrors?.username} errors={t.errors} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">{t.profile.displayName}</Label>
            <Input id="displayName" name="displayName" defaultValue={state.values?.displayName ?? profile.display_name ?? ""} maxLength={60} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bio">{t.profile.bio}</Label>
            <Textarea
              id="bio"
              name="bio"
              defaultValue={state.values?.bio ?? profile.bio ?? ""}
              maxLength={500}
              placeholder={t.profile.bioPlaceholder}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="homeCity">{t.profile.homeCity}</Label>
              <Input id="homeCity" name="homeCity" defaultValue={state.values?.homeCity ?? profile.home_city ?? ""} maxLength={100} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="homeCountry">{t.profile.homeCountry}</Label>
              <Input
                id="homeCountry"
                name="homeCountry"
                defaultValue={state.values?.homeCountry ?? profile.home_country ?? ""}
                maxLength={2}
                pattern="[A-Za-z]{2}"
                className="uppercase"
                aria-invalid={!!state.fieldErrors?.homeCountry}
                title={t.profile.homeCountryHint}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p aria-hidden className="text-sm font-medium">{t.profile.languages}</p>
            <ChipPicker
              name="languages"
              options={LANGUAGE_CODES}
              selected={languages}
              onChange={setLanguages}
              label={(code) => languageName(code, locale)}
              max={MAX_LANGUAGES}
              groupLabel={t.profile.languages}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p aria-hidden className="text-sm font-medium">{t.profile.interests}</p>
            <ChipPicker
              name="interests"
              options={INTERESTS}
              selected={interests}
              onChange={setInterests}
              label={(i) => t.interests[i]}
              groupLabel={t.profile.interests}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p aria-hidden className="text-sm font-medium">{t.profile.travelStyle}</p>
            <ChipPicker
              name="travelStyles"
              options={TRAVEL_STYLES}
              selected={travelStyles}
              onChange={setTravelStyles}
              label={(s) => t.travelStyles[s]}
              groupLabel={t.profile.travelStyle}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {t.profile.save}
            </Button>
            {state.ok && (
              <p role="status" className="text-muted-foreground text-sm">
                {t.profile.saved}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
