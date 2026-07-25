// Downscales + re-encodes a photo in the browser before it's sent to the
// gallery-publish function, so a batch of full-resolution phone photos
// doesn't blow past the function's request-size limit and uploads are fast.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;

export async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  const base64 = await blobToBase64(blob);
  return { base64, previewUrl: URL.createObjectURL(blob) };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
