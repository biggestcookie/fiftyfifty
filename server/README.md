# Server API

Nitro routes under `server/api/` are deployed as Netlify Functions. The app
itself stays client-rendered: `ssr: false` disables page SSR but does not remove
these API routes.

## Routes

- `GET /api/health` — returns `{ "ok": true }`. Use it to confirm the Nitro
  function is live after a deploy.

## Deployment

Netlify's Git integration owns deploys. A push to the production branch runs
the `netlify.toml` build (`bun run build`) and publishes `dist`. The Nitro
netlify preset emits client assets to `dist/` and the API function to
`.netlify/functions-internal`. Do **not** use `bun run generate` for this
variant — it produces a static site without the runtime `/api` routes. There
is no GitHub Actions deployment; the old GitHub Pages workflow is retired.

The Netlify CLI is used locally for `netlify dev` (Blobs/API work), not for
deployment. Run it under **Node**, not Bun: `netlify-cli` crashes when run by
Bun (`enableCompileCache` returns null).

## Local development

- **Client-only work:** `bun run dev` (`nuxt dev`) is fine. It runs the Nitro
  dev server too, but it has no Netlify runtime context, so Netlify Blobs calls
  will fail locally.
- **Server/API work:** use `netlify dev`. It injects the Netlify Blobs context
  (no dashboard toggle or extra credentials are needed locally) and routes
  `/api/*` through the Netlify runtime.
- **Unit tests:** do not call Blobs. Inject an in-memory store instead.

## Environment

Netlify AI Gateway activates after the first production deploy. Locally, either
use the Gateway-provided variables or set `GEMINI_API_KEY` yourself:

- `GEMINI_API_KEY`
- `GOOGLE_GEMINI_BASE_URL` (optional; set by the Gateway)

Never expose these variables to the client bundle. `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID` are deploy/CI secrets only.

## Share URLs

Share URLs use the current page origin (`window.location.origin`), so no
canonical-domain constant is needed. The SPA builds
`${origin}/s/<shareId>` at share time.

## Rate limits

Rate limiting is configured in the Netlify dashboard (Firewall rules), not in
this repo. Required rules:

- `POST /api/checks` — creation limit.
- `POST /api/ocr` — strict per-IP limit.
- `GET /api/checks/*` — broad limit; count 404s to deter enumeration.
