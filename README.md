# Reddit Highlights Dashboard

Dead-simple way to skim ~30 (or more) subreddits a few times a day without touching cron jobs, databases, or paid services. The setup consists of a single Cloudflare Worker that proxies Reddit feeds and a static dashboard that renders highlights in the browser.

## Repo structure

- `worker/worker.js` — Cloudflare Worker that fetches subreddit JSON feeds, normalises fields, and caches the combined response for 10 minutes.
- `static/index.html` — Tailwind-powered dashboard that calls the worker endpoint and renders cards for each subreddit.

## 1. Deploy the Cloudflare Worker

Option A — Dashboard deploy (no CLI):

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → HTTP handler**.
2. Replace the starter code with the contents of `worker/worker.js`.
3. Deploy and note the URL (ends with `.workers.dev`).
4. Optionally tweak cache TTL by changing `s-maxage` in the `Cache-Control` header.

Option B — CLI deploy with Wrangler:

1. Install Wrangler: `npm i -g wrangler@3`.
2. Authenticate: `wrangler login`.
3. From the `worker/` directory, review `wrangler.toml` and run: `wrangler deploy`.
4. Copy the deployed URL from the output.

## 2. Host the static dashboard

1. Pick any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc.).
2. Upload the contents of `static/index.html` as-is.
3. Edit the `WORKER_URL` constant near the top of the file to point to your Worker (e.g. `https://demo-example.worker.dev/api`). For local dev, use `http://127.0.0.1:8787/api`.
4. Publish the site.

## 3. Use the dashboard

- Open the page.
- Adjust the comma-separated subreddit list.
- Choose `top` or `new`, select a time range (`top` mode), and click **Refresh**.
- Responses are cached for ~10 minutes at the edge, so refreshes stay fast and inexpensive.

## Local development

1. Start the Worker:
   - With Wrangler: `cd worker && wrangler dev --ip 127.0.0.1 --port 8787`
   - Or with Miniflare: `npx miniflare worker/worker.js --modules --host 127.0.0.1 --port 8787`
2. Serve the static site: `cd static && python3 -m http.server 8000 --bind 127.0.0.1`
3. Open `http://127.0.0.1:8000/` and click Refresh.

## Optional upgrades

- Save subreddit lists in `localStorage`.
- Add client-side search or filters.
- Add dark mode styles with Tailwind `dark:` variants.
- Increase cache TTL to reduce Reddit origin calls if you check less frequently.
