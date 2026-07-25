// Auto-discovers every photo under src/assets/images/gallery/<slug>/ at
// build time, so adding an event is "drop files in a folder" with zero
// import statements to maintain by hand.
const modules = import.meta.glob(
  "../assets/images/gallery/*/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}",
  { eager: true, import: "default" }
);

const photosBySlug = {};

for (const path in modules) {
  const match = path.match(/gallery\/([^/]+)\/([^/]+)$/);
  if (!match) continue;
  const [, slug, filename] = match;
  (photosBySlug[slug] ||= []).push({ filename, src: modules[path] });
}

for (const slug in photosBySlug) {
  photosBySlug[slug].sort((a, b) => a.filename.localeCompare(b.filename));
}

/** Returns the ordered list of photo URLs for a gallery event's slug. */
export function getEventPhotos(slug) {
  return (photosBySlug[slug] || []).map((p) => p.src);
}
