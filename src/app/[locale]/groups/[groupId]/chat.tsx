"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/lib/actions/groups";
import { ReportButton } from "@/components/safety/report-button";
import { TranslatableText } from "@/components/translation/translatable-text";
import { MAX_PHOTO_BYTES, shrinkToJpeg } from "@/lib/images";
import type { GroupMessage } from "@/lib/supabase/database.types";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";

export type ChatMember = { id: string; name: string; avatarUrl: string | null; lastReadAt: string };

type T = { chat: Messages["groups"]["chat"]; errors: Messages["errors"]; report: Messages["report"]; translate: Messages["translate"] };

/** Signed URLs for private chat photos last an hour; the page reloads long before that matters. */
const SIGNED_URL_SECONDS = 3600;
/** Don't tell the server "I've read it" more than every few seconds. */
const READ_THROTTLE_MS = 3000;

/**
 * Real-time group chat. New messages and read receipts arrive over Supabase
 * Realtime (postgres_changes), which applies the same RLS as normal reads, so
 * only members receive a group's events. Photos are resized in the browser
 * (stripping EXIF/GPS) and stored in the private group-media bucket.
 */
export function Chat({
  groupId,
  me,
  initialMessages,
  truncated,
  initialMembers,
  locale,
  canTranslate = false,
  t,
}: {
  groupId: string;
  me: string;
  initialMessages: GroupMessage[];
  truncated: boolean;
  initialMembers: ChatMember[];
  locale: string;
  /** A translation service is set up for this language: show Translate on others' messages. */
  canTranslate?: boolean;
  t: T;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [members, setMembers] = useState(initialMembers);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const lastReadSent = useRef(0);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Throttled, with a trailing call so a message that arrives during the pause still gets marked read.
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible" || readTimer.current) return;
    const wait = Math.max(0, lastReadSent.current + READ_THROTTLE_MS - Date.now());
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      lastReadSent.current = Date.now();
      // The query builder is lazy: it only runs once awaited or then-ed.
      supabase.rpc("mark_group_read", { p_group_id: groupId }).then(() => undefined);
    }, wait);
  }, [supabase, groupId]);

  const addMessage = useCallback((m: GroupMessage) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Realtime: new messages and members' read positions.
  useEffect(() => {
    const channel = supabase
      .channel(`group:${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const m = payload.new as GroupMessage;
          addMessage(m);
          if (m.sender_id !== me) markRead();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string };
          setMembers((prev) => prev.map((m) => (m.id === row.user_id ? { ...m, lastReadAt: row.last_read_at } : m)));
        },
      )
      .subscribe();
    markRead();
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (readTimer.current) clearTimeout(readTimer.current);
      readTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, groupId, me, addMessage, markRead]);

  // Someone new posted (they joined after the page loaded): reload the member list.
  const unknownSender = messages.some((m) => !byId.has(m.sender_id));
  useEffect(() => {
    if (unknownSender) router.refresh();
  }, [unknownSender, router]);

  // Sign URLs for photos we haven't signed yet.
  const missing = messages.filter((m) => m.image_path && !photoUrls[m.image_path]).map((m) => m.image_path as string);
  const missingKey = missing.join("|");
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    void supabase.storage
      .from("group-media")
      .createSignedUrls(missingKey.split("|"), SIGNED_URL_SECONDS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPhotoUrls((prev) => {
          const next = { ...prev };
          for (const item of data) if (item.path && item.signedUrl) next[item.path] = item.signedUrl;
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, missingKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Read receipt under my latest message: how many others have read up to it.
  const myLast = [...messages].reverse().find((m) => m.sender_id === me);
  const others = members.filter((m) => m.id !== me);
  const seenCount = myLast ? others.filter((m) => m.lastReadAt >= myLast.created_at).length : 0;
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });

  return (
    <section className="flex flex-col gap-3">
      <div className="bg-muted/30 flex h-[60vh] min-h-80 flex-col overflow-y-auto rounded-2xl border p-3">
        {truncated && <p className="text-muted-foreground pb-2 text-center text-xs">{format(t.chat.older, { count: messages.length })}</p>}
        {/* TODO(chat): load older messages on scroll. */}
        {messages.length === 0 ? (
          <p className="text-muted-foreground m-auto text-sm">{t.chat.empty}</p>
        ) : (
          <ol role="log" aria-live="polite" className="flex flex-col gap-2">
            {messages.map((m, i) => {
              const mine = m.sender_id === me;
              const sender = byId.get(m.sender_id);
              const prev = messages[i - 1];
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const showName = !mine && (!prev || prev.sender_id !== m.sender_id || newDay);
              return (
                <li key={m.id} className="flex flex-col">
                  {newDay && (
                    <p className="text-muted-foreground py-1 text-center text-xs">{dayFormat.format(new Date(m.created_at))}</p>
                  )}
                  <div className={cn("group flex max-w-[85%] flex-col", mine ? "items-end self-end" : "items-start self-start")}>
                    {showName && <span className="text-muted-foreground px-1 text-xs font-medium">{sender?.name ?? "…"}</span>}
                    <div
                      className={cn(
                        "flex flex-col gap-1 overflow-hidden rounded-2xl px-3 py-2 text-sm",
                        mine ? "bg-primary text-primary-foreground" : "bg-background border",
                        m.hidden_at && "opacity-60",
                      )}
                    >
                      {m.image_path &&
                        (photoUrls[m.image_path] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                          <img
                            src={photoUrls[m.image_path]}
                            alt={format(t.chat.photo, { name: sender?.name ?? "" })}
                            className="-mx-1 max-h-72 rounded-xl object-cover"
                          />
                        ) : (
                          <div aria-hidden className="bg-muted size-40 animate-pulse rounded-xl" />
                        ))}
                      {m.body &&
                        (canTranslate && !mine && !m.hidden_at ? (
                          <TranslatableText
                            kind="message"
                            id={m.id}
                            text={m.body}
                            locale={locale}
                            className="break-words whitespace-pre-line"
                            buttonClassName="text-[11px]"
                            t={t}
                          />
                        ) : (
                          <p className="break-words whitespace-pre-line">{m.body}</p>
                        ))}
                    </div>
                    <span className="text-muted-foreground flex flex-wrap items-center gap-2 px-1 text-[11px]">
                      <time dateTime={m.created_at}>{timeFormat.format(new Date(m.created_at))}</time>
                      {m.hidden_at && <span>{t.chat.hidden}</span>}
                      {!mine && (
                        <ReportButton
                          targetType="message"
                          targetId={m.id}
                          blockUser={sender ? { id: m.sender_id, name: sender.name } : undefined}
                          t={t}
                          className="flex items-center gap-0.5 opacity-70 hover:underline hover:opacity-100"
                        />
                      )}
                    </span>
                    {myLast?.id === m.id && seenCount > 0 && (
                      <span className="text-muted-foreground px-1 text-[11px]">
                        {seenCount === others.length ? t.chat.seenByAll : format(t.chat.seenBy, { count: seenCount })}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </div>
      <Composer groupId={groupId} supabase={supabase} onSent={addMessage} t={t} />
    </section>
  );
}

function Composer({
  groupId,
  supabase,
  onSent,
  t,
}: {
  groupId: string;
  supabase: ReturnType<typeof createClient>;
  onSent: (m: GroupMessage) => void;
  t: T;
}) {
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickPhoto(file: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    if (!file || file.size > MAX_PHOTO_BYTES || !file.type.startsWith("image/")) {
      setPhoto(null);
      setPreview(null);
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function send() {
    const text = body.trim();
    if ((!text && !photo) || sending) return;
    setSending(true);
    setError(null);
    try {
      let imagePath: string | null = null;
      if (photo) {
        const blob = await shrinkToJpeg(photo);
        imagePath = `${groupId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from("group-media").upload(imagePath, blob, { contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
      }
      // The server runs text moderation before saving.
      const result = await sendMessage(groupId, text, imagePath);
      if (result.error || !result.message) {
        setError(result.error && result.error !== "generic" ? t.errors[result.error] : t.chat.sendFailed);
        return;
      }
      onSent(result.message);
      setBody("");
      pickPhoto(undefined);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError(t.chat.sendFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex flex-col gap-2"
    >
      {preview && (
        <div className="relative self-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={preview} alt="" className="h-24 rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => pickPhoto(undefined)}
            aria-label={t.chat.removePhoto}
            className="bg-background absolute -top-2 -end-2 rounded-full border p-0.5"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id={`photo-${groupId}`}
          onChange={(e) => pickPhoto(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="icon" aria-label={t.chat.addPhoto} title={t.chat.addPhoto} onClick={() => fileRef.current?.click()}>
          <ImagePlus />
        </Button>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          maxLength={2000}
          rows={1}
          placeholder={t.chat.placeholder}
          aria-label={t.chat.placeholder}
          className="max-h-32 min-h-10 flex-1"
        />
        <Button type="submit" size="icon" disabled={sending || (!body.trim() && !photo)} aria-label={sending ? t.chat.uploading : t.chat.send}>
          <Send />
        </Button>
      </div>
    </form>
  );
}
