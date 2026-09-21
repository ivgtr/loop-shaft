# LOOP SHAFT

React-based playable vertical slice for the mining / logistics incremental game described in `docs/game-design-requirements.md`.

Phase 1 establishes the fully manual chain: choose a vein, walk, swing, collect, haul, load the elevator, `SEND`, and unload at the surface. Phase 2 adds the first automation without bypassing that chain: Auto Swing generates the same swing action, a Porter physically moves floor loot, and Auto Dispatch submits the same elevator departure when its rule is met.

## Discoveries

D-001 uses authored pixel sheets for deposit layers, persistent extraction sockets and quality-specific cargo. The same cargo art follows physical transport; Archive displays identified and restored specimens. See [asset inventory and acceptance criteria](docs/discovery-art.md).

Ordinary ore sometimes has **Fine (1.5×)** or **Pure (3×)** appraisal quality without extra weight. D-030 yields single-affix field tools during the first Run. Random fossils stay unidentified until physical delivery; the Surface Analyzer appraises them automatically. **Archive → RECENT** retains important results, and missing fossil records can be restored from five delivered same-family duplicates with explicit confirmation.

Mining uncovers two finite traces per eligible floor. Metal flecks, fossil outlines and crystal layers mark the target; their shapes change as they are exposed and extracted. They never expire and do not reduce normal production. **LIFT → SHIP → Porter pickup hold** finishes carried cargo and stops new pickups so a floor trip need not wait for every loose ore. Pickup work resumes after travel or on explicit RESUME.

Rules, safeguards, save compatibility, measurements and the later sprite-art contract: [Discovery balance](docs/discovery-balance.md).

## Run

```bash
npm ci
npm run dev
```

All visible gameplay UI, including equipment, research, crew, Collection, Anomaly, Core / Reboot and deep logistics, is painted on the shared Canvas layer inside the game viewport. React supplies matching native input semantics; no external management panels are required. The deterministic simulation, fixed-step loop, Canvas renderer, audio, and persistence remain in the external game runtime under `src/runtime`.

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
| Base facilities | Tab to BASE and Enter; arrows browse | BASE or the device in the world |
| Facility details | Page Up / Down | Detail page arrows |
| Controls help | Tab to ? and Enter | ? |
| Workshop | E near the bench; arrows browse, Tab / Enter select | Click the bench; choose an item and BUY; close with X / Esc |

Click or Tab to the game canvas for gameplay shortcuts. Focused UI buttons retain normal Space/Enter activation. Mining accepts one buffered input within 150ms of recovery or arrival; holding Space does not replace Auto Swing.

Pickup and return are voluntary. Carrying cargo, a full pack, or an unavailable lift never prevents walking or mining. Uncollected ore stays on the floor. Ore is not currency until a Character or Porter carries it into the elevator and the elevator unloads it at the surface.

The workshop keeps Tool / Boots / Pack slots after purchase and shows current → upgraded effects, prerequisites and Scrap shortfalls. Its optional first-delivery guide leads to Tool → Boots → Auto Swing → Pack → Porter. FINDS opens the full slot-filtered inventory with real before/after comparisons and ownership-transfer confirmation. Inspect the lift to fit/toggle Auto Dispatch.

All window input stays inside the active window; closing restores the game focus and selected vein. Cargo is retained and autonomous transport / research continue. Window state is not saved. Transparent native buttons share the painted Canvas layout for keyboard, touch and screen-reader access. The world scale is independent of depth. Small screens reserve fixed HUD / control bands instead of moving or resizing the world when a window opens.

The dock shows backpack capacity once; the shaft shows lift load and shipment status. SHIP sends cargo or changes the automatic relay / routing policy, TRAVEL visits connected floors, and EXTEND opens new connections (or starts D-650 construction). Opening a connection never automatically travels there. Unavailable destinations remain inspectable with the blocking reason; their permissions and fees come from the existing simulation.

Facilities share focus, close and execution rules while using task-specific layouts. Locked entries can still be inspected. Crew destinations and priorities are explicit choices, not cycling buttons. Long detail text is paged rather than discarded at small widths. Collection preserves discovery records and separates the two active passive slots.

Anomaly choices, equipment transfers, and Reboot consequences require an explicit review before confirmation. Reboot shows the actual Core reward, permanent records, retained Legacy Locker item and reset resources / cargo / equipment. Escape first cancels confirmation, then closes the window. Confirmation is never restored from a save.

### Facility controls

Equipment compares current gear with a candidate; **EFFECTS & STATS** opens the full comparison. The shift board shows workers and their floor/task/priority beside the selected worker's controls. Research progress stays visible while inspecting plans, and Collection uses discovery tiles. Rail/Freight settings belong to the selected route: choosing a priority does not apply it until confirmed. Equipped/active/current badges remain independent of the inspected item.

Reboot and equipment transfers pin their consequences beside the final action. **KEEP MINING** cancels Reboot and returns to the mine. Extra explanations are optional; Page Up/Down opens and pages them. The portrait stage uses available height without stretching the world or resizing it when a facility opens.

## Balance

Renewable ore supports stable work. Visible, finite seams add fossils and special finds without lowering ordinary yield for staying at a site. D-030 can open before full automation; Boots and Pack do not require earlier shop purchases. Auto Dispatch offers BALANCED / BULK / PRIORITY policies with a maximum cargo wait. Core reserves are finite per site and Run.

The current rules and save migration are in [balance-design.md](docs/balance-design.md). `npm run test:balance` checks physical rewards, shipping and comparative routes; `npm run balance:report` explicitly regenerates [the scripted measurements](docs/balance-results.json). These are not human play-time or game-feel results.

## Checks

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The tests cover input buffering, cargo ownership and cancellation, upgrade prerequisites, visual hit targets, keyboard-only first delivery, focus changes, touch controls, workshop comparisons / purchases, modal input isolation, stable viewport geometry, save compatibility, separate opening / travel actions, cargo-blocked travel, floor-independent scale, keyboard paging through every destination, all recovered instances, research transitions, crew assignment / equipment, passives, protocols, reset previews and confirmation invalidation. Progression timing and subjective game feel still require human playtesting; see sections 30 and 38 of the requirements.

## GitHub Pages

For the first deployment, select **GitHub Actions** under
**Settings → Pages → Build and deployment → Source**.

Pushes to `main` are built and deployed automatically by the
`Deploy to GitHub Pages` workflow. The published site is available at:

https://ivgtr.github.io/loop-shaft/
