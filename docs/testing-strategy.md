# Test strategy

This document owns test placement and execution policy. The game specification remains `game-design-requirements.md`; old milestone checklists are not a requirement to run every historical test on every PR.

## Required Validation

One `validate` job runs on pull requests and pushes to `main`:

```sh
npm ci
npm test
npm run build
npx playwright install chromium --with-deps
npm run test:e2e:smoke
```

`build` already includes TypeScript checking. Do not add another typecheck step. Keep the existing job name. Use the standard PR merge checkout, read-only repository permissions, and cancel obsolete runs of the same PR/ref. Validation does not modify, commit or push repository files. Branch-push triggers for `codex/**`, nightly full suites and path-selection machinery are intentionally absent.

The initial runtime target is roughly 1–2 minutes, not a hard test assertion or a coverage/count quota. Baseline: [Validation #123](https://github.com/ivgtr/loop-shaft/actions/runs/35861750423/job/107183393105), commit `8809ed9`, 2026-09-23: job 5m10s; browser setup 26s; browser tests 4m22s; unit/integration tests 6s. This is one successful run, not a benchmark average. Compare step durations after changes rather than claiming a speedup from test counts.

## What belongs in the fast suite

`npm test` includes normal `tests/**/*.test.ts`, excluding `*.extended.test.ts`. Keep deterministic, inexpensive protection of save compatibility, cargo ownership, physical appraisal, finite rewards, Reboot/reset boundaries, upgrades, automation, hidden information and input safety. A rare but costly bug such as double appraisal can deserve a small unit regression. Do not drop a whole file just because it also contains authoring diagnostics.

`tests/smoke` is the explicit production-browser boundary. Its three representative scenarios cover:

1. A fresh game, real pointer/keyboard mining, pickup, transport and the first physical delivery.
2. A real Workshop purchase from a representative saved state, then reload with equipment, progress and unappraised carried cargo preserved.
3. Mining by touch on one small viewport, opening/closing a facility, and returning to mining.

Purchase belongs with persistence rather than making the fresh-game test farm money. The saved fixture is installed once through browser storage state, never reapplied on reload. The smoke uses `dist` through `vite preview` on a dedicated strict port, with one Chromium worker and no retries. Build first; it never silently reuses a dev server. No browser-side `/src` imports, debug command injection, animation coordinates or exact copy assertions are needed. Keep trace/screenshot/report only on failures.

## Opt-in tools, not automatic CI

| Command | When to use it |
| --- | --- |
| `npm run test:e2e -- tests/e2e/player-controls.spec.ts` | Changes to the input/focus/touch paths covered by that file |
| `npm run test:e2e` | Broad browser integration changes that justify detailed regressions |
| `npm run test:extended` | Atlas authoring geometry and multi-seed simulation diagnostics |
| `npm run test:extended -- tests/discoveryArt.extended.test.ts` | Deposit/atlas placement changes |
| `npm run test:balance` | Economy, progression or automation tuning: fast rule checks plus multi-seed probes |
| `npm run balance:report` | Explicitly regenerate the committed scripted balance measurements |
| `npm run assets:check` | Changes to authored pixel sheets or their PNG generator |

Extended and balance configurations have their own includes, so the default exclusions cannot silently disable these commands. `balanceSimulation.extended.test.ts` keeps its original probes; it is no longer selected by ordinary `npm test`. No optional command runs on a schedule or as a PR gate.

Detailed browser specs remain under `tests/e2e` and use `playwright.config.ts` with Vite dev. Some rendering probes import `/src` modules directly, intercept draw calls or record review screenshots; changing their server to preview would break them. Image-failure groups, viewport matrices, later-game UI combinations, pixel palettes and rendering instrumentation are opt-in. Run a relevant file instead of the entire directory by default.

`discoveryArt.test.ts` retains state, ownership and unidentified-information contracts. Atlas/anchor/hit geometry is in `discoveryArt.extended.test.ts`. Grayscale-string inequality was removed: different pixel strings do not prove human legibility. Exact palette/row/PNG regeneration belongs to `assets:check`, not duplicate per-pixel assertions. The normal asset test checks only that manifest entries exist as nonempty PNGs, alongside the inexpensive asset-loading contracts.

## Adding and maintaining tests

- Choose the cheapest layer that can prove the behavior. Game rules belong below the browser; browser tests prove the connection between controls, runtime, persistence and the built app. Do not retest every rule through every input or viewport.
- Adding a special-case regression does not automatically justify adding it to CI. Use `*.extended.test.ts` or the opt-in browser directory when its severity and frequency do not justify a merge gate.
- Remove redundant or implementation-locked assertions instead of merely moving all of them to a growing archive. Keep tests that protect a concrete failure, not frame numbers, particle counts, text phrasing or incidental draw-call coordinates. Do not introduce a new framework, sharding, browser cache, flaky-test quarantine or coverage budget to avoid deciding what matters.

During editing, run checks related to the changed area. Before a PR, run the required set once for the final relevant code; do not repeatedly run unchanged full suites without new evidence. Report commands actually run, commands deliberately not run, and any environment limitations. CI success is not human playtesting.

## Human review

Mining feel, reward intensity, visual legibility, atmosphere and long-run progression are human judgments. A targeted manual play/review session is appropriate for those changes. Automated simulations report scripted outcomes, not player fun or human completion time.
