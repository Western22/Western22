"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-message";
import { startAuth } from "@/lib/actions/auth";
import type { OAuthProvider } from "@/lib/auth-providers";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";

type Props = {
  locale: Locale;
  providers: OAuthProvider[];
  t: Pick<Messages, "auth" | "errors">;
};

/** Remembers the 18+ tick on this device so returning visitors aren't asked every time. */

export function SignInForm({ locale, providers, t }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(startAuth, {});
  const [adult, setAdult] = useState(false);
  // The "check your inbox" screen shows for the latest successful send until dismissed.
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  const searchParams = useSearchParams();
  const confirmFailed = searchParams.get("error") === "confirm";
  const under18 = searchParams.get("under18") === "1";
  const sentTo = state.ok && dismissed !== state ? (state.values?.email ?? null) : null;

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
        <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
          <Mail className="size-7" aria-hidden />
        </div>
        <h2 className="text-xl font-semibold">{t.auth.checkEmailTitle}</h2>
        <p className="text-muted-foreground">{format(t.auth.checkEmailBody, { email: sentTo })}</p>
        <Button variant="link" onClick={() => setDismissed(state)}>
          {t.auth.useDifferentEmail}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {confirmFailed && !state.error && (
        <p role="alert" className="text-destructive text-sm">
          {t.auth.confirmFailed}
        </p>
      )}
      {under18 && !state.error && (
        <p role="alert" className="text-destructive text-sm">
          {t.auth.under18}
        </p>
      )}
      <FormError errorKey={state.error} errors={t.errors} />

      {/* 18+ gate: required before any sign-in option works. */}
      <label className="bg-accent/60 flex cursor-pointer items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          name="adult"
          checked={adult}
          onChange={(e) => setAdult(e.target.checked)}
          className="accent-primary mt-0.5 size-5 shrink-0"
          aria-describedby="adult-hint"
          aria-invalid={!!state.fieldErrors?.adult}
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{t.auth.ageConfirm}</span>
          <span id="adult-hint" className="text-muted-foreground text-sm">
            {t.auth.ageHint}
          </span>
        </span>
      </label>
      <FormError errorKey={state.fieldErrors?.adult} errors={t.errors} />

      {providers.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {providers.includes("google") && (
              <Button type="submit" name="intent" value="google" variant="outline" size="lg" disabled={pending}>
                <GoogleMark /> {t.auth.continueWithGoogle}
              </Button>
            )}
            {providers.includes("apple") && (
              <Button type="submit" name="intent" value="apple" variant="outline" size="lg" disabled={pending}>
                <AppleMark /> {t.auth.continueWithApple}
              </Button>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
            <span className="bg-border h-px flex-1" />
            {t.auth.or}
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={t.auth.emailPlaceholder}
          defaultValue={state.values?.email}
          className="h-11 text-base"
          aria-invalid={!!state.fieldErrors?.email}
        />
        <FormError errorKey={state.fieldErrors?.email} errors={t.errors} />
      </div>
      <Button type="submit" name="intent" value="email" size="lg" disabled={pending}>
        <Mail /> {t.auth.sendLink}
      </Button>
      <p className="text-muted-foreground text-center text-xs">{t.auth.terms}</p>
    </form>
  );
}

/** Google "G" mark (brand colours are required by Google's sign-in guidelines). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Apple logo, drawn in the current text colour per Apple's guidelines. */
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.97-3.46-1.07-1.57-2.74-1.78-3.33-1.8-1.42-.14-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.77 1.11 1.68 2.36 2.88 2.31 1.16-.05 1.6-.75 3-.75s1.79.75 3.01.72c1.25-.02 2.03-1.13 2.79-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.42-.93-2.46-3.71zM14.08 5.84c.64-.77 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.1 1.77-.96 2.82 1.02.08 2.06-.52 2.7-1.28z" />
    </svg>
  );
}
