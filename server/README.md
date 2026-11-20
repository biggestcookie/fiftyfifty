# Server API

Nitro routes under `server/api/` are deployed as Netlify Functions. The app
itself stays client-rendered: `ssr: false` disables page SSR but does not remove
these API routes.

## Routes

- `GET /api/health` — returns `{ "ok": true }`. Use it to confirm the Nitro
  function is live after a deploy.
- `POST /api/checks` — create a shared check; returns the one-time edit token.
- `GET /api/checks/:id` — public read; `404` unknown, `410` expired/revoked.
- `PATCH /api/checks/:id` — owner update; `Authorization: Bearer <editToken>`.
- `DELETE /api/checks/:id` — owner revoke; `Authorization: Bearer <editToken>`.

Status codes, validation rules, and the storage layout are documented in
`server/api/README.md`.

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
  will fail locally. To work around that, `nitro.devProxy` in `nuxt.config.ts`
  forwards `/api/*` to the production deployment, so local client work talks to
  the live functions and Blobs. Requests therefore create/revoke **real**
  production shares; use `netlify dev` when you need an isolated local store.
- **Server/API work:** use `netlify dev`. It injects the Netlify Blobs context
  (no dashboard toggle or extra credentials are needed locally) and routes
  `/api/*` through the Netlify runtime.
- **Unit tests:** do not call Blobs. Inject an in-memory store instead.

## Environment

Server OCR uses one of:

- a user-provided `GEMINI_API_KEY` (calls Google directly), or
- Netlify AI Gateway's injected `GEMINI_API_KEY` /
  `GOOGLE_GEMINI_BASE_URL`.

The AI Gateway activates after the first production deploy and requires a
credit-based plan with AI features enabled. A project/team-level
`GOOGLE_API_KEY` or `GOOGLE_VERTEX_BASE_URL` suppresses the Gateway's Gemini
variables. Locally, `nuxt dev` proxies `/api/*` to production; use `netlify dev`
for isolated server work.

Never expose these variables to the client bundle. `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID` are deploy/CI secrets only.

## Request limits

- `POST /api/checks` and `PATCH /api/checks/:id` reject JSON bodies over
  **64 KB** with `413 body_too_large`.
- `POST /api/ocr` rejects requests over ~4 MB plus multipart overhead with
  `413 image_too_large`, and rejects a single image over 4 MB.
- Both are application-level checks in addition to Netlify's platform limits.

## Rate limits

Code-based rate limiting lives in `netlify.toml` as rate-limited redirects.
Netlify supports code rules for redirects (and standalone functions), but not
for Nitro's generated function; the redirects rewrite to the same path so the
Nitro route still handles the request.

Current rules (per IP + domain, 60-second window, `429` when exceeded):

| Path      | Limit   | Purpose                     |
| --------- | ------- | --------------------------- |
| `/api/*`  | 120/min | broad API protection        |
| `/api/ocr` | 5/min  | strict image/Gemini spend guard |

Free plans allow **2** code-based rules per project; Pro allows 5. If a tighter
creation limit is needed on Pro, add `/api/checks` with a lower limit (e.g.
10/min). The stricter OCR rule still applies to `/api/ocr` because every
matching rule counts independently.

Enterprise/HP Edge teams can add UI rules for IP ranges, headers, or
geolocation; code rules take precedence when both exist.

## AI spend cap

The code cannot enforce model spend; set it at the provider/account level:

- **Own `GEMINI_API_KEY`:** set a quota/budget and alerts in Google AI Studio
  or Google Cloud for that key/project.
- **Netlify AI Gateway:** use the team's AI credit usage limits and credit
  balance/auto-recharge controls in Netlify billing. AI Gateway inference is
  metered in credits.

## Share URLs

Share URLs use the current page origin (`window.location.origin`), so no
canonical-domain constant is needed. The SPA builds
`${origin}/s/<shareId>` at share time.
