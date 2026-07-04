# Agent guide

Use this file as the entry point for automated development in this repository.
Keep detailed behavior and decisions in the linked documents and executable
checks.

## Required workflow

Follow these steps for every change.

1. Read [the architecture](./ARCHITECTURE.md) and
   [the recovery model](./docs/recovery-model.md) before changing extension
   runtime code.
2. Preserve unrelated working-tree changes. Do not rewrite generated bundle
   files unless the task explicitly requires a bundle patch.
3. Add or update a focused test before changing behavior.
4. Run `npm run validate:fast` before committing.
5. Run `npm run validate:full` when UI, manifest, background runtime, release
   packaging, or extension loading behavior changes.

## Command index

Use these stable commands instead of assembling one-off command sequences.

- `npm run validate:fast`: static checks, unit tests, integration tests, and
  release package validation.
- `npm run validate:full`: the fast suite plus the headed extension E2E smoke
  test.
- `npm run inspect:runtime`: print manifest entry points, permissions, and
  local diagnostic surfaces.
- `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e`: run
  one test layer.

## Durable references

Use these documents for decisions that must survive a chat or agent reset.

- [Architecture](./ARCHITECTURE.md)
- [Recovery model](./docs/recovery-model.md)
- [Security](./docs/SECURITY.md)
- [Reliability](./docs/RELIABILITY.md)
- [Quality score](./docs/QUALITY_SCORE.md)
- [Contributing](./CONTRIBUTING.md)

