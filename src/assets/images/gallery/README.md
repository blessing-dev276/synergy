# Adding a team gallery event

No code needed — just files.

1. Make a folder in here named after the event, e.g. `2026-team-retreat`.
2. Drop that event's photos into it (`.jpg`, `.jpeg`, `.png`, or `.webp` — any
   filenames). They're picked up automatically the next time the site builds.
   Prefix filenames like `01-`, `02-` if you care about their order.
3. Open `src/data/gallery.js` and add one line for the event: its folder name,
   a title, and a date. That's the only file you edit.

Tip: compress photos before adding them (e.g. squoosh.app) so the site stays
fast — phone photos straight off a camera are often 5-10MB each.
