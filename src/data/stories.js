// ---------------------------------------------------------------------------
// Success stories, one JSON file per story, managed through /stories-admin.
//
// Nobody should need to edit this file or content/stories/*.json by hand —
// log in at yoursite.com/stories-admin instead. This module just reads
// whatever's there.
// ---------------------------------------------------------------------------

const modules = import.meta.glob("../../content/stories/*.json", {
  eager: true,
});

export const STORIES = Object.entries(modules)
  .map(([path, mod]) => {
    const data = mod.default ?? mod;
    const slug = path.match(/([^/]+)\.json$/)?.[1] ?? path;
    return { slug, ...data };
  })
  .filter((story) => story.name && story.story)
  .sort((a, b) => (b.slug || "").localeCompare(a.slug || ""));
