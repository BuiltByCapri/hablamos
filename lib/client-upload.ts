// Browser-side checks before material goes to /api/extract. Vercel refuses a
// request body over about 4.5 MB, so a photo is shrunk to fit and any other
// file that is too big is turned away with a clear message. The server still
// caps uploads at 10 MB.

export const REQUEST_LIMIT_BYTES = 4_000_000;
export const TOO_LARGE_MESSAGE = "This file is too large. Split it or export a smaller copy.";

export type UploadVerdict = "ok" | "shrink" | "too_large";

/** What to do with a file before sending it. Only photos can be shrunk. */
export function uploadVerdict(file: { size: number; type: string }): UploadVerdict {
  if (file.size < REQUEST_LIMIT_BYTES) return "ok";
  return file.type.startsWith("image/") ? "shrink" : "too_large";
}

/** Re-encodes a photo as a JPEG under the request limit. Browser only. */
export async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  let side = Math.min(2600, Math.max(bitmap.width, bitmap.height));
  let quality = 0.85;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size < REQUEST_LIMIT_BYTES) {
      bitmap.close();
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    side = Math.round(side * 0.8);
    quality = Math.max(0.6, quality - 0.05);
  }
  bitmap.close();
  throw new Error(TOO_LARGE_MESSAGE);
}
