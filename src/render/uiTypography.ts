/** DotGothic16 has an 8px Latin / 16px Japanese grid at its native size. */
export const UI_FONT_FAMILY = '"DotGothic16", monospace';
export const UI_FONT_SIZE = 16;
export const UI_LINE_HEIGHT = 20;
export const uiFont = (size = UI_FONT_SIZE): string => `${Math.max(1, Math.round(size / UI_FONT_SIZE)) * UI_FONT_SIZE}px ${UI_FONT_FAMILY}`;

// Conservative advances keep layout deterministic outside the browser as well.
export function uiTextWidth(value: string): number {
  return Array.from(value).reduce((width, character) => width + (/^[\u0020-\u007e\uff61-\uff9f]$/.test(character) ? 8 : 16), 0);
}

export function wrapUiText(value: string, width: number): string[] {
  const output: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const character of paragraph) {
      while (line && uiTextWidth(line + character) > width) {
        const space = line.lastIndexOf(' ');
        if (space > 0) { output.push(line.slice(0, space)); line = line.slice(space + 1); }
        else { output.push(line); line = ''; }
      }
      line += character;
    }
    if (line) output.push(line);
  }
  return output;
}

export async function loadUiFont(): Promise<void> {
  await document.fonts.load(uiFont(), 'LOOP SHAFT 採掘');
  if (!document.fonts.check(uiFont(), 'LOOP SHAFT 採掘')) throw new Error('UI font could not be loaded.');
}
