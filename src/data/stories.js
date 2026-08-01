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
  .sort((a, b) => {
    // Stories arranged via /stories-admin carry an explicit `order`, lower
    // shows first. Anything without one (never arranged yet) sinks below
    // ordered stories and falls back to newest-first among themselves.
    const orderA = typeof a.order === "number" ? a.order : Infinity;
    const orderB = typeof b.order === "number" ? b.order : Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return (b.slug || "").localeCompare(a.slug || "");
  });
