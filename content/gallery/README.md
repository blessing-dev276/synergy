# Gallery content

Each file in this folder is one gallery event (title, date, photos), managed
through the **CMS admin at `/admin`** — not by hand.

You shouldn't normally need to touch this folder directly. Log in at
`yoursite.com/admin`, click **New Gallery Event**, give it a title, a date,
and upload photos, then **Publish**. That commits a `.json` file here
automatically and Netlify rebuilds the site.

This README exists just so the folder isn't empty in git — safe to ignore.
