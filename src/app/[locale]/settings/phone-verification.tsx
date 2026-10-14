"use client";

import { useLocale } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-message";
import { createClient } from "@/lib/supabase/client";
import { format } from "@/i18n/format";
import type { ErrorKey, Messages } from "@/i18n/messages/en";

/**
 * Phone verification through Supabase Auth: set the phone on the account
 * (Auth texts a code), then confirm the code. A database trigger mirrors the
 * confirmation onto profiles.phone_verified_at; the number stays in Auth and
 * is never shown to anyone.
 */
export function PhoneVerification({
  verified,
  t,
}: {
  verified: boolean;
  t: { verification: Messages["verification"]; errors: Messages["errors"] };
}) {
  const v = t.verification;
  const router = useRouter();
  const locale = useLocale();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [changing, setChanging] = useState(!verified);
  const [error, setError] = useState<ErrorKey | undefined>();
  const [pending, startTransition] = useTransition();

  if (verified && !changing) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <p role="status">{v.verified}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setChanging(true)}>
          {v.changePhone}
        </Button>
      </div>
    );
  }

  const sendCode = () =>
    startTransition(async () => {
      setError(undefined);
      const normalized = phone.replace(/[\s().-]/g, "");
      if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) return setError("phoneInvalid");
      const e164 = normalized.startsWith("+") ? normalized : `+${normalized}`;
      const { error: authError } = await createClient().auth.updateUser({ phone: e164 });
      if (authError) {
        return setError(
          authError.code === "phone_exists" ? "phoneTaken" : authError.status === 429 ? "tooManyRequests" : "phoneInvalid",
        );
      }
      setSentTo(e164);
    });

  const verify = () =>
    startTransition(async () => {
      setError(undefined);
      if (!sentTo || !/^\d{6}$/.test(code)) return setError("codeInvalid");
      const { error: authError } = await createClient().auth.verifyOtp({ phone: sentTo, token: code, type: "phone_change" });
      if (authError) return setError("codeInvalid");
      setChanging(false);
      setSentTo(null);
      setCode("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {!sentTo ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Label htmlFor="phone">{v.phone}</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              placeholder={v.phonePlaceholder}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-describedby="phone-help"
            />
            <p id="phone-help" className="text-muted-foreground text-xs">
              {v.phoneHelp}
            </p>
          </div>
          <Button type="submit" size="sm" disabled={pending} className="mb-5">
            {v.sendCode}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p role="status" className="w-full text-sm">
            {format(v.sent, { phone: sentTo }, locale)}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="phone-code">{v.code}</Label>
            <Input
              id="phone-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-32"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {v.verify}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSentTo(null)}>
            {v.changePhone}
          </Button>
        </form>
      )}
      <FormError errorKey={error} errors={t.errors} />
    </div>
  );
}
