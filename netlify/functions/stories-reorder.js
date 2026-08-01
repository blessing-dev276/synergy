// Persists a new display order for the stories the admin page shows, in one
// commit. The client already holds each story's full content (it's what
// StoriesAdmin renders from), so it resends that unchanged alongside a fresh
// `order` field, this function doesn't need to read anything from GitHub
// first, just rewrite each content/stories/<slug>.json with its new index.
import {
  getBranchHead,
  createTextBlob,
  commitTree,
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

  const { stories } = body;
  if (!Array.isArray(stories) || stories.length === 0) {
    return jsonResponse(400, { error: "stories must be a non-empty array" });
  }
  for (const s of stories) {
    if (!isSafePathSegment(s.slug))
      return jsonResponse(400, { error: `Invalid slug: ${s.slug}` });
    if (!s.name || !s.story)
      return jsonResponse(400, { error: `${s.slug} is missing name/story` });
  }

  try {
    const { commitSha, treeSha } = await getBranchHead();

    const entries = await Promise.all(
      stories.map(async (s, index) => {
        const data = {
          name: s.name,
          status: s.status || "",
          story: s.story,
          order: index,
        };
        if (s.picture) data.picture = s.picture;
        if (s.results?.length > 0) data.results = s.results;

        const sha = await createTextBlob(JSON.stringify(data, null, 2) + "\n");
        return {
          path: `content/stories/${s.slug}.json`,
          mode: "100644",
          type: "blob",
          sha,
        };
      }),
    );

    await commitTree({
      baseTreeSha: treeSha,
      parentCommitSha: commitSha,
      entries,
      message: "Reorder success stories",
    });

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
