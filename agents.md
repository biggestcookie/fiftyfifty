agents.md — Project stack & tools

Purpose

This file is the human-facing, canonical summary of the repository's stack, tools, and recommended developer workflows. It is intended to be short, immediately useful, and linked from README.md.

Project summary

- Framework: Nuxt (Nuxt UI starter template)
- Package manager: pnpm
- Node: >=18 (recommendation; check engines in package.json)
- Key scripts:
  - dev: pnpm dev
  - build: pnpm build
  - preview: pnpm preview
- CI: GitHub Actions (typical for this template)
- Linters / formatters: ESLint, Prettier (as configured in the repo)
- Test runner: (if present) vitest or similar

Machine-readable manifest

A minimal manifest lives at .skills/skill.yml with the essential keys agents should consult. The manifest is intentionally lightweight and contains a references section for authoritative or hard-to-reach documentation (examples: Nuxt UI pages).

Authoritative references

- Nuxt UI: https://ui.nuxt.com
- Nuxt docs: https://nuxt.com/docs

Maintenance

Keep agents.md brief and up to date. When adding or removing major tooling, update both agents.md and the .skills/skill.yml manifest so automation and humans stay in sync.
