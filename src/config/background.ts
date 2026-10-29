import backgroundUrl from '../assets/backgrounds/haunted-void.png';
/** Minimum background size and extra space around the map, in board-local units. */
export const backgroundConfig = {
  image: { textureKey: 'haunted-void', url: backgroundUrl },
stars: {
    count: 120,
    seed: 'quiet-space',
    color: 'rgb(255, 255, 255)',
    minRadius: 2,
    maxRadius: 7,
    minOpacity: 0.12,
    maxOpacity: 0.85,
    minDuration: 1800,
    maxDuration: 4200,
  },

  padding: 360,
  y: -550,
  width: 3400,
  height: 3400 * 9 / 16,
} as const;

