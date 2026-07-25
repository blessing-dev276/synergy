# SynergyTeam website

React (Vite) site for SynergyTeam — freelancing + network marketing recruiting
and conversion.

## Local development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Where things live

| To change...                                                                | Edit...                                  |
| --------------------------------------------------------------------------- | ---------------------------------------- |
| Any copy — stats, FAQ answers, testimonials, WhatsApp number, contact email | `src/data/site.js`                       |
| Gallery photos/events                                                       | Don't — use `/gallery-admin` (see below) |
| Success stories / testimonials                                              | Don't — use `/stories-admin` (see below) |
| Page layout/structure                                                       | `src/pages/*.jsx`                        |
| Look and feel                                                               | `src/index.css`                          |

`src/data/site.js` is deliberately the one file non-developers should need to
touch — it has inline comments on every field, including the two things you
must replace before launch (WhatsApp number, email) and the optional
Web3Forms key that makes Join-form applications land in your inbox as well
as WhatsApp.

## Team gallery (no code required)

Photos are managed at **`/gallery-admin`** on the live site (e.g.
`https://yoursite.netlify.app/gallery-admin`) — a small custom admin page
built into the site itself (not Decap CMS). Log in, drag in as many photos as
you like for an event, give it a title/date, click **Publish** — every photo
uploads together in one go instead of one at a time. Existing events can be
deleted from the same page.

There's still a `/admin` (Decap CMS) on the site too, left in place as a
fallback for fine-grained edits — reordering photos within an event, fixing a
typo in a title — but adding new events should always go through
`/gallery-admin` now.

### One-time setup (do this once, on the deployed site)

1. **Site settings → Identity → Enable Identity.** Under registration, set it
   to **Invite only** (so randoms can't log in).
2. Back in **Identity**, click **Invite users** and send yourself (and anyone
   else who should manage the gallery) an invite email. The invite link drops
   them on the site, prompts them to set a password — that's the login
   `/gallery-admin` checks for.
3. **Create a GitHub token** so the admin page can commit photos on your
   behalf: on GitHub, go to **Settings → Developer settings → Personal
   access tokens → Fine-grained tokens → Generate new token**. Scope it to
   just this repository, and under **Repository permissions** set
   **Contents: Read and write**. Copy the token.
4. In Netlify, **Site settings → Environment variables → Add a variable** —
   name `GITHUB_TOKEN`, value the token from step 3. Redeploy the site once
   so the function picks it up.

Git Gateway is _not_ needed for `/gallery-admin` (only `/admin`/Decap still
uses it) — Netlify has deprecated Git Gateway, so `/admin` will keep working
for existing sites but isn't guaranteed to get fixes going forward.

### Under the hood

Each event is a JSON file in `content/gallery/`, photos land in
`public/uploads/gallery/<event-slug>/`. `/gallery-admin` compresses photos in
the browser, then calls two Netlify Functions
(`netlify/functions/gallery-publish.js` and `gallery-delete.js`) that commit
directly to GitHub via its API — a big batch of photos still lands as one
commit (or a couple, if there are a lot of photos) instead of one commit per
file. Netlify rebuilds on every commit, so new photos go live within a
minute or two.

## Success stories (no code required)

Managed the same way as the gallery, at **`/stories-admin`** — same Identity
login, no new accounts needed. Log in, fill in the member's name, status
(e.g. "Freelance track — landed first client"), their story, and optionally
a profile picture and any number of result images — one photo per result
(e.g. an iPhone and a bike someone won get their own photos, not one shared
one), each with its own short caption. Publish, and it shows up on the
homepage and the `/stories` page after the next deploy. Existing stories can
be deleted from the same page.

Uses the same `GITHUB_TOKEN` setup as the gallery admin (see above) — nothing
extra to configure if you've already done that step. Each story is a JSON
file in `content/stories/`, images land in `public/uploads/stories/`, and the
commit is made by `netlify/functions/stories-publish.js` /
`stories-delete.js`.

## Deployment

Configured for Netlify (`netlify.toml` + `public/_redirects` handle the SPA
routing). Connect the GitHub repo in Netlify, build command `npm run build`,
publish directory `dist` — already set in `netlify.toml`, so the defaults
just work.
