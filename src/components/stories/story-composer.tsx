"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { createClient } from "@/lib/supabase/client";
import { createStory } from "@/lib/actions/social";
import { MAX_PHOTO_BYTES, shrinkToJpeg } from "@/lib/images";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

export type ComposerGroup = { id: string; name: string; members: { id: string; name: string }[] };

const MAX_PHOTOS = 4;
/** Story photos are resized to this longest side and compressed as JPEG. */
const STORY_PHOTO_SIDE = 1600;

/**
 * Story composer: caption, up to 4 photos (resized, compressed and stripped of
 * EXIF/GPS in the browser, then uploaded to the caller's folder in the public
 * stories bucket), a city-level place, an optional group and tags.
 */
export function StoryComposer({
  goalId,
  goalTitle,
  userId,
  locale,
  defaultPlace,
  groups,
  defaultGroupId,
  t,
}: {
  goalId: string;
  goalTitle: string;
  userId: string;
  locale: string;
  defaultPlace: string;
  groups: ComposerGroup[];
  defaultGroupId: string | null;
  t: { stories: Messages["stories"]; errors: Messages["errors"] };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createStory, {});
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [groupId, setGroupId] = useState(defaultGroupId ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const s = t.stories;
  const group = groups.find((g) => g.id === groupId);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setUploadFailed(false);
    setUploading(true);
    const supabase = createClient();
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = Array.from(files).filter((f) => f.type.startsWith("image/") && f.size <= MAX_PHOTO_BYTES).slice(0, room);
      const urls: string[] = [];
      for (const file of picked) {
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const blob = await shrinkToJpeg(file, STORY_PHOTO_SIDE);
        const { error } = await supabase.storage.from("stories").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        urls.push(supabase.storage.from("stories").getPublicUrl(path).data.publicUrl);
      }
      setPhotos((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS));
    } catch {
      setUploadFailed(true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="locale" value={locale} />
      {photos.map((url) => (
        <input key={url} type="hidden" name="photoUrl" value={url} />
      ))}
      <p className="text-sm">
        <span className="text-muted-foreground">{s.goal}: </span>
        <span className="font-semibold">{goalTitle}</span>
      </p>
      <FormError errorKey={uploadFailed ? "generic" : state.error} errors={t.errors} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="story-body">{s.caption}</Label>
        <Textarea
          id="story-body"
          name="body"
          required
          maxLength={2000}
          placeholder={s.captionPlaceholder}
          defaultValue={state.values?.body}
          className="min-h-28"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{s.photos}</span>
        {photos.length > 0 && (
          <ul className="grid grid-cols-4 gap-2">
            {photos.map((url) => (
              <li key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- just-uploaded story photo */}
                <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((p) => p !== url))}
                  aria-label={s.removePhoto}
                  className="bg-background absolute -top-1.5 -right-1.5 rounded-full border p-0.5"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* TODO(storage): removed photos stay in the bucket; clean up orphans with a scheduled job. */}
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addPhotos(e.target.files)} />
        {photos.length < MAX_PHOTOS && (
          <Button type="button" variant="outline" size="sm" className="self-start" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus aria-hidden />
            {uploading ? s.uploading : s.addPhotos}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="story-place">{s.place}</Label>
        <Input id="story-place" name="place" maxLength={100} placeholder={s.placePlaceholder} defaultValue={state.values?.place ?? defaultPlace} />
      </div>

      {groups.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="story-group">{s.group}</Label>
          <NativeSelect id="story-group" name="groupId" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{s.noGroup}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {group && group.members.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{s.tag}</legend>
          <div className="flex flex-wrap gap-2">
            {group.members.map((m) => (
              <label key={m.id} className="has-checked:bg-primary/10 has-checked:border-primary flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
                <input type="checkbox" name="tagged" value={m.id} defaultChecked className="accent-primary" />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Button type="submit" className="self-start" disabled={pending || uploading}>
        {s.post}
      </Button>
    </form>
  );
}
