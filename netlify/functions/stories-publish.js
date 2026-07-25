// Publishes one success story (name, status, story text, optional profile
// picture, and any number of captioned result images — e.g. separate photos
// of an iPhone and a bike someone won) in a single commit. Unlike
// gallery-publish this never needs batching — a story has only a handful of
// images at most.
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

  const { slug, name, status, story, picture, results } = body;

  if (!isSafePathSegment(slug)) return jsonResponse(400, { error: "Invalid slug" });
  if (!name || !story) return jsonResponse(400, { error: "Name and story are required" });
  if (results && !Array.isArray(results)) return jsonResponse(400, { error: "results must be an array" });

  try {
    const { commitSha, treeSha } = await getBranchHead();
    const entries = [];
    const data = { name, status: status || "", story };

    if (picture) {
      const path = `public/uploads/stories/${slug}/picture.jpg`;
      const sha = await createBlob(picture);
      entries.push({ path, mode: "100644", type: "blob", sha });
      data.picture = `/uploads/stories/${slug}/picture.jpg`;
    }

    if (results && results.length > 0) {
      data.results = await Promise.all(
        results.map(async ({ image, caption }, i) => {
          const path = `public/uploads/stories/${slug}/result-${String(i).padStart(2, "0")}.jpg`;
          const sha = await createBlob(image);
          entries.push({ path, mode: "100644", type: "blob", sha });
          return { image: `/uploads/stories/${slug}/result-${String(i).padStart(2, "0")}.jpg`, caption: caption || "" };
        })
      );
    }

    const jsonSha = await createTextBlob(JSON.stringify(data, null, 2) + "\n");
    entries.push({ path: `content/stories/${slug}.json`, mode: "100644", type: "blob", sha: jsonSha });

    await commitTree({
      baseTreeSha: treeSha,
      parentCommitSha: commitSha,
      entries,
      message: `Add story for ${name}`,
    });

    return jsonResponse(200, { slug, picture: data.picture, results: data.results });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
