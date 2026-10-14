"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { createClient } from "@/lib/supabase/client";
import { postStory } from "@/lib/actions/groups";
import { MAX_PHOTO_BYTES, shrinkToJpeg } from "@/lib/images";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

/**
 * Write a story with an optional photo. The photo is resized in the browser
 * and uploaded to the caller's folder in the public stories bucket first;
 * the story row then stores its public URL.
 */
export function StoryForm({
  goalId,
  groupId,
  userId,
  t,
}: {
  goalId: string;
  groupId: string | null;
  userId: string;
  t: { memories: Messages["groups"]["memories"]; errors: Messages["errors"] };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(postStory, {});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const m = t.memories;

  async function upload(file: File | undefined) {
    setUploadFailed(false);
    if (!file || file.size > MAX_PHOTO_BYTES || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("stories").upload(path, await shrinkToJpeg(file), { contentType: "image/jpeg" });
      if (error) throw error;
      setPhotoUrl(supabase.storage.from("stories").getPublicUrl(path).data.publicUrl);
    } catch {
      setUploadFailed(true);
    } finally {
      setUploading(false);
    }
  }

  async function action(formData: FormData) {
    formAction(formData);
  }

  if (state.ok) {
    return (
      <p role="status" className="text-primary text-sm font-medium">
        {m.posted}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="goalId" value={goalId} />
      {groupId && <input type="hidden" name="groupId" value={groupId} />}
      {photoUrl && <input type="hidden" name="photoUrl" value={photoUrl} />}
      <Textarea name="body" required maxLength={2000} placeholder={m.storyPlaceholder} aria-label={m.storyPlaceholder} defaultValue={state.values?.body} className="min-h-24" />
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- just-uploaded story photo
        <img src={photoUrl} alt="" className="h-32 self-start rounded-lg object-cover" />
      )}
      <FormError errorKey={uploadFailed ? "generic" : state.error} errors={t.errors} />
      <div className="flex gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <ImagePlus aria-hidden />
          {m.addPhoto}
        </Button>
        <Button type="submit" size="sm" disabled={pending || uploading}>
          {m.post}
        </Button>
      </div>
    </form>
  );
}
