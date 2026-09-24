import { describe, expect, it } from 'vitest';
import { detectLocale, getLocaleCatalog, isLocale, loadLocaleCatalogs, t } from '../src/i18n';
import { displayText, formatDisplay, localizeDisplayModel } from '../src/i18n/display';
import { rewardNotice } from '../src/game/rewardFeedback';
import { shipmentNotice } from '../src/game/shipmentFeedback';
import { DEFAULT_PRESENTATION } from '../src/game/presentationSettings';
import { createGameState } from '../src/game/createGame';
import { createManagementState } from '../src/game/management';
import { layoutGameUi } from '../src/render/gameUi';
import { layoutManagementUi } from '../src/render/managementUi';

describe('locale catalog', () => {
  it('matches supported language subtags and defaults to English', () => {
    expect(detectLocale(['fr-FR', 'ja-JP'])).toBe('ja');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['fr-FR'])).toBe('en');
    expect(isLocale('ja')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('keeps translated messages keyed and substitutes values', () => {
    expect(t('ja', 'objective.travel', { depth: 'D-030' })).toBe('リフト · D-030へ移動');
    expect(t('en', 'objective.travel', { depth: 'D-030' })).toBe('LIFT · TRAVEL TO D-030');
  });

  it('loads public locale files as a matching, retryable catalog pair', async () => {
    const requests: string[] = [];
    await loadLocaleCatalogs(async (input) => {
      requests.push(String(input));
      const locale = String(input).endsWith('/ja.json') ? 'ja' : 'en';
      return new Response(JSON.stringify(locale === 'ja'
        ? { ...getLocaleCatalog('ja') } : { ...getLocaleCatalog('en') }), { status: 200 });
    });
    expect(requests).toHaveLength(2);
    expect(t('ja', 'ui.language')).toBe('言語');
    await expect(loadLocaleCatalogs(async () => new Response('', { status: 503 }))).rejects.toThrow('HTTP 503');
    expect(t('ja', 'ui.language')).toBe('言語');
  });

  it('localizes display models without changing game identifiers or actions', () => {
    expect(displayText('ja', 'Copper Pocket')).toBe('銅の鉱脈');
    expect(localizeDisplayModel('ja', { id: 'copper-pocket', name: 'Copper Pocket', action: { type: 'select', id: 'copper-pocket' } }))
      .toEqual({ id: 'copper-pocket', name: '銅の鉱脈', action: { type: 'select', id: 'copper-pocket' } });
  });

  it('translates data-driven readouts and substitutes dynamic values', () => {
    expect(displayText('ja', 'Metal flecks · 3 breaks to extract · stays until mined'))
      .toBe('金属片 · あと3回で採掘 · 採掘するまで残ります');
    expect(formatDisplay('ja', 'readout.trip', { seconds: '4.2', weight: '3.5' }))
      .toBe('往復約4.2秒 · 平均鉱石重量3.5kg');
    expect(displayText('ja', 'Prerequisite: Deep Survey.')).toBe('前提条件: 深層調査。');
    expect(displayText('ja', 'CORE SHELL: 2/4 still in the rock this Run. Other depths have their own finite reserves.'))
      .toBe('コア外殻: この周回では岩の中に2/4残っています。他の階層にも有限の埋蔵量があります。');
    expect(displayText('ja', 'Central Lift now prioritizes research cargo.'))
      .toBe('中央リフトは研究の荷物を優先します。');
    expect(displayText('ja', 'Travel to this floor via Surface. Unload cargo and empty the lift first.'))
      .toBe('この階層へ移動します（地上経由）。先に荷下ろししてリフトを空にしてください。');
    expect(displayText('ja', 'Return to D-001 to open this connection.'))
      .toBe('この接続を開くにはD-001へ戻ってください。');
  });

  it('keeps reward and shipment notices keyed until the active language is drawn', () => {
    const reward = rewardNotice({ id: 1, at: 0, type: 'ORE_QUALITY_FOUND', data: {
      quality: 'PURE', value: 12, depth: 'D-030', nodeId: 'node-1',
    } })!;
    expect(formatDisplay('ja', reward.labelMessage!.key, reward.labelMessage!.values))
      .toBe('純鉱石 · 12スクラップ');
    expect(formatDisplay('ja', reward.detailMessage!.key, reward.detailMessage!.values))
      .toBe('D-030 · 地上へ届けてください');

    const shipment = shipmentNotice({ id: 2, at: 0, type: 'SHIPMENT_APPRAISED', data: { shipmentId: 's1', items: 3 } }, [])!;
    expect(formatDisplay('ja', shipment.detailMessage!.key, shipment.detailMessage!.values)).toBe('3点を納品');
    expect(displayText('ja', 'AUTO SWING WORKING')).toBe('自動採掘が稼働中');
    expect(displayText('ja', 'FIRST AUTOMATIC HIT · 9 DAMAGE')).toBe('初回自動採掘 · ダメージ 9');
  });

  it('fits language buttons in the small settings panel', () => {
    const layout = layoutGameUi(createGameState(), null, true,
      { width: 320, height: 568, world: { x: 0, y: 0, width: 320, height: 180 } },
      { ...DEFAULT_PRESENTATION, locale: 'ja' });
    const choices = layout.buttons.filter((button) => button.id.startsWith('locale-'));
    expect(choices.map((button) => button.label)).toEqual(['言語: 日本語, 選択中', '言語: English']);
    expect(choices.every((button) => button.width >= 44 && button.height === 44 && button.x >= 0 && button.x + button.width <= 320)).toBe(true);
  });

  it('translates facility details before wrapping them for a narrow screen', () => {
    const state = createGameState();
    const management = createManagementState(state, { station: 'facilities', selectedId: 'survey' });
    const layout = layoutManagementUi(state, { ...management, detailsOpen: true },
      { width: 320, height: 568, world: { x: 0, y: 0, width: 320, height: 180 } }, 'ja');
    const detail = layout.pages.flat().join(' ');
    expect(layout.title).toBe('基地施設');
    expect(detail).toContain('鉱脈や発見物、積荷を調査します。');
    expect(detail).not.toContain('Inspect veins, discoveries and cargo.');
  });
});
