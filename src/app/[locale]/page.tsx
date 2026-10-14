import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { notFound } from "next/navigation";

/** Landing page. Fully static, so it prerenders into the shell. */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  const steps = [t.home.steps.add, t.home.steps.match, t.home.steps.plan, t.home.steps.share];

  return (
    <div className="flex flex-col gap-10 py-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t.home.heroTitle}</h1>
        <p className="text-muted-foreground text-lg text-pretty">{t.home.heroBody}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={`/${locale}/signup`}>{t.home.ctaStart}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/${locale}/explore`}>{t.home.ctaExplore}</Link>
          </Button>
        </div>
      </section>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step} className="bg-accent flex items-center gap-3 rounded-lg p-4">
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {i + 1}
            </span>
            <span className="font-medium">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
