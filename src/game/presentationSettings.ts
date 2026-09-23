export interface PresentationSettings {
  volume: number;
  motion: boolean;
  highlights: boolean;
}

export const DEFAULT_PRESENTATION: Readonly<PresentationSettings> = { volume: 0.5, motion: true, highlights: true };
const STORAGE_KEY = 'loop-shaft-presentation-v1';

/** Device preferences are deliberately separate from the v6 game save. */
export function loadPresentationSettings(): PresentationSettings {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const defaults = { ...DEFAULT_PRESENTATION, motion: !reduced, highlights: !reduced };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaults;
    const saved = raw as Partial<PresentationSettings>;
    return {
      volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : defaults.volume,
      motion: typeof saved.motion === 'boolean' ? saved.motion : defaults.motion,
      highlights: typeof saved.highlights === 'boolean' ? saved.highlights : defaults.highlights,
    };
  } catch { return defaults; }
}

export function savePresentationSettings(settings: PresentationSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Private/full storage must not stop play. */ }
}
