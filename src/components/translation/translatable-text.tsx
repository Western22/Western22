"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Languages } from "lucide-react";
import { translateContent, type TranslateKind } from "@/lib/actions/translation";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";

type T = { translate: Messages["translate"]; errors: Messages["errors"] };

/** "Spanish" for "es", in the reader's language; the code itself if the browser doesn't know it. */
function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * User-written text (story, comment or chat message) with a Translate button
 * underneath. The server reads the text itself (RLS applies), so this only
 * sends the content's id. Translations show with "Show original".
 *
 * Render it only when `canTranslate` came back true from the server, i.e. a
 * translation service is set up and supports the reader's language.
 */
export function TranslatableText({
  kind,
  id,
  text,
  locale,
  t,
  href,
  className,
  buttonClassName,
}: {
  kind: TranslateKind;
  id: string;
  text: string;
  locale: string;
  t: T;
  /** Wrap the text in a link (story cards link to the story). */
  href?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [translation, setTranslation] = useState<{ text: string; sourceLang: string | null } | null>(null);
  const [showing, setShowing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = showing && translation ? translation.text : text;

  function onClick() {
    setNote(null);
    if (showing) return setShowing(false);
    if (translation) return setShowing(true);
    startTransition(async () => {
      const res = await translateContent(kind, id, locale);
      if (!res.ok) {
        setNote(res.error === "notFound" ? t.errors.generic : t.errors[res.error]);
      } else if (res.sameLanguage) {
        setNote(t.translate.sameLanguage);
      } else {
        setTranslation({ text: res.text, sourceLang: res.sourceLang });
        setShowing(true);
      }
    });
  }

  const label = pending ? t.translate.translating : showing ? t.translate.showOriginal : t.translate.button;
  const body = href ? (
    <Link href={href} className={cn("hover:underline", className)}>
      {shown}
    </Link>
  ) : (
    <p className={className}>{shown}</p>
  );

  return (
    <div className="flex flex-col gap-1" lang={showing ? locale : undefined}>
      {body}
      <p className={cn("text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs", buttonClassName)}>
        {showing && translation && (
          <span>
            {translation.sourceLang
              ? format(t.translate.translatedFrom, { language: languageName(translation.sourceLang, locale) }, locale)
              : t.translate.translated}
            {" ·"}
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="inline-flex items-center gap-1 font-medium hover:underline disabled:opacity-60"
        >
          {!showing && <Languages className="size-3.5" aria-hidden />}
          {label}
        </button>
        {note && (
          <span role="status" className="basis-full">
            {note}
          </span>
        )}
      </p>
    </div>
  );
}
