// ---------------------------------------------------------------------------
// Team Gallery, one JSON file per event, managed through the CMS at /admin.
//
// Nobody should need to edit this file or content/gallery/*.json by hand:
// log in at yoursite.com/admin, click "New Gallery Event", fill in a title,
// date, and photos, then Publish. This module just reads whatever's there.
// ---------------------------------------------------------------------------

const modules = import.meta.glob("../../content/gallery/*.json", {
  eager: true,
});

export const GALLERY_EVENTS = Object.entries(modules)
  .map(([path, mod]) => {
    const data = mod.default ?? mod;
    const slug = path.match(/([^/]+)\.json$/)?.[1] ?? path;
    return { slug, ...data };
  })
  .filter((event) => Array.isArray(event.photos) && event.photos.length > 0)
  .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
