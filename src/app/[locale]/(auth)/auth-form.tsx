"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-message";
import { signIn, signUp } from "@/lib/actions/auth";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";
import type { Locale } from "@/i18n/config";

type Props = {
  mode: "signIn" | "signUp";
  locale: Locale;
  t: Pick<Messages, "auth" | "errors">;
};

/** Email + password form shared by the sign-in and sign-up pages. */
export function AuthForm({ mode, locale, t }: Props) {
  const isSignUp = mode === "signUp";
  const [state, action, pending] = useActionState<FormState, FormData>(isSignUp ? signUp : signIn, {});
  // Set by /auth/confirm when an email link is invalid or expired.
  const confirmFailed = useSearchParams().get("error") === "confirm";

  if (isSignUp && state.ok) {
    return (
      <Card>
        <CardContent>
          <p role="status">{t.auth.checkEmail}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{isSignUp ? t.auth.signUpTitle : t.auth.signInTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="locale" value={locale} />
          {confirmFailed && !state.error && (
            <p role="alert" className="text-destructive text-sm">
              {t.auth.confirmFailed}
            </p>
          )}
          <FormError errorKey={state.error} errors={t.errors} />

          {isSignUp && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">{t.auth.displayName}</Label>
              <Input id="displayName" name="displayName" autoComplete="name" maxLength={60} defaultValue={state.values?.displayName} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={state.values?.email}
              required
              aria-invalid={!!state.fieldErrors?.email}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={isSignUp ? 8 : undefined}
              required
              aria-invalid={!!state.fieldErrors?.password}
            />
            <FormError errorKey={state.fieldErrors?.password} errors={t.errors} />
          </div>
          <Button type="submit" disabled={pending}>
            {isSignUp ? t.auth.submitSignUp : t.auth.submitSignIn}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-muted-foreground gap-1 text-sm">
        {isSignUp ? t.auth.haveAccount : t.auth.noAccount}
        <Link className="text-foreground underline" href={`/${locale}/${isSignUp ? "login" : "signup"}`}>
          {isSignUp ? t.auth.submitSignIn : t.auth.submitSignUp}
        </Link>
      </CardFooter>
    </Card>
  );
}
