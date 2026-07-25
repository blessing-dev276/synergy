# Synergy Team website

React (Vite) site for Synergy Team — freelancing + network marketing recruiting
and conversion.

## Local development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Where things live

| To change...                                            | Edit...                              |
| --------------------------------------------------------- | ------------------------------------- |
| Any copy — stats, FAQ answers, testimonials, WhatsApp number, contact email | `src/data/site.js` |
| Gallery photos/events                                    | Don't — use `/admin` (see below)     |
| Page layout/structure                                    | `src/pages/*.jsx`                    |
| Look and feel                                             | `src/index.css`                      |

`src/data/site.js` is deliberately the one file non-developers should need to
touch — it has inline comments on every field, including the two things you
must replace before launch (WhatsApp number, email) and the optional
Web3Forms key that makes Join-form applications land in your inbox as well
as WhatsApp.

## Team gallery (no code required)

Photos are managed at **`/admin`** on the live site (e.g.
`https://yoursite.netlify.app/admin`), powered by Decap CMS. Log in, click
**New Gallery Event**, add a title/date/photos, click **Publish** — that's it.
No file editing, no git.

This only works once, on the deployed site, after two one-time toggles in the
Netlify dashboard:

1. **Site settings → Identity → Enable Identity.** Under registration, set it
   to **Invite only** (so randoms can't sign up to your CMS).
2. **Identity → Services → Git Gateway → Enable Git Gateway.**
3. Back in **Identity**, click **Invite users** and send yourself (and
   anyone else who should manage the gallery) an invite email. The invite
   link drops them on the site, prompts them to set a password, then sends
   them to `/admin`.

Under the hood: each event is a JSON file in `content/gallery/`, and photos
land in `public/uploads/gallery/`. Decap CMS commits both automatically when
someone publishes — Netlify rebuilds the site on every commit, so new photos
go live within a minute or two.

## Deployment

Configured for Netlify (`netlify.toml` + `public/_redirects` handle the SPA
routing). Connect the GitHub repo in Netlify, build command `npm run build`,
publish directory `dist` — already set in `netlify.toml`, so the defaults
just work.
