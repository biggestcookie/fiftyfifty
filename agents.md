agents.md — FiftyFifty (developer summary)

# Purpose

Concise developer-facing summary for contributors and automation. This file intentionally contains essential project facts — stack, tooling, and maintenance notes — and defers user-facing details to README.md.

# Project at-a-glance

- App: FiftyFifty — client-side PWA for splitting checks (privacy-first, installable, offline-capable).
- Architecture: Client-only; no backend services or cloud persistence.

## Stack & tooling

- Framework: Nuxt (Nuxt UI starter template)
- Package manager: bun
- Node: Recommended >=18
- Dev scripts (package.json): dev (bun run dev), build (bun run build), preview (bun run preview)
- Linters/formatters: ESLint, Prettier

## Machine-readable manifest

A minimal manifest lives at .skills/skill.yml with the essential keys agents should consult. The manifest is intentionally lightweight and contains a references section for authoritative or hard-to-reach documentation (examples: Nuxt UI pages).

## Storage & PWA

- Primary storage: IndexedDB (preferred) with localStorage for ephemeral flags.
- PWA: service worker for app shell caching; web manifest for install metadata.

# Developer guidance / constraints

- Preserve privacy guarantees: avoid adding analytics, telemetry, or server-side storage unless the architecture and docs are updated.
- Prefer small, surgical pull requests focused on one change.
- Plan for data migrations when changing storage schemas.

# Authoritative references

- Nuxt UI: https://ui.nuxt.com
- Nuxt docs: https://nuxt.com/docs

## Key files and locations

- Web manifest & icons: check public/ or static/
- Storage/helpers and service worker: search src/ for IndexedDB utilities and service worker registration

## Maintenance

Update this file when changing major tooling, altering the client-only architecture, or changing storage schemas. For feature requests and bugs, file focused issues with migration notes if applicable.
