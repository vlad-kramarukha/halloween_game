export interface AudioSettings { muted: boolean; music: number; effects: number }
export function audioSettings(value: string | null, defaults: AudioSettings = { muted: false, music: .18, effects: .55 }): AudioSettings {
  try {
    const saved = JSON.parse(value ?? 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    const volume = (number: unknown, fallback: number) => typeof number === 'number' && Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
    return { muted: saved.muted === true, music: volume(saved.music, defaults.music), effects: volume(saved.effects, defaults.effects) };
  } catch { return defaults; }
}