// Deletes a story's JSON file plus its picture/result images, in one commit.
import { getBranchHead, commitTree, getFileContent, requireUser, isSafePathSegment, jsonResponse } from "./_lib/github.js";

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!requireUser(context)) return jsonResponse(401, { error: "Log in required" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { slug } = body;
  if (!isSafePathSegment(slug)) return jsonResponse(400, { error: "Invalid slug" });

  try {
    const jsonPath = `content/stories/${slug}.json`;
    const file = await getFileContent(jsonPath);
    if (!file) return jsonResponse(404, { error: "Story not found" });

    const { picture, result } = JSON.parse(file.content);
    const entries = [{ path: jsonPath, mode: "100644", type: "blob", sha: null }];
    if (picture) entries.push({ path: `public${picture}`, mode: "100644", type: "blob", sha: null });
    if (result) entries.push({ path: `public${result}`, mode: "100644", type: "blob", sha: null });

    const { commitSha, treeSha } = await getBranchHead();
    await commitTree({
      baseTreeSha: treeSha,
      parentCommitSha: commitSha,
      entries,
      message: `Delete story "${slug}"`,
    });

    return jsonResponse(200, { deleted: slug });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
