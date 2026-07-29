// Shared GitHub git-data helpers used by the gallery-publish and
// gallery-delete functions to build one commit per request (batch of photos,
// or a delete) instead of one commit per file.

const OWNER = process.env.GITHUB_OWNER || "blessing-dev276";
const REPO = process.env.GITHUB_REPO || "synergy";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

async function githubRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "synergy-gallery-admin",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub API ${path} failed: ${res.status} ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function getBranchHead() {
  const ref = await githubRequest(`/git/ref/heads/${BRANCH}`);
  const commit = await githubRequest(`/git/commits/${ref.object.sha}`);
  return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
}

export async function createBlob(base64Content) {
  const blob = await githubRequest("/git/blobs", {
    method: "POST",
    body: JSON.stringify({ content: base64Content, encoding: "base64" }),
  });
  return blob.sha;
}

export async function createTextBlob(text) {
  return createBlob(Buffer.from(text, "utf-8").toString("base64"));
}

export async function commitTree({
  baseTreeSha,
  parentCommitSha,
  entries,
  message,
}) {
  const tree = await githubRequest("/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
  });
  const commit = await githubRequest("/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentCommitSha],
    }),
  });
  await githubRequest(`/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  return { commitSha: commit.sha, treeSha: tree.sha };
}

export async function getFileContent(path) {
  try {
    const file = await githubRequest(`/contents/${path}?ref=${BRANCH}`);
    const content = Buffer.from(file.content, "base64").toString("utf-8");
    return { content, sha: file.sha };
  } catch {
    return null;
  }
}

// Netlify decodes the Identity JWT into context.clientContext.user, which
// carries the same app_metadata.roles the client sees, checking the role
// here (not just "is logged in") is what actually enforces it, the
// client-side gate on the admin pages is only a UI convenience.
export function requireRole(context, role) {
  const user = context.clientContext && context.clientContext.user;
  return Boolean(user && user.app_metadata?.roles?.includes(role));
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Path segments we build from user input (slug, filenames), reject anything
// that isn't a plain safe segment so a crafted title/filename can't escape
// the gallery folders via "../" or similar.
export function isSafePathSegment(segment) {
  return (
    typeof segment === "string" &&
    /^[a-zA-Z0-9._-]+$/.test(segment) &&
    !segment.includes("..")
  );
}

export function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
