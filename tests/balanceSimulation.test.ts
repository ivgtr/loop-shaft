import { createGameState } from '../src/game/createGame';
import { advanceProspecting, ORE_QUALITY } from '../src/game/prospecting';
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { mean, percentile, runFirstCoreScenario, runIncomeScenario } from './fixtures/balanceScenario';

const seeds = Array.from({ length: 12 }, (_, n) => 1001 + n * 7919);

const progressSeeds = Array.from({ length: 16 }, (_, n) => 1001 + n * 7919);
const report: Record<string, unknown> = {
  method: 'Deterministic scripted physical delivery, not human play time or an optimality proof.',
  fixedStepSeconds: 0.1, incomeHorizonSeconds: 360, incomeSeeds: seeds, progressSeeds,
  progressionPolicy: "Normal commands, equips first delivered field tool, holds new Porter pickups when departing; leaves unclaimed floor cargo in place.",
  configSha256: createHash('sha256').update(readFileSync(new URL('../src/game/config.ts', import.meta.url))).digest('hex'),
  miningSha256: createHash('sha256').update(readFileSync(new URL('../src/game/mining.ts', import.meta.url))).digest('hex'),
  prospectingSha256: createHash('sha256').update(readFileSync(new URL('../src/game/prospecting.ts', import.meta.url))).digest('hex'),
  appraisalSha256: createHash('sha256').update(readFileSync(new URL('../src/game/appraisal.ts', import.meta.url))).digest('hex'),
  phase5Sha256: createHash('sha256').update(readFileSync(new URL('../src/game/phase5.ts', import.meta.url))).digest('hex'),
  scenarioSha256: createHash('sha256').update(readFileSync(new URL('./fixtures/balanceScenario.ts', import.meta.url))).digest('hex'),
  modifiersSha256: createHash('sha256').update(readFileSync(new URL('../src/game/modifiers.ts', import.meta.url))).digest('hex'),
};
afterAll(() => {
  const output = process.env.BALANCE_REPORT_PATH;
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
});

describe('reproducible balance probes (scripted, not human play time)', () => {
  it('measures the post-safeguard quality distribution and local gear droughts', () => {
    const samples = [];
    for (let seed = 1; seed <= 256; seed++) {
      const state = createGameState(seed); const floor = state.run.floors['D-030'];
      let firstQuality = 0; let firstGear = 0; let gear = 0; let maxMisses = 0; let multiplier = 0;
      const counts = { NORMAL: 0, FINE: 0, PURE: 0 };
      for (let n = 1; n <= 80; n++) {
        const outcome = advanceProspecting(floor, floor.nodes[0]!);
        counts[outcome.quality]++; multiplier += ORE_QUALITY[outcome.quality].multiplier;
        if (outcome.quality !== 'NORMAL') firstQuality ||= n;
        if (outcome.fieldGearSeed !== null) { firstGear ||= n; gear++; }
        maxMisses = Math.max(maxMisses, floor.prospecting!.qualityMisses);
      }
      expect(firstQuality).toBeLessThanOrEqual(13); expect(firstGear).toBeLessThanOrEqual(6); expect(maxMisses).toBeLessThanOrEqual(12);
      samples.push({ seed, firstQualityBreak: firstQuality, firstGearBreak: firstGear, maxQualityMisses: maxMisses, gear, counts, meanMultiplier: multiplier / 80 });
    }
    report.rewardStream = { method: '256 seeds x 80 D030 break resolutions; no walking or delivery time. Unweighted nominal quality multiplier, including safeguards, before per-item rounding. Not an income estimate.',
      samples, qualityMeanMultiplier: mean(samples.map((r) => r.meanMultiplier)), firstQualityP90Break: percentile(samples.map((r) => r.firstQualityBreak), 0.9), firstGearP90Break: percentile(samples.map((r) => r.firstGearBreak), 0.9) };
  });

  it('changes the useful income site after investment without requiring a forced rotation', () => {
    const rows = [];
    for (const upgraded of [false, true]) for (const site of ['scrap-ledge', 'copper-pocket', 'fossil-crack', 'discover', 'prospect']) {
      const outcomes = seeds.map((seed) => runIncomeScenario(seed, site, upgraded));
      rows.push({ upgraded, site, seconds: 360, seeds: seeds.length,
        meanScrap: Number(mean(outcomes.map((row) => row.scrap)).toFixed(1)),
        p10Scrap: percentile(outcomes.map((row) => row.scrap), 0.1),
        meanFossils: Number(mean(outcomes.map((row) => row.fossils)).toFixed(2)),
        meanCommands: Number(mean(outcomes.map((row) => row.commands)).toFixed(1)),
        meanWalkingSeconds: Number(mean(outcomes.map((row) => row.walkingSeconds)).toFixed(1)),
        meanFloorWeight: Number(mean(outcomes.map((row) => row.floorWeight)).toFixed(1)) });
    }
    report.income = rows;
    console.log('BALANCE_INCOME ' + JSON.stringify(rows));
    const get = (site: string, upgraded: boolean) => rows.find((row) => row.site === site && row.upgraded === upgraded)!;
    expect(get('scrap-ledge', false).meanScrap).toBeGreaterThan(get('copper-pocket', false).meanScrap);
    expect(get('copper-pocket', true).meanScrap).toBeGreaterThan(get('scrap-ledge', true).meanScrap);
    expect(get('fossil-crack', false).meanFossils).toBeGreaterThan(get('scrap-ledge', false).meanFossils);
    expect(get('discover', false).meanFossils).toBeGreaterThan(0);
    for (const row of rows) expect(row.meanScrap).toBeGreaterThan(0);
  }, 60000);

  it('keeps stable unattended work productive with physical cargo and bounded-wait shipping', () => {
    const rows = ['scrap-ledge', 'copper-pocket', 'fossil-crack'].map((site) => {
      const outcomes = seeds.map((seed) => runIncomeScenario(seed, site, true, 360, true));
      for (const outcome of outcomes) { expect(outcome.scrap).toBeGreaterThan(100); expect(outcome.delivered).toBeGreaterThan(0); }
      return { site, meanScrap: Number(mean(outcomes.map((row) => row.scrap)).toFixed(1)), meanFloorWeight: Number(mean(outcomes.map((row) => row.floorWeight)).toFixed(1)) };
    });
    report.automation = rows;
    console.log('BALANCE_AUTOMATION ' + JSON.stringify(rows));
  }, 60000);

  it('reaches the first physically delivered Core through either exploration or automation first', () => {
    const results = [];
    for (const exploreEarly of [false, true]) for (const seed of progressSeeds) {
      const result = runFirstCoreScenario(seed, exploreEarly);
      results.push({ exploreEarly, ...result });
    }
    report.firstCore = results;
    report.firstCoreSummary = [false, true].map((exploreEarly) => {
      const values = results.filter((row) => row.exploreEarly === exploreEarly && row.coreDelivered !== null).map((row) => row.coreDelivered!);
      return { exploreEarly, completed: values.length, p50Seconds: percentile(values, 0.5), p90Seconds: percentile(values, 0.9), maxSeconds: Math.max(...values) };
    });
    console.log('BALANCE_FIRST_CORE ' + JSON.stringify(results));
    for (const result of results) {
      expect(result.firstGear).not.toBeNull();
      expect(result.firstGear!).toBeLessThan(result.coreDelivered!);
      expect(result.firstQuality).not.toBeNull();
      expect(result.firstDelivery, `first delivery seed ${result.seed}`).not.toBeNull();
      expect(result.firstFossil, `first fossil seed ${result.seed}`).not.toBeNull();
      expect(result.d030, `D030 seed ${result.seed}`).not.toBeNull();
      expect(result.d060, `D060 seed ${result.seed}`).not.toBeNull();
      expect(result.coreDelivered, `Core seed ${result.seed}, ${result.exploreEarly}`).not.toBeNull();
      expect(result.coreDelivered!).toBeLessThan(5400);
      if (result.exploreEarly) expect(result.d030!).toBeLessThan(result.porter!);
      else expect(result.porter!).toBeLessThan(result.d030!);
    }
  }, 120000);
});
