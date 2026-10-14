import { Check, Lock, MapPin, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteItem, setItemStatus } from "@/lib/actions/items";
import type { BucketItem } from "@/lib/supabase/database.types";
import type { Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";

type Props = {
  item: Pick<BucketItem, "id" | "title" | "description" | "category" | "visibility" | "status" | "place_name">;
  t: Messages["items"];
};

/** One of the owner's items, with done/undo and delete actions. */
export function ItemRow({ item, t }: Props) {
  const done = item.status === "done";

  return (
    <li className="flex items-start gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("font-medium break-words", done && "text-muted-foreground line-through")}>{item.title}</p>
        {item.description && <p className="text-muted-foreground text-sm break-words">{item.description}</p>}
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{t.category[item.category]}</span>
          <span>{t.status[item.status]}</span>
          {item.place_name && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden /> {item.place_name}
            </span>
          )}
          {item.visibility === "private" && (
            <span className="flex items-center gap-1">
              <Lock className="size-3" aria-hidden /> {t.visibility.private}
            </span>
          )}
        </div>
      </div>
      <form action={setItemStatus.bind(null, item.id, done ? "dreaming" : "done")}>
        <Button type="submit" variant="ghost" size="icon" aria-label={done ? t.markDreaming : t.markDone} title={done ? t.markDreaming : t.markDone}>
          {done ? <Undo2 /> : <Check />}
        </Button>
      </form>
      <form action={deleteItem.bind(null, item.id)}>
        <Button type="submit" variant="ghost" size="icon" aria-label={t.delete} title={t.delete}>
          <Trash2 />
        </Button>
      </form>
    </li>
  );
}
