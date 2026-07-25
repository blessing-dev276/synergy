// Adds photos to a gallery event in one commit per request. The admin page
// calls this once per small batch of (already client-side compressed) photos
// so a single "Publish" of many photos never has to fit in one oversized
// request — see src/pages/GalleryAdmin.jsx for the batching loop. The final
// batch passes finalize:true plus the full accumulated photo list, which is
// when content/gallery/<slug>.json actually gets written/updated.
import {
  getBranchHead,
  createBlob,
  createTextBlob,
  commitTree,
  requireUser,
  isSafePathSegment,
  jsonResponse,
} from "./_lib/github.js";

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!requireUser(context)) return jsonResponse(401, { error: "Log in required" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { slug, title, date, startIndex, images, finalize, photos } = body;

  if (!isSafePathSegment(slug)) return jsonResponse(400, { error: "Invalid slug" });
  if (!Array.isArray(images) || images.length === 0) {
    return jsonResponse(400, { error: "No images in batch" });
  }
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    return jsonResponse(400, { error: "Invalid startIndex" });
  }
  if (finalize && (!title || !date || !Array.isArray(photos) || photos.length === 0)) {
    return jsonResponse(400, { error: "finalize requires title, date, and photos" });
  }

  try {
    const { commitSha, treeSha } = await getBranchHead();

    const imageEntries = await Promise.all(
      images.map(async (base64, i) => {
        const index = startIndex + i;
        const path = `public/uploads/gallery/${slug}/photo-${String(index).padStart(3, "0")}.jpg`;
        const blobSha = await createBlob(base64);
        return { path, mode: "100644", type: "blob", sha: blobSha, publicPath: `/uploads/gallery/${slug}/photo-${String(index).padStart(3, "0")}.jpg` };
      })
    );

    const entries = imageEntries.map(({ path, mode, type, sha }) => ({ path, mode, type, sha }));

    if (finalize) {
      const jsonSha = await createTextBlob(JSON.stringify({ title, date, photos }, null, 2) + "\n");
      entries.push({
        path: `content/gallery/${slug}.json`,
        mode: "100644",
        type: "blob",
        sha: jsonSha,
      });
    }

    await commitTree({
      baseTreeSha: treeSha,
      parentCommitSha: commitSha,
      entries,
      message: finalize
        ? `Publish gallery event "${title}"`
        : `Add photos to gallery event "${slug}" (batch)`,
    });

    return jsonResponse(200, { photos: imageEntries.map((e) => e.publicPath) });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
