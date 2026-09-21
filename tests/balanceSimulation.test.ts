import { describe, expect, it } from 'vitest';
import { mean, percentile, runFirstCoreScenario, runIncomeScenario } from './fixtures/balanceScenario';

const seeds = Array.from({ length: 12 }, (_, n) => 1001 + n * 7919);

describe('reproducible balance probes (scripted, not human play time)', () => {
  it('changes the useful income site after investment without requiring a forced rotation', () => {
    const rows = [];
    for (const upgraded of [false, true]) for (const site of ['scrap-ledge', 'copper-pocket', 'fossil-crack', 'discover']) {
      const outcomes = seeds.map((seed) => runIncomeScenario(seed, site, upgraded));
      rows.push({ upgraded, site, seconds: 360, seeds: seeds.length,
        meanScrap: Number(mean(outcomes.map((row) => row.scrap)).toFixed(1)),
        p10Scrap: percentile(outcomes.map((row) => row.scrap), 0.1),
        meanFossils: Number(mean(outcomes.map((row) => row.fossils)).toFixed(2)),
        meanCommands: Number(mean(outcomes.map((row) => row.commands)).toFixed(1)),
        meanWalkingSeconds: Number(mean(outcomes.map((row) => row.walkingSeconds)).toFixed(1)),
        meanFloorWeight: Number(mean(outcomes.map((row) => row.floorWeight)).toFixed(1)) });
    }
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
    console.log('BALANCE_AUTOMATION ' + JSON.stringify(rows));
  }, 60000);

  it('reaches the first physically delivered Core through either exploration or automation first', () => {
    const results = [];
    for (const exploreEarly of [false, true]) for (const seed of seeds.slice(0, 6)) {
      const result = runFirstCoreScenario(seed, exploreEarly);
      results.push({ exploreEarly, ...result });
    }
    console.log('BALANCE_FIRST_CORE ' + JSON.stringify(results));
    for (const result of results) {
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
