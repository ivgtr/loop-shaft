import { describe, expect, it } from 'vitest';
import { uiTextWidth, wrapUiText } from '../src/render/uiTypography';

describe('display text wrapping', () => {
  it.each(['採掘力 10 → 16、必要スクラップ90', 'Cost: 100 SCRAP and aLongUnbrokenEquipmentName'])('retains all characters in narrow Japanese/English details: %s', value => {
    const lines = wrapUiText(value, 96);
    expect(lines.join('').replaceAll(' ', '')).toBe(value.replaceAll(' ', ''));
    expect(lines.every(line => uiTextWidth(line) <= 96)).toBe(true);
  });

  it('treats Japanese as full width and respects explicit paragraph breaks', () => {
    expect(uiTextWidth('採掘')).toBe(uiTextWidth('MINE'));
    expect(wrapUiText('採掘\n発送', 200)).toEqual(['採掘', '発送']);
  });
});
