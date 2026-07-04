# Agent development harness

This completed plan records the repository changes that turned existing tests,
release checks, and runtime diagnostics into an enforceable development loop.

## Goal

Make a fresh coding agent able to discover project constraints, implement a
focused change, validate it locally, and receive the same result in CI.

## Delivered slices

The implementation completed these vertical slices.

1. Added agent, architecture, recovery, security, reliability, contribution,
   and quality documentation.
2. Added syntax, documentation, architecture, manifest, runtime inspection,
   and aggregate validation commands.
3. Made E2E artifacts and extension roots portable across worktrees and CI.
4. Added fast PR validation, runtime E2E validation, permission baselines, and
   release-package smoke testing.
5. Made the test runner report all failing files and closed an English locale
   request that produced a hidden runtime console error.

## Verification

The completion gate is `npm run validate:full`. It includes static checks,
unit tests, integration tests, release package verification, and a headed
extension E2E smoke test.

## Remaining improvements

The next useful investments are coverage reporting for readable modules,
secret scanning, dependency review, signed release provenance, and continued
extraction of side-panel behavior from the upstream bundle.

