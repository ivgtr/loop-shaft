# LOOP SHAFT

React-based playable vertical slice for the mining / logistics incremental game described in `docs/game-design-requirements.md`.

Phase 1 establishes the fully manual chain: choose a vein, walk, swing, collect, haul, load the elevator, `SEND`, and unload at the surface. Phase 2 adds the first automation without bypassing that chain: Auto Swing generates the same swing action, a Porter physically moves floor loot, and Auto Dispatch submits the same elevator departure when its rule is met.

## Run

```bash
npm ci
npm run dev
```

React owns the HUD and contextual controls. The deterministic simulation, fixed-step loop, Canvas renderer, audio, and persistence remain in the external game runtime under `src/runtime`.

## Controls

| Action | Keyboard | Mouse / touch |
|---|---|---|
| Walk | A/D or left/right arrows | Click the floor or a vein; hold an arrow button |
| One mining swing | Space | Click the current vein again or use MINE |
| Pick up / load / nearby equipment | E | Use the displayed interaction button |
| Return and unload when possible | Walk to the lift, then E | RETURN or click the lift while carrying |
| Send loaded cargo | F | SEND beside the shaft, without changing selection |
| Stop / close context | Esc | STOP |

Click or Tab to the game canvas for gameplay shortcuts. Focused UI buttons retain normal Space/Enter activation. Mining accepts one buffered input within 150ms of recovery or arrival; holding Space does not replace Auto Swing.

Pickup and return are voluntary. Carrying cargo, a full pack, or an unavailable lift never prevents walking or mining. Uncollected ore stays on the floor. Ore is not currency until a Character or Porter carries it into the elevator and the elevator unloads it at the surface.

Click the tool bench to progress Tool → Boots → Auto Swing → Pack → Porter. Inspect the lift to fit/toggle Auto Dispatch. Locked upgrades show their missing prerequisite or Scrap requirement.

## Checks

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The tests cover input buffering, cargo ownership and cancellation, upgrade prerequisites, visual hit targets, keyboard-only first delivery, focus changes, and touch controls. Progression timing and subjective game feel still require human playtesting; see sections 30 and 38 of the requirements.

## GitHub Pages

For the first deployment, select **GitHub Actions** under
**Settings → Pages → Build and deployment → Source**.

Pushes to `main` are built and deployed automatically by the
`Deploy to GitHub Pages` workflow. The published site is available at:

https://ivgtr.github.io/loop-shaft/
