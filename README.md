# LOOP SHAFT

React-based playable vertical slice for the mining / logistics incremental game described in `docs/game-design-requirements.md`.

Phase 1 establishes the fully manual chain: choose a vein, walk, swing, collect, haul, load the elevator, `SEND`, and unload at the surface. Phase 2 adds the first automation without bypassing that chain: Auto Swing generates the same swing action, a Porter physically moves floor loot, and Auto Dispatch submits the same elevator departure when its rule is met.

## Run

```bash
npm ci
npm run dev
```

The HUD, ordinary controls, workshop, elevator console, and controls help are painted on a shared Canvas layer inside the game viewport. React supplies the matching native input semantics; research, crew, and deep equipment retain their contextual panels for the next UI stage. The deterministic simulation, fixed-step loop, Canvas renderer, audio, and persistence remain in the external game runtime under `src/runtime`.

## Controls

| Action | Keyboard | Mouse / touch |
|---|---|---|
| Walk | A/D or left/right arrows | Click the floor or a vein; hold an arrow button |
| One mining swing | Space | Click the current vein again or use MINE |
| Pick up / load / nearby equipment | E | Use the displayed interaction button |
| Return and unload when possible | Walk to the lift, then E | RETURN or click the lift while carrying |
| Send loaded cargo | F | SEND beside the shaft, without changing selection |
| Stop / close a window | Esc | STOP / X |
| Elevator console | E near an empty lift; arrows browse, Tab / Enter select | LIFT or click the empty lift; SHIP / TRAVEL / EXTEND |
| Controls help | Tab to ? and Enter | ? |
| Workshop | E near the bench; arrows browse, Tab / Enter select | Click the bench; choose an item and BUY; close with X / Esc |

Click or Tab to the game canvas for gameplay shortcuts. Focused UI buttons retain normal Space/Enter activation. Mining accepts one buffered input within 150ms of recovery or arrival; holding Space does not replace Auto Swing.

Pickup and return are voluntary. Carrying cargo, a full pack, or an unavailable lift never prevents walking or mining. Uncollected ore stays on the floor. Ore is not currency until a Character or Porter carries it into the elevator and the elevator unloads it at the surface.

The workshop keeps Tool / Boots / Pack slots after purchase and shows current → upgraded effects, prerequisites and Scrap shortfalls. Its optional first-delivery guide leads to Tool → Boots → Auto Swing → Pack → Porter. Recovered gear remains available under FINDS. Inspect the lift to fit/toggle Auto Dispatch.

Workshop, elevator, and help input stays inside the active window; closing restores the game focus and selected vein. Cargo is retained and autonomous transport / research continue. Window state is not saved. Transparent native buttons share the painted Canvas layout for keyboard, touch and screen-reader access. The world scale is independent of depth. Small screens reserve fixed HUD / control bands instead of moving or resizing the world when a window opens.

The dock shows backpack capacity once; the shaft shows lift load and shipment status. SHIP sends cargo or changes the automatic relay / routing policy, TRAVEL visits connected floors, and EXTEND opens new connections (or starts D-650 construction). Opening a connection never automatically travels there. Unavailable destinations remain inspectable with the blocking reason; their permissions and fees come from the existing simulation.

## Checks

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The tests cover input buffering, cargo ownership and cancellation, upgrade prerequisites, visual hit targets, keyboard-only first delivery, focus changes, touch controls, workshop comparisons / purchases, modal input isolation, stable viewport geometry, save compatibility, separate opening / travel actions, cargo-blocked travel, floor-independent scale, and keyboard paging through every destination. Progression timing and subjective game feel still require human playtesting; see sections 30 and 38 of the requirements.

## GitHub Pages

For the first deployment, select **GitHub Actions** under
**Settings → Pages → Build and deployment → Source**.

Pushes to `main` are built and deployed automatically by the
`Deploy to GitHub Pages` workflow. The published site is available at:

https://ivgtr.github.io/loop-shaft/
