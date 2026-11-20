# FiftyFifty — developer summary

Concise developer-facing facts for contributors and automation. User-facing
details live in `README.md`.

# Project at-a-glance

- App: FiftyFifty — local-first check-splitting PWA.
- Architecture: Nuxt client + Nitro API routes on Netlify, Netlify Blobs for
  shared links, Gemini for server receipt OCR, PaddleOCR in a worker for the
  on-device path/fallback.
- Local checks remain the source of truth and stay on the device.

## Stack & tooling

- Framework: Nuxt 4 + Nuxt UI.
- Package manager: bun. Node >=18 recommended.
- Dev scripts: `bun run dev`, `bun run build`, `bun run preview`.
- Tests: `bun test`. Typecheck: `bun run typecheck`.
- Linters/formatters: ESLint, Prettier.

# Architecture map

- `app/` — client pages, stores, composables, workers.
- `shared/types/` — types shared by client and server.
- `shared/utils/` — pure helpers such as `computeTotals`.
- `shared/server/` — check store, validation, tokens, expiry, cleanup, and the
  API service layer (`check-service.ts`). Tests exercise this layer with an
  in-memory Blobs store.
- `server/api/` — thin Nitro HTTP wrappers around the service layer.
- `server/utils/` — API error/body helpers and OCR normalization.
- `netlify/functions/` — scheduled cleanup function.
- `test/` — Bun tests (no network, no Blobs).

# Storage & PWA

- Local structured data: IndexedDB (`checks`, and non-PII `sharedChecks`
  previews). DB version is bumped when a new store is added.
- Ephemeral UI flags: localStorage.
- PWA: service worker for app shell caching; web manifest for install metadata.
- `/api/**` must use Workbox `NetworkOnly` and must never be cached or
  precached. Shared-check data is live-only.

# Invariants / constraints

## Sharing and retention

- Local checks are canonical for owners. Never replace them with server data
  implicitly.
- Recipients never store a full check. The `sharedChecks` preview may contain
  only: `shareId`, `name`, `total`, item labels, guest count, currency symbol,
  `createdAt`, `expiresAt`.
- Never store guest names, guest IDs, payment handles, guest assignments, or
  check bodies in recipient storage.
- The edit token is returned once by `POST /api/checks` and kept on the owner's
  device. Only its SHA-256 hash is stored server-side. Never put the token in a
  URL, query string, analytics event, or log.
- Shared links expire 7 days after creation or the last successful edit.
  Revoked/expired records become PII-free tombstones and are deleted after
  30 days.
- Shared GET responses never include `editTokenHash`.
- `GET /s/:id` must always re-fetch the live copy. No cached check content on
  offline/error.

## Receipt OCR

- The crop modal runs before any upload. Server OCR receives only the cropped
  image.
- Server-first when online and the user has not chosen on-device scanning.
  Fall back to `useReceiptOcr` on network errors, timeouts, and `5xx`.
  Do **not** silently fall back on `4xx`.
- The first server scan requires the one-time privacy notice. Persist the
  acknowledgement in localStorage.
- Receipt images and OCR text are transient. Never write them to Blobs, logs,
  telemetry, or IndexedDB.
- On-device OCR is the explicit privacy path and must remain functional.
- The server API returns `{ items, fees, confidence }`, matching
  `ParsedReceipt`.

## Logging and caching

- No request bodies, check content, receipt text, merchant data, handles, or
  tokens in logs.
- `/api/**` responses are `no-store`, `noindex, nofollow`, and
  `no-referrer`.
- Do not add analytics or telemetry.
- Code-based rate limits live in `netlify.toml` as rate-limited redirects
  (`/api/*` broad, `/api/ocr` strict). Free plans allow two rules; keep both
  unless replaced by an equivalent UI rule.

# Environment

Server OCR uses either a user-provided `GEMINI_API_KEY` or Netlify AI Gateway’s
injected `GEMINI_API_KEY` / `GOOGLE_GEMINI_BASE_URL`. Never expose these to the
client bundle.

`nuxt dev` proxies `/api/*` to production. Shared-link and OCR server work that
must be isolated belongs in `netlify dev` (run it under Node, not Bun).

# Code conventions

- All Vue components/pages use `<script setup lang="ts">`.
- Block order in `.vue`: `<script setup>`, `<template>`, then `<style>`.
- Do not use `useSeoMeta` when creating new pages.
- Prefer small, surgical changes. Plan IndexedDB migrations when schemas change.
- Update `agents.md` when architecture, retention rules, or security invariants
  change.

# Authoritative references

- Nuxt UI: https://ui.nuxt.com/docs/components
- Nuxt: https://nuxt.com/docs
- Netlify AI Gateway: https://docs.netlify.com/build/ai-gateway/overview/
- Netlify rate limiting:
  https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/

# Maintenance

Update this file when changing major tooling, the client/server split, storage
schemas, retention, or OCR behavior.
