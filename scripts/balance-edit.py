from pathlib import Path
import re

def replace(path, old, new):
    p = Path(path); s = p.read_text()
    assert old in s, f'{path}: not found: {old[:100]}'
    p.write_text(s.replace(old,new))

def insert_in_function(path, name, content):
    p = Path(path); s = p.read_text()
    pattern = r'(function ' + name + r'\([^)]*\)[^{]*\{\n)'
    s, n = re.subn(pattern, lambda m: m[1] + content, s, count=1)
    assert n == 1, (path, name)
    p.write_text(s)

replace('src/game/elevatorUi.ts', "  const blueprint = meta.protocols.includes('SHAFT_BLUEPRINT');\n", '')
replace('src/game/phase5.ts', 'import { hashSeed, nextRandom, pick }', 'import { hashSeed, nextRandom }')
replace('src/game/save.ts', 'hp: Math.ceil(fraction * fallback.maxHp),', 'hp: Math.ceil(fraction * fallback.maxHp - 1e-9),')
replace('tests/balance.test.ts', 'id = kind): LootStack', 'id: string = kind): LootStack')
# A near site stays clear of the Workshop artwork and has consistently small cargo.
replace('src/game/config.ts', "'NEAR', 174, 30, 5", "'NEAR', 154, 30, 7")
replace('src/game/config.ts', "['STONE', 'IRON'], 0.01, [1, 0, 0, 0, 0, 0], 2, 3, 6", "['STONE', 'IRON'], 0.01, [1, 0, 0, 0, 0, 0], 3, 3, 6")
replace('src/game/config.ts', "['IRON', 'COPPER'], 0.04, [1, 0, 0, 0, 0, 0], 4, 6, 16", "['IRON', 'COPPER'], 0.04, [1, 0, 0, 0, 0, 0], 4, 6, 12")
replace('src/game/mining.ts', "'scrap-ledge': [1, 4]", "'scrap-ledge': [1, 9]")
replace('src/game/workshop.ts', 'import { PLAYER_PACK_CAPACITY,', 'import { D030_EXTENSION_COST, PLAYER_PACK_CAPACITY,')
replace('src/game/workshop.ts', 'if (run.scrap >= 1200)', 'if (run.scrap >= D030_EXTENSION_COST)')
# Name-based positions make input regressions independent of future numeric tuning.
files = ['tests/playerControls.test.ts', 'tests/runtime.test.ts', 'tests/interactionTargets.test.ts',
    'tests/e2e/game.spec.ts', 'tests/e2e/workshop.spec.ts', 'tests/e2e/player-controls.spec.ts', 'tests/e2e/elevator-ui.spec.ts']
for file in files:
    p=Path(file); s=p.read_text(); root='../../src' if '/e2e/' in file else '../src'
    s = re.sub(r'\b118\b', 'SCRAP_X', s)
    if file in ['tests/e2e/workshop.spec.ts','tests/e2e/player-controls.spec.ts']:
        s = re.sub(r'\b131\b', '(SCRAP_X + 13)', s)
    if file == 'tests/playerControls.test.ts': s = s.replace("iron('b', 123)", "iron('b', SCRAP_X + 5)")
    last = list(re.finditer(r'import\b.*?;', s, re.S))[-1].end()
    s=s[:last] + f"\nimport {{ createD001Nodes }} from '{root}/game/config';\nconst SCRAP_X = createD001Nodes()[0]!.x;\n" + s[last:]
    p.write_text(s)
replace('tests/interactionTargets.test.ts', 'x: 140,', 'x: SCRAP_X + 22,')
replace('tests/interactionTargets.test.ts', 'x: 140.01,', 'x: SCRAP_X + 22.01,')
replace('tests/interactionTargets.test.ts', 'x: 136,', 'x: SCRAP_X + 18,')
replace('tests/interactionTargets.test.ts', '// The rendered Scrap Ledge ends around x=131; the display-aligned hit remains forgiving.', '// Display-aligned hit padding extends beyond the rendered rock body.')
# Fixtures deliberately provide the physical experience that is now required for automation.
insert_in_function('tests/simulation.test.ts', 'primeAutomation', '  state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;\n')
replace('tests/playerControls.test.ts', 'state.run.stats.manualSwings = 6;', 'state.run.stats.manualSwings = 6; state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;')
for file in ['tests/elevatorUi.test.ts','tests/e2e/elevator-ui.spec.ts']:
    p=Path(file); s=p.read_text(); a=s.index('function ready('); b=s.index('  return state;',a)
    s=s[:b]+'  state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;\n'+s[b:]; p.write_text(s)
replace('tests/elevatorUi.test.ts', "toEqual(['shipment', 'relay'])", "toEqual(['shipment', 'relay', 'dispatch-BALANCED', 'dispatch-BULK', 'dispatch-PRIORITY'])")
replace('tests/elevatorUi.test.ts', "toContain('Porter and Auto Dispatch')", "toContain('Deliver one shipment')")
replace('tests/elevatorUi.test.ts', "state.meta.protocols.push('SHAFT_BLUEPRINT');", "state.run.stats.elevatorTrips = 1; state.meta.protocols.push('SHAFT_BLUEPRINT');")
replace('tests/elevatorUi.test.ts', '660', '360')
replace('tests/elevatorUi.test.ts', 'toBe(2800)', 'toBe(3800)')
replace('tests/e2e/elevator-ui.spec.ts', '2200 SCRAP', '1200 SCRAP')
replace('tests/e2e/elevator-ui.spec.ts', 'toBe(2800)', 'toBe(3800)')
replace('tests/workshop.test.ts', "'REQUIRES STEEL PICK'", "'NEED 160 MORE SCRAP'")
replace('tests/workshop.test.ts', "'REQUIRES AUTO SWING'", "'NEED 240 MORE SCRAP'")
replace('tests/workshop.test.ts', 'Hit power  18 → 29', 'Hit power  16 → 26')
replace('tests/workshop.test.ts', 'Hit power  29', 'Hit power  26')
replace('tests/workshop.test.ts', 'Walk speed  49.9 → 78.4 px/s', 'Walk speed  55.4 → 87.1 px/s')
replace('tests/workshop.test.ts', '78.408', '87.12')
# Browser assertions now distinguish an affordable optional upgrade from a true automation gate.
replace('tests/e2e/workshop.spec.ts', "  await ui(page, 'item-upgrade-boots').click();\n  await expect(ui(page, 'buy')).toBeDisabled();\n  await expect(dialog(page)).toContainText('REQUIRES STEEL PICK');", "  await ui(page, 'item-upgrade-boots').click();\n  await expect(ui(page, 'buy')).toBeEnabled();\n  await expect(dialog(page)).toContainText('Walk speed');\n  await ui(page, 'tab-automation').click();\n  await ui(page, 'item-unlock-auto-swing').click();\n  await expect(ui(page, 'buy')).toBeDisabled();\n  await expect(dialog(page)).toContainText('MINE 6 MORE TIMES');\n  await ui(page, 'tab-equipment').click();")
replace('tests/e2e/workshop.spec.ts', "await expect(dialog(page)).toContainText('REQUIRES STEEL PICK');", "await expect(dialog(page)).toContainText('Walk speed');\n      await expect(ui(page, 'buy')).toBeEnabled();")
replace('tests/e2e/player-controls.spec.ts', "await expect(dialog).toContainText('REQUIRES STEEL PICK');", "await expect(dialog).toContainText('Walk speed');")
replace('tests/e2e/player-controls.spec.ts', "await expect(dialog.getByRole('button', { name: /Buy Runner Boots/ })).toBeDisabled();", "await expect(dialog.getByRole('button', { name: /Buy Runner Boots/ })).toBeEnabled();")
replace('tests/e2e/player-controls.spec.ts', 'toBeLessThan(140)', 'toBeLessThan(SCRAP_X + 20)')
# Use the exported prices in the simulation probe; no stale milestones after tuning.
replace('tests/fixtures/balanceScenario.ts', 'LOOT, PLAYER_PACK_CAPACITY', 'LOOT, D030_EXTENSION_COST, D060_EXTENSION_COST, D100_EXTENSION_COST, PLAYER_PACK_CAPACITY')
replace('tests/fixtures/balanceScenario.ts', 'run.scrap >= 1200', 'run.scrap >= D030_EXTENSION_COST')
replace('tests/fixtures/balanceScenario.ts', 'run.scrap >= 4800', 'run.scrap >= D060_EXTENSION_COST')
replace('tests/fixtures/balanceScenario.ts', 'run.scrap >= 6000', 'run.scrap >= D100_EXTENSION_COST')
# Extra test command is intentionally optional; the normal suite also includes these regressions.
p=Path('package.json'); import json; data=json.loads(p.read_text()); data['scripts']['test:balance']='vitest run tests/balance.test.ts tests/balanceSimulation.test.ts'; p.write_text(json.dumps(data, indent=2)+'\n')
print('Balance integration fixes and test fixtures updated.')
