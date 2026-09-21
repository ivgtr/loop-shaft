from pathlib import Path
import re

changed = set()
def edit(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    assert actual == count, f'{path}: expected {count} occurrences, got {actual}: {old[:100]}'
    p.write_text(text.replace(old, new))
    changed.add(path)

def block(path, start, end, replacement):
    p = Path(path)
    text = p.read_text()
    a = text.index(start)
    b = text.index(end, a)
    p.write_text(text[:a] + replacement + text[b:])
    changed.add(path)

# Persist only new runtime counters; the current node definitions remain authoritative.
edit('src/game/types.ts', '  access?: SiteAccess;', '  access?: SiteAccess;\n  /** Finite deposits consumed this Run; absent only in pre-balance v6 saves. */\n  minedCount?: number;\n  coreExtracted?: number;')
edit('src/game/types.ts', '  rhythmBoostTrips: number;', '  rhythmBoostTrips: number;\n  cargoWaitSeconds?: number;')
edit('src/game/types.ts', 'export interface AutomationState { autoSwing: AutomationToggle; autoDispatch: AutomationToggle; }', "export interface AutomationState { autoSwing: AutomationToggle; autoDispatch: AutomationToggle; dispatchPolicy?: import('./dispatch').DispatchPolicy; }")
edit('src/game/config.ts', 'yieldMin, yieldMax, respawnTimer: 0, respawnDelay, access,', 'yieldMin, yieldMax, respawnTimer: 0, respawnDelay, access, minedCount: 0, coreExtracted: 0,')
edit('src/game/config.ts', "node('scrap-ledge', 'Scrap Ledge', 'NEAR', 118, 30, 9", "node('scrap-ledge', 'Scrap Ledge', 'NEAR', 174, 30, 5")
edit('src/game/config.ts', "node('copper-pocket', 'Copper Pocket', 'MID', 356, 54, 17, ['IRON', 'COPPER'], 0.04, [1, 0, 0, 0, 0, 0], 3, 4, 9)", "node('copper-pocket', 'Copper Pocket', 'MID', 356, 96, 17, ['IRON', 'COPPER'], 0.04, [1, 0, 0, 0, 0, 0], 4, 6, 16)")
edit('src/game/config.ts', "node('fossil-crack', 'Fossil Crack', 'FAR', 438, 96, 29, ['COPPER', 'IRON'], 0.12, [1, 0, 0, 0, 0, 0], 4, 6, 12)", "node('fossil-crack', 'Fossil Crack', 'FAR', 438, 96, 29, ['STONE', 'COPPER'], 0.22, [0.12, 0.88, 0, 0, 0, 0], 1, 2, 20)")
for old, new in [('D030_EXTENSION_COST = 2200', 'D030_EXTENSION_COST = 1200'), ('D060_EXTENSION_COST = 6500', 'D060_EXTENSION_COST = 4800'), ('D100_EXTENSION_COST = 7000', 'D100_EXTENSION_COST = 6000'), ('D180_EXTENSION_COST = 14500', 'D180_EXTENSION_COST = 11000'), ('pack: 450, porter: 700, autoDispatch: 1400', 'pack: 240, porter: 550, autoDispatch: 900')]:
    edit('src/game/config.ts', old, new)
edit('src/game/config.ts', "description: 'Hits against nodes at 10% HP or lower deal heavy finishing damage.'", "description: 'Finish a hit that would leave at most 15% HP, capped at 75% of that hit. Saves a swing on small remnants.'")
edit('src/game/config.ts', "description: 'Nodes break faster and anomalous objects surface more often.'", "description: 'Brittle nodes and more anomalous finds, but fewer ordinary ore pieces.'")
edit('src/game/config.ts', "description: 'Broken nodes knit themselves back together rapidly.'", "description: 'Nodes recover faster and yield more ordinary ore. Plan enough haul capacity.'")
edit('src/game/modifiers.ts', 'commonYieldMultiplier *= 0.68;', 'commonYieldMultiplier *= 0.85;')
edit('src/game/modifiers.ts', 'treasureChanceMultiplier *= 1.15;', 'treasureChanceMultiplier *= 1.25;')
edit('src/game/modifiers.ts', 'playerMoveSpeed *= 0.72;', 'playerMoveSpeed *= 0.8;')
edit('src/game/modifiers.ts', 'porterMoveSpeed *= 0.58;', 'porterMoveSpeed *= 0.8;')
edit('src/game/modifiers.ts', 'elevatorCapacity *= 0.55;', 'elevatorCapacity *= 0.65;')
edit('src/game/modifiers.ts', 'respawnSpeedMultiplier *= 3.2;', 'respawnSpeedMultiplier *= 2.2;\n      commonYieldMultiplier *= 1.2;')
edit('src/game/modifiers.ts', 'miningDamageMultiplier *= 1.8;', 'miningDamageMultiplier *= 1.6;\n      commonYieldMultiplier *= 0.75;')
edit('src/game/modifiers.ts', 'anomalyWeightMultiplier *= 3.8;', 'anomalyWeightMultiplier *= 2.5;')
edit('src/game/modifiers.ts', 'treasureChanceMultiplier *= 1.2;', 'treasureChanceMultiplier *= 1.1;')
edit('src/game/modifiers.ts', "=== 'HEAVY_WORLD' ? 1.55 : 1", "=== 'HEAVY_WORLD' ? 1.35 : 1")
edit('src/game/phase5.ts', "speed *= member.role === 'MINER' ? 0.72 : 0.58;", 'speed *= 0.8;')

# The purchase guide is advice, not a forced prerequisite chain.
for line in ["  if (action === 'upgrade-boots' && run.tool.level !== 2) return 'REQUIRES STEEL PICK';\n", "  if (action === 'unlock-auto-swing' && run.boots.level !== 2) return 'REQUIRES RUNNER BOOTS';\n", "  if (action === 'upgrade-pack' && !run.automation.autoSwing.unlocked) return 'REQUIRES AUTO SWING';\n", "  if (action === 'unlock-porter' && run.pack.level !== 2) return 'REQUIRES FRAME PACK';\n", "  if (action === 'unlock-auto-dispatch' && !run.porter.enabled) return 'REQUIRES PORTER';\n"]:
    edit('src/game/playerControls.ts', line, '')
edit('src/game/playerControls.ts', '  return run.scrap < cost ?', "  if (action === 'unlock-porter' && run.stats.playerDeposits === 0 && run.stats.porterDeposits === 0) return 'DELIVER ONE LOAD FIRST';\n  if (action === 'unlock-auto-dispatch' && run.stats.elevatorTrips === 0) return 'SEND ONE SHIPMENT FIRST';\n  return run.scrap < cost ?")
edit('src/game/playerControls.ts', "(action === 'unlock-porter' && run.porter.enabled)", "(action === 'unlock-porter' && (run.porter.enabled || run.phase5.crew.members.some((member) => member.role === 'PORTER')))")
edit('src/game/workshop.ts', "'Hire Porter', 'porter', run.porter.enabled,", "'Hire Porter', 'porter', run.porter.enabled || run.phase5.crew.members.some((member) => member.role === 'PORTER'),")
edit('src/game/workshop.ts', "'Carry more ore per trip. Pickup and return remain your choice.'", "'Carry a full Copper Pocket batch in one trip. Can be bought before Auto Swing.'")

# Shared physical reward logic and a finite Core Shell.
edit('src/game/simulation.ts', "import { createNewRun } from './createGame';", "import { createNewRun } from './createGame';\nimport { finishingDamage, rollMiningLoot, treasureChance } from './mining';\nimport { shipmentDecision, updateShipmentWait } from './dispatch';")
block('src/game/simulation.ts', 'function spawnLoot(state:', 'function pickUpNearbyLoot(state:', """function spawnLoot(state: GameState, node: MiningNode): void {
  const floor = currentFloor(state);
  floor.loot.push(...rollMiningLoot(state, floor, node, (type, data) => emit(state, type, data)));
}

""")
edit('src/game/simulation.ts', "  let damage = state.run.tool.damage * modifiers.miningDamageMultiplier;\n  if (state.meta.passives.active.includes('LAST_SWING') && node.hp / node.maxHp <= 0.1) damage *= 2.6;\n  damage = Math.max(1, Math.round(damage));", '  const damage = finishingDamage(state, node, state.run.tool.damage * modifiers.miningDamageMultiplier);')
edit('src/game/simulation.ts', '  return Math.min(0.95, node.treasureChance * getModifiers(state).treasureChanceMultiplier);', '  return treasureChance(state, node);')
edit('src/game/simulation.ts', 'function updateElevator(state: GameState, dt: number): void {\n  const elevator = state.run.elevator;', 'function updateElevator(state: GameState, dt: number): void {\n  updateShipmentWait(state, dt);\n  const elevator = state.run.elevator;')
block('src/game/simulation.ts', '  const weight = cargoWeight(run.elevator.cargo);\n  const full =', '\n  dispatchElevator(state);\n}', "  const decision = shipmentDecision(state);\n  if (!decision.send) return;\n  emit(state, 'AUTO_DISPATCH_TRIGGER', { weight: cargoWeight(run.elevator.cargo), threshold: decision.threshold, reason: decision.reason });")
block('src/game/simulation.ts', '  const blueprint = state.meta.protocols.includes(\'SHAFT_BLUEPRINT\');\n  const prerequisiteReady =', "  return run.depth.current === 'D-001'", '  const prerequisiteReady = run.stats.elevatorTrips > 0;\n')
edit('src/game/simulation.ts', "emit(state, 'LOOT_APPRAISE', { id: item.id, name: item.name, category: item.category, rarity: item.rarity });", "emit(state, 'LOOT_APPRAISE', { id: item.id, kind: item.kind, name: item.name, category: item.category, rarity: item.rarity, depth: item.originDepth ?? state.run.depth.current });")
edit('src/game/simulation.ts', "emit(state, 'NODE_BREAK', { nodeId: node.id });", "emit(state, 'NODE_BREAK', { nodeId: node.id, depth: state.run.depth.current });")

# Autonomous Miners use the same RNG, safeguards and finite counters as manual work.
edit('src/game/phase5.ts', "import { getModifiers } from './modifiers';", "import { getModifiers } from './modifiers';\nimport { finishingDamage, rollMiningLoot, nodeTripEstimate, treasureCategoryChance, visibleSeams, coreReserveRemaining } from './mining';")
block('src/game/phase5.ts', 'function spawnCrewLoot(state:', 'function updateCrewPorter(state:', """function spawnCrewLoot(state: GameState, member: CrewMember, floor: FloorState, node: MiningNode): void {
  floor.loot.push(...rollMiningLoot(state, floor, node, (type, data) => emit(state, type, data), { crewId: member.id }));
  if (member.assignedDepth === D180) spawnAncientSiteDrop(state, floor, node, member.id);
}

""")
edit('src/game/phase5.ts', 'return Math.max(1, Math.round(11 * getModifiers(state).miningDamageMultiplier * crewToolMultiplier(state, member, node)));', 'return finishingDamage(state, node, 11 * getModifiers(state).miningDamageMultiplier * crewToolMultiplier(state, member, node));')
block('src/game/phase5.ts', 'function chooseMinerNode(', 'function findCrewNode(', """function chooseMinerNode(state: GameState, member: CrewMember, floor: FloorState): MiningNode | undefined {
  const nodes = floor.nodes.filter((node) => node.hp > 0 && canPlayerAccessNode(node));
  const score = (node: MiningNode): number => {
    if (member.minerPriority === 'NEAREST') return -Math.abs(node.x - member.body.x);
    const travel = Math.abs(nodeDestination(node) - member.body.x) / Math.max(1, member.body.moveSpeed);
    const work = Math.ceil(node.hp / crewMiningDamage(state, member, node)) * SWING.total;
    const estimate = nodeTripEstimate(state, node);
    const haul = 2 * Math.abs(node.x - localCargoDropX(state, member.assignedDepth)) / CREW_PORTER_MOVE_SPEED;
    const seam = visibleSeams(floor, node)[0];
    const bonus = seam ? LOOT[seam.kind] : null;
    const bonusRate = seam ? 1 / Math.max(1, seam.at - (node.minedCount ?? 0)) : 0;
    if (member.minerPriority === 'RESEARCH') return (treasureCategoryChance(state, node, 'RESEARCH') * 5
      + (bonus?.dataValue ?? 0) * bonusRate) / Math.max(1, travel + work + haul);
    if (member.minerPriority === 'RARE') return (node.treasureChance + bonusRate + (coreReserveRemaining(node) > 0 ? node.coreWeight : 0))
      / Math.max(1, travel + work + haul * 0.5);
    return (estimate.averageScrap + (bonus?.value ?? 0) * bonusRate) / Math.max(1, travel + work + haul * estimate.averageWeight / CREW_PORTER_CAPACITY);
  };
  return nodes.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
}

""")
edit('src/game/phase5.ts', "  let chance = node.id === 'sealed-chamber' ? 0.1 : node.id === 'ruined-workshop' ? 0.08 : 0.04;", "  let chance = (node.minedCount ?? 0) === 1 ? 1 : node.id === 'sealed-chamber' ? 0.1 : node.id === 'ruined-workshop' ? 0.08 : 0.04;")

# Remote extraction reserves enough physical space before breaking a node.
edit('src/game/deepGame.ts', "import { appraisalMultiplier } from './modifiers';", "import { appraisalMultiplier, getModifiers } from './modifiers';\nimport { finishingDamage, maximumMiningDropWeight, rollMiningLoot } from './mining';")
edit('src/game/deepGame.ts', "    if (cargoWeight(bore.outputBuffer) >= bore.maxOutputWeight - 0.001 || cargoWeight(line.inputBuffer) >= line.maxInputWeight - 0.001) {", "    const reserved = maximumMiningDropWeight(state, state.run.floors[bore.depth], node) + (node.id === 'fracture-well' ? LOOT.DEEP_COMPONENT.weight : 0);\n    if (cargoWeight(bore.outputBuffer) + reserved > bore.maxOutputWeight + 0.001 || cargoWeight(line.inputBuffer) >= line.maxInputWeight - 0.001) {")
edit('src/game/deepGame.ts', '  let damage = bore.damage;', '  let damage = bore.damage * getModifiers(state).miningDamageMultiplier;')
edit('src/game/deepGame.ts', '  if (coupler > 0) damage = Math.round(damage * (1 + coupler));', '  if (coupler > 0) damage *= 1 + coupler;\n  damage = finishingDamage(state, node, damage);')
block('src/game/deepGame.ts', '  const count = Math.max(1, Math.min(3, node.yieldMin', '\nfunction appraiseDeepCargo(', """  const items = rollMiningLoot(state, state.run.floors[bore.depth], node, (type, data) => emit(state, type, data), { boreId: bore.id });
  bore.outputBuffer.push(...items);
  for (const loot of items) emit(state, 'BORE_OUTPUT', { boreId: bore.id, id: loot.id, kind: loot.kind, depth: bore.depth });
}
""")
edit('src/game/deepGame.ts', "const id = String(event.data?.id ?? '');", "const id = String(event.data?.research ?? '');")
edit('src/game/deepGame.ts', "if (nodeId === 'hanging-vein' && nextRandom(state) < 0.12)", "if (nodeId === 'hanging-vein' && ((floor.nodes[1]?.minedCount ?? 0) === 1 || nextRandom(state) < 0.12))")

# Dispatch choices are real simulation commands, using the existing Canvas lift window.
edit('src/runtime/commands.ts', "  | { type: 'toggle-auto-dispatch' }", "  | { type: 'toggle-auto-dispatch' }\n  | { type: 'dispatch-policy'; policy: import('../game/dispatch').DispatchPolicy }")
edit('src/runtime/GameRuntime.ts', "      case 'toggle-auto-dispatch': toggleAutoDispatch(this.state); break;", "      case 'toggle-auto-dispatch': toggleAutoDispatch(this.state); break;\n      case 'dispatch-policy': setDispatchPolicy(this.state, command.policy); break;")
p = Path('src/runtime/GameRuntime.ts'); p.write_text("import { setDispatchPolicy } from '../game/dispatch';\n" + p.read_text())
edit('src/game/elevatorUi.ts', "import { DEPTH_ORDER } from './depth';", "import { DEPTH_ORDER } from './depth';\nimport { DISPATCH_POLICIES, DISPATCH_RULES, dispatchPolicy, shipmentDecision } from './dispatch';")
edit('src/game/elevatorUi.ts', "  return elevator.cargo.length ? 'READY TO SEND' : 'LIFT EMPTY';", "  return elevator.cargo.length ? state.run.automation.autoDispatch.enabled ? shipmentDecision(state).reason : 'READY TO SEND' : 'LIFT EMPTY';")
edit('src/game/elevatorUi.ts', "  if (run.phase5.cargo.unlocked) for (const priority", "  if (relay.unlocked) for (const policy of DISPATCH_POLICIES) {\n    const selected = dispatchPolicy(state) === policy;\n    items.push({ id: `dispatch-${policy}`, name: `${policy} shipments`, summary: selected ? 'ACTIVE SHIPMENT POLICY' : 'SHIPMENT POLICY',\n      description: DISPATCH_RULES[policy].description, reason: selected ? 'Already active.' : null,\n      actionLabel: `USE ${policy}`, complete: selected, command: selected ? null : { type: 'dispatch-policy', policy } });\n  }\n  if (run.phase5.cargo.unlocked) for (const priority")
edit('src/game/elevatorUi.ts', "      [blueprint ? run.automation.autoSwing.unlocked : run.automation.autoDispatch.unlocked && run.porter.enabled,\n        blueprint ? 'Requires Auto Swing (Shaft Blueprint route).' : 'Requires Porter and Auto Dispatch.'],", "      [run.stats.elevatorTrips > 0, 'Deliver one shipment to Surface. Automation is optional for D-030.'],")

# A stable second readout strip communicates purpose and the finite bonus before mining.
edit('src/game/hud.ts', "import { DEPTH_ORDER } from './depth';", "import { DEPTH_ORDER } from './depth';\nimport { nodeSurvey, nodeTripEstimate } from './mining';")
edit('src/game/hud.ts', '  return {\n    title:', "  const survey = node ? nodeSurvey(state, currentFloor(state), node) : '';\n  const trip = node ? nodeTripEstimate(state, node) : null;\n  return {\n    survey,\n    title:")
edit('src/game/hud.ts', "detail: [guide?.context ?? goal, node?.name, health, reason].filter(Boolean).join(' · '),", "detail: [survey, trip ? `Haul about ${trip.walkSeconds.toFixed(1)}s round trip; average ore ${trip.averageWeight.toFixed(1)}kg` : '', guide?.context ?? goal, node?.name, health, reason].filter(Boolean).join(' · '),")
edit('src/render/gameUi.ts', "    const top = h - (compact ? 132 : 88);", "    const top = h - (compact ? 132 : 88);\n    text(ctx, elide(ctx, readout.survey, w - 20, 11), 10, viewport.world.y + viewport.world.height - (compact ? 24 : 7), 11, C.gold);")
edit('src/game/workshop.ts', '  const next = nextWorkshopUpgrade(state);\n  if (!next) return null;', "  if (run.scrap >= 1200) return null;\n  const next = nextWorkshopUpgrade(state);\n  if (!next) return null;")
edit('src/render/gameUi.ts', "  else if (state.run.depth.current === 'D-001' && state.run.porter.enabled) {", "  else if (state.run.depth.current === 'D-001' && state.run.stats.elevatorTrips > 0) {")
edit('src/render/gameUi.ts', "    const relay = state.run.automation.autoDispatch.unlocked;", "    const relay = true; // D-030 exploration no longer requires the full automation chain.")

# Save/load rebases static tuning, retains partial work and cargo, and migrates finite reserves once.
edit('src/game/save.ts', "import { DEPTH_ORDER } from './depth';", "import { DEPTH_ORDER } from './depth';\nimport { CORE_RESERVES } from './mining';\nimport { DISPATCH_POLICIES, type DispatchPolicy } from './dispatch';")
edit('src/game/save.ts', '  if (hasDeep) normalizeDeepRun(run, rawRun);', "  if (hasDeep) normalizeDeepRun(run, rawRun);\n  run.automation.dispatchPolicy = DISPATCH_POLICIES.includes(automation?.dispatchPolicy as DispatchPolicy) ? automation!.dispatchPolicy as DispatchPolicy : 'BALANCED';\n  run.elevator.cargoWaitSeconds = Math.min(60, Math.max(0, numberOr(elevator?.cargoWaitSeconds, 0)));\n  migrateMineralProgress(base, rawFloors);")
block('src/game/save.ts', 'function normalizeNode(value:', 'function normalizeLootArray(value:', """function normalizeNode(value: unknown, fallback: MiningNode): MiningNode {
  const saved = asRecord(value);
  if (!saved) return fallback;
  const fraction = Math.max(0, Math.min(1, numberOr(saved.hp, fallback.maxHp) / Math.max(1, numberOr(saved.maxHp, fallback.maxHp))));
  return {
    ...fallback,
    hp: Math.ceil(fraction * fallback.maxHp),
    respawnTimer: Math.min(1, Math.max(0, numberOr(saved.respawnTimer, 0)) / Math.max(0.1, numberOr(saved.respawnDelay, fallback.respawnDelay))) * fallback.respawnDelay,
    minedCount: Math.min(1e9, Math.max(0, Math.floor(numberOr(saved.minedCount, 0)))),
    coreExtracted: Math.min(CORE_RESERVES[fallback.id] ?? 0, Math.max(0, Math.floor(numberOr(saved.coreExtracted, 0)))),
  };
}

function migrateMineralProgress(state: GameState, rawFloors: Record<string, unknown> | null): void {
  if (!rawFloors) return;
  const run = state.run;
  const started = run.lootRoll > 0 || run.stats.manualSwings > 0 || run.stats.elevatorTrips > 0;
  for (const floor of Object.values(run.floors)) {
    const saved = asRecord(rawFloors[floor.id]);
    const nodes = Array.isArray(saved?.nodes) ? saved.nodes : [];
    for (const node of floor.nodes) {
      const old = asRecord(nodes.find((entry) => asRecord(entry)?.id === node.id));
      if (!old) continue;
      const visited = started && run.depth.unlocked.includes(floor.id);
      if (old.minedCount === undefined) node.minedCount = visited ? 99 : 0;
      if (old.coreExtracted === undefined) {
        node.coreExtracted = visited ? CORE_RESERVES[node.id] ?? 0 : 0;
        if (node.id === 'core-shell') {
          const breaks = run.discovery.d100CoreBreaks;
          node.coreExtracted = breaks > 0 ? Math.min(4, breaks + 1) : run.pendingCore > 0 && visited ? 4 : 0;
        }
      }
    }
  }
  const character = run.character;
  const target = run.floors[run.depth.current].nodes.find((node) => node.id === character.targetNodeId);
  if (target && character.state === 'MINING' && Math.abs(target.x - character.x) > 26) {
    character.state = 'MOVING_TO_NODE';
    character.swing = null;
  }
}

""")
# A single configured default for old saves and new runs.
edit('src/game/createGame.ts', '      rhythmBoostTrips: 0,', '      rhythmBoostTrips: 0,\n      cargoWaitSeconds: 0,')
edit('src/game/createGame.ts', '    automation: {\n      autoSwing:', "    automation: {\n      dispatchPolicy: 'BALANCED',\n      autoSwing:")

# Remove imports made obsolete by replacing duplicate reward implementations.
for path in changed:
    p = Path(path)
    text = p.read_text()
    pattern = re.compile(r'import (type )?\{([^{}]+)\} from ([^;]+);', re.S)
    for match in list(pattern.finditer(text))[::-1]:
        entries = [part.strip() for part in match.group(2).split(',') if part.strip()]
        rest = text[:match.start()] + text[match.end():]
        keep = []
        for entry in entries:
            name = entry.split(' as ')[-1].removeprefix('type ').strip()
            if re.search(r'\b' + re.escape(name) + r'\b', rest): keep.append(entry)
        if keep != entries:
            replacement = ('import ' + (match.group(1) or '') + '{ ' + ', '.join(keep) + ' } from ' + match.group(3) + ';') if keep else ''
            text = text[:match.start()] + replacement + text[match.end():]
    p.write_text(text)
print('Updated:', ', '.join(sorted(changed)))
