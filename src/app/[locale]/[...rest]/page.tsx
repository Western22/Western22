import { notFound } from "next/navigation";

/**
 * Unknown URLs under a locale ("/ja/nope") land here so they get the
 * translated not-found page inside the app layout, instead of Next's plain
 * default one.
 */
export default function CatchAll(): never {
  notFound();
}
