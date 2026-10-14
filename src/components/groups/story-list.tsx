import Link from "next/link";

export type StoryRow = {
  id: string;
  body: string;
  photo_url: string | null;
  created_at: string;
  author: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

/** Stories, newest first: author, date, text and an optional photo. */
export function StoryList({ stories, locale, empty }: { stories: StoryRow[]; locale: string; empty: string }) {
  if (stories.length === 0) return <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">{empty}</p>;
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <ul className="flex flex-col gap-3">
      {stories.map((s) => {
        const name = s.author?.display_name || (s.author?.username ? `@${s.author.username}` : "");
        return (
          <li key={s.id} className="bg-card flex flex-col gap-2 overflow-hidden rounded-2xl border">
            {s.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
              <img src={s.photo_url} alt="" className="max-h-80 w-full object-cover" />
            )}
            <div className="flex flex-col gap-1 p-4 pt-2">
              <p className="text-muted-foreground text-xs">
                {s.author?.username ? (
                  <Link href={`/${locale}/u/${s.author.username}`} className="text-foreground font-medium hover:underline">
                    {name}
                  </Link>
                ) : (
                  name
                )}{" "}
                · <time dateTime={s.created_at}>{dateFormat.format(new Date(s.created_at))}</time>
              </p>
              <p className="text-sm whitespace-pre-line break-words">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
