# Contributing

This repository accepts changes that remain reproducible for both humans and
coding agents. A change is complete only when its behavior, verification, and
maintenance boundary are visible in the repository.

## Set up the repository

Use Node.js 20 or newer.

1. Run `npm ci`.
2. Run `npm run validate:fast`.
3. For extension UI work, install Chromium with
   `npx playwright install chromium`.
4. Load `src/` as an unpacked extension for interactive verification.

## Develop a change

Keep each change focused and testable.

1. Read `AGENTS.md`, `ARCHITECTURE.md`, and the relevant recovery documentation.
2. Write one failing test for the first observable behavior.
3. Implement the smallest change that passes the test.
4. Update documentation when commands, contracts, permissions, or architecture
   change.
5. Run `npm run validate:fast`.
6. Run `npm run validate:full` for runtime-sensitive changes.

## Modify recovered or bundled code

Treat `src/assets/` as a restricted maintenance surface.

- Prefer changing readable modules outside `src/assets/`.
- Add a semantic anchor test for each necessary bundle patch.
- Update `docs/recovery-model.md` when ownership or call-chain knowledge changes.
- Verify the final release package, not only the source checkout.

## Submit a change

Use the pull request template and include the exact validation commands and
results. Record runtime evidence for UI changes and explain every permission
change.

