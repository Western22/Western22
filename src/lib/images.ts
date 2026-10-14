/**
 * Browser-only photo helpers. Re-encoding through a canvas strips EXIF
 * metadata, including GPS coordinates, before anything is uploaded.
 */

/** Largest file we accept from the picker before resizing. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Shrink a photo so its longest side is at most `maxSide` pixels, as JPEG. */
export async function shrinkToJpeg(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))), "image/jpeg", 0.85),
  );
}
