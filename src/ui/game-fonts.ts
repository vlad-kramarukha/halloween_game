import './font-faces.css';
import './game-fonts.css';

export const gameTextFont = '"Oswald Variable", sans-serif';

/** Canvas text must be created after the fonts load, otherwise Phaser caches fallback glyphs. */
export async function loadGameFonts(): Promise<void> {
  const results = await Promise.allSettled([
    document.fonts.load('400 14px "Oswald Variable"', 'Игрок ABC 0123456789'),
    document.fonts.load('700 14px "Oswald Variable"', 'Игрок ABC 0123456789'),
    document.fonts.load('400 60px "Rubik Wet Paint"', 'Ночь страшного найма HALLOWEEN HR'),
  ]);
  if (results.some(result => result.status === 'rejected')) console.warn('Some game fonts could not load; using the fallback font.');
}
