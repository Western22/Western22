import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";

export async function generateMetadata({ params }: PageProps<"/[locale]/guidelines">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getMessages(locale);
  return { title: t.guidelines.title, description: t.guidelines.intro };
}

/** Community guidelines: static, translatable text from the message dictionary. */
export default async function GuidelinesPage({ params }: PageProps<"/[locale]/guidelines">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const g = (await getMessages(locale)).guidelines;

  return (
    <article className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{g.title}</h1>
        <p className="text-muted-foreground text-sm">{g.updated}</p>
        <p className="text-pretty">{g.intro}</p>
      </header>
      <nav aria-label={g.title}>
        <ul className="flex flex-wrap gap-2 text-sm">
          {g.sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="bg-muted inline-block rounded-full px-3 py-1 hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {g.sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="flex scroll-mt-4 flex-col gap-2">
          <h2 id={`${section.id}-title`} className="text-xl font-semibold">
            {section.title}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 ps-5">
            {section.points.map((point) => (
              <li key={point} className="text-pretty">
                {point}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-muted-foreground text-pretty">{g.outro}</p>
    </article>
  );
}
