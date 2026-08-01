# SynergyTeam website

React (Vite) site for SynergyTeam, freelancing + network marketing recruiting
and conversion.

## Local development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Where things live

| To change...                                                               | Edit...                                 |
| -------------------------------------------------------------------------- | --------------------------------------- |
| Any copy, stats, FAQ answers, testimonials, WhatsApp number, contact email | `src/data/site.js`                      |
| Business Toolkit tools (add/edit a recommended tool)                       | `src/data/businessToolkit.js`           |
| Gallery photos/events                                                      | Don't, use `/gallery-admin` (see below) |
| Success stories / testimonials                                             | Don't, use `/stories-admin` (see below) |
| Page layout/structure                                                      | `src/pages/*.jsx`                       |
| Look and feel                                                              | `src/index.css`                         |

`src/data/site.js` is deliberately the one file non-developers should need to
touch, it has inline comments on every field, including the two things you
must replace before launch (WhatsApp number, email) and the optional
Web3Forms key that makes Join-form applications land in your inbox as well
as WhatsApp.

## Business Toolkit (`/business-toolkit/<slug>`)

A resource hub of tools Synergy personally recommends (GoHighLevel is the
only one live today, using the `fp_ref=5il6ha` referral link). It's
config-driven: everything, the nav dropdown, the mobile menu, and each tool's
landing page, is generated from the array in `src/data/businessToolkit.js`.
To add a new tool (Canva, Hostinger, Namecheap, etc.), add one object to that
array with a unique `slug`, its content, and its `affiliateLink`, nothing in
`Header.jsx`, `App.jsx`, or routing needs to change.

## Team gallery (no code required)

Photos are managed at **`/gallery-admin`** on the live site (e.g.
`https://yoursite.netlify.app/gallery-admin`), a small custom admin page
built into the site itself (not Decap CMS). Log in, drag in as many photos as
you like for an event, give it a title/date, click **Publish**, every photo
uploads together in one go instead of one at a time. Existing events can be
deleted from the same page.

There's still a `/admin` (Decap CMS) on the site too, left in place as a
fallback for fine-grained edits, reordering photos within an event, fixing a
typo in a title, but adding new events should always go through
`/gallery-admin` now.

### One-time setup (do this once, on the deployed site)

1. **Site settings → Identity → Enable Identity.** Under registration, set it
   to **Invite only** (so randoms can't log in).
2. Back in **Identity**, click **Invite users** and send yourself (and anyone
   else who should manage the gallery) an invite email. The invite link drops
   them on the site, prompts them to set a password, that's the login
   `/gallery-admin` checks for.
3. **Create a GitHub token** so the admin page can commit photos on your
   behalf: on GitHub, go to **Settings → Developer settings → Personal
   access tokens → Fine-grained tokens → Generate new token**. Scope it to
   just this repository, and under **Repository permissions** set
   **Contents: Read and write**. Copy the token.
4. In Netlify, **Site settings → Environment variables → Add a variable** —
   name `GITHUB_TOKEN`, value the token from step 3. Redeploy the site once
   so the function picks it up.

Any invited Identity user can reach `/gallery-admin`, `/stories-admin`, and
`/refer`, there's no role separation between them, so only invite people you
trust with all three.

Git Gateway is _not_ needed for `/gallery-admin` (only `/admin`/Decap still
uses it), Netlify has deprecated Git Gateway, so `/admin` will keep working
for existing sites but isn't guaranteed to get fixes going forward.

### Under the hood

Each event is a JSON file in `content/gallery/`, photos land in
`public/uploads/gallery/<event-slug>/`. `/gallery-admin` compresses photos in
the browser, then calls two Netlify Functions
(`netlify/functions/gallery-publish.js` and `gallery-delete.js`) that commit
directly to GitHub via its API, a big batch of photos still lands as one
commit (or a couple, if there are a lot of photos) instead of one commit per
file. Netlify rebuilds on every commit, so new photos go live within a
minute or two.

## Success stories (no code required)

Managed the same way as the gallery, at **`/stories-admin`**, same Identity
login, no new accounts needed. Log in, fill in the member's name, status
(e.g. "Freelance track, landed first client"), their story, and optionally a
profile picture
and any number of result images, one photo per result (e.g. an iPhone and a
bike someone won get their own photos, not one shared one), each with its own
short caption. Publish, and it shows up on the homepage and the `/stories`
page after the next deploy. Existing stories can be **edited** (name, status,
story text, swap or remove the picture, add/remove/re-caption result images)
or **deleted** from the same page, click **Edit** on a story to open it.

Uses the same `GITHUB_TOKEN` setup as the gallery admin (see above), nothing
extra to configure if you've already done that step. Each story is a JSON
file in `content/stories/`, images land in `public/uploads/stories/`, and the
commit is made by `netlify/functions/stories-publish.js` /
`stories-update.js` / `stories-delete.js`.

## Referral links (`/refer`)

Members log in at **`/refer`** (same Netlify Identity as the admin pages) and
get a personal link like `yoursite.com/join?ref=Jane%20Doe`, built from their
name on the account, with **Copy link** and **Share on WhatsApp** buttons.
Whoever applies through that link has "Referred by Jane Doe" shown on the
Join page and included in both the WhatsApp message and the email
notification (`sponsor` field), so you always know who sent you a given
applicant. There's no separate member database, the member's name is just
the account's Identity full name (or email if no name is set).

### Inviting a member

1. Identity → **Invite users**, send them an invite (same flow as gallery/
   stories admins). Set their **full name** on their user record, that's
   exactly what shows up as the sponsor name.
2. Send them `yoursite.com/refer` to log in and grab their link.

Remember this is the same login as `/gallery-admin` and `/stories-admin`,
anyone you invite can reach all three.

### The `refer.synergyteamm.com` subdomain

This is one site, not two, `/refer` is just a route on it. `public/_redirects`
already has a host-aware rule sending `refer.synergyteamm.com/*` to
`synergyteamm.com/refer`, so the only steps left are DNS + Netlify, both need
your access, not code:

1. At your DNS provider, add a `CNAME` record: `refer` → your Netlify site's
   default domain (e.g. `yoursite.netlify.app`).
2. In Netlify, **Site settings → Domain management → Add a domain alias** —
   enter `refer.synergyteamm.com`, verify it.

Once that's verified, visiting `refer.synergyteamm.com` redirects straight to
the `/refer` login/dashboard.

## TikTok ad tracking

The TikTok Pixel (client-side) is already wired into `index.html` and fires
on every page. Key actions (the "Join The Team" CTAs, the Join-form
submission, and the "application received" screen) also relay through
TikTok's server-side Events API via `netlify/functions/tiktok-event.js`, see
`src/lib/tiktok.js`, so those conversions still count even when a visitor's
browser blocks the client-side pixel.

### One-time setup (do this once, on the deployed site)

1. In TikTok Events Manager, generate an Events API access token for the
   pixel (`D9IJSEBC77U84G6G804G`), the "Implement Events API" panel has a
   **Generate access token** button. TikTok only shows it once, copy it
   immediately.
2. In Netlify, **Site settings → Environment variables → Add a variable** —
   name `TIKTOK_ACCESS_TOKEN`, value the token from step 1. Redeploy the site
   once so the function picks it up.

This token is a write credential for your TikTok ad account, treat it like a
password: never put it in front-end code (`src/`) or commit it to the repo,
only ever in the Netlify environment variable above.

## Deployment

Configured for Netlify (`netlify.toml` + `public/_redirects` handle the SPA
routing). Connect the GitHub repo in Netlify, build command `npm run build`,
publish directory `dist`, already set in `netlify.toml`, so the defaults
just work.
