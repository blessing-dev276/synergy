// Updates an existing success story in place, same slug, same commit style
// as stories-publish.js. A replaced profile picture overwrites picture.jpg
// at its existing path, kept result images are left untouched on disk, only
// explicitly removed ones get deleted (sha:null) and newly added ones get
// uploaded at fresh indices after the highest existing one.
import {
  getBranchHead,
  createBlob,
  createTextBlob,
  commitTree,
  getFileContent,
  requireUser,
  isSafePathSegment,
  jsonResponse,
} from "./_lib/github.js";

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST")
    return jsonResponse(405, { error: "Method not allowed" });
  if (!requireUser(context))
    return jsonResponse(401, { error: "Log in required" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const {
    slug,
    name,
    status,
    story,
    picture,
    removePicture,
    keepResults,
    newResults,
    removedResultImages,
  } = body;

  if (!isSafePathSegment(slug)) return jsonResponse(400, { error: "Invalid slug" });
  if (!name || !story)
    return jsonResponse(400, { error: "Name and story are required" });
  if (keepResults && !Array.isArray(keepResults))
    return jsonResponse(400, { error: "keepResults must be an array" });
  if (newResults && !Array.isArray(newResults))
    return jsonResponse(400, { error: "newResults must be an array" });

  try {
    const jsonPath = `content/stories/${slug}.json`;
    const existing = await getFileContent(jsonPath);
    if (!existing) return jsonResponse(404, { error: "Story not found" });
    const oldData = JSON.parse(existing.content);

    const { commitSha, treeSha } = await getBranchHead();
    const entries = [];
    const data = { name, status: status || "", story };

    if (picture) {
      const path = `public/uploads/stories/${slug}/picture.jpg`;
      const sha = await createBlob(picture);
      entries.push({ path, mode: "100644", type: "blob", sha });
      data.picture = `/uploads/stories/${slug}/picture.jpg`;
    } else if (removePicture) {
      if (oldData.picture) {
        entries.push({
          path: `public${oldData.picture}`,
          mode: "100644",
          type: "blob",
          sha: null,
        });
      }
    } else if (oldData.picture) {
      data.picture = oldData.picture;
    }

    const prefix = `/uploads/stories/${slug}/`;
    for (const path of removedResultImages || []) {
      if (typeof path !== "string" || !path.startsWith(prefix)) continue;
      entries.push({
        path: `public${path}`,
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }

    const existingIndices = (keepResults || [])
      .map((r) => parseInt(r.image?.match(/result-(\d+)\.jpg$/)?.[1], 10))
      .filter((n) => Number.isInteger(n));
    let nextIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0;

    const uploadedResults = await Promise.all(
      (newResults || []).map(async (r, i) => {
        const index = nextIndex + i;
        const path = `public/uploads/stories/${slug}/result-${String(index).padStart(2, "0")}.jpg`;
        const sha = await createBlob(r.image);
        entries.push({ path, mode: "100644", type: "blob", sha });
        return {
          image: `/uploads/stories/${slug}/result-${String(index).padStart(2, "0")}.jpg`,
          caption: r.caption || "",
        };
      }),
    );

    data.results = [
      ...(keepResults || []).map((r) => ({
        image: r.image,
        caption: r.caption || "",
      })),
      ...uploadedResults,
    ];

    const jsonSha = await createTextBlob(JSON.stringify(data, null, 2) + "\n");
    entries.push({ path: jsonPath, mode: "100644", type: "blob", sha: jsonSha });

    await commitTree({
      baseTreeSha: treeSha,
      parentCommitSha: commitSha,
      entries,
      message: `Update story for ${name}`,
    });

    return jsonResponse(200, {
      slug,
      picture: data.picture,
      results: data.results,
    });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
