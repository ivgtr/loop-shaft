# Development checks

Game behavior is specified in `docs/game-design-requirements.md`. Test placement and execution are specified in `docs/testing-strategy.md`; historical milestone checklists do not override that policy.

- During editing, run tests relevant to the changed behavior. Before a PR, the normal set is `npm test`, `npm run build`, and `npm run test:e2e:smoke` (install Chromium once as needed). The build includes typechecking.
- `npm run test:e2e`, `test:extended`, `test:balance`, `balance:report`, and `assets:check` are opt-in tools. Run only relevant files/suites when the change warrants them. Do not add them to Validation, a nightly workflow, or every implementation task by default.
- Protect save compatibility, cargo ownership, physical appraisal, finite rewards and reset behavior with inexpensive deterministic tests. Keep browser smoke focused on production integration; do not duplicate each game rule across inputs, viewports and browser scenarios.
- New special-case tests do not automatically belong in required CI. Put optional unit probes in `*.extended.test.ts`; keep detailed browser/rendering probes under `tests/e2e`.
- Prefer state/behavior contracts over copy, particle counts or incidental drawing coordinates. Delete redundant assertions. Do not add test frameworks, workflow matrices, coverage gates or timing assertions without a concrete need.
- Do not change game balance or production behavior merely to make tests faster. Do not reseed storage on reload in persistence tests.
- Report only checks actually run and disclose environment limitations. Do not repeatedly rerun unchanged full suites. Visual quality and game feel require human review, not a claimed automated playtest.
