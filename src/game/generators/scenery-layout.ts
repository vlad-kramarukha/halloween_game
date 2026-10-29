export interface SceneryBounds { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }
export interface SceneryProp {
  textureKey: string; url: string; width: number; height: number;
  frame: { x: number; y: number; width: number; height: number };
  glow?: string;
}
export interface SceneryItem<T extends SceneryProp> extends Point { type: T; flip: boolean }
export interface SceneryGroup<T extends SceneryProp> {
  items: SceneryItem<T>[];
  ground: SceneryBounds;
}
interface Options<T extends SceneryProp> {
  seed: number; detailInterval: number; landmarkCount: number; clearance: number;
  distances: readonly number[]; types: Record<string, T>;
}

/** Seeded small scenes, reserving both sprite silhouettes and their shared patch of soil. */
export function createSceneryLayout<T extends SceneryProp>(
  cells: readonly Point[], tile: { width: number; height: number; depth: number; elevation?: number },
  occupied: readonly SceneryBounds[], options: Options<T>,
): { groups: SceneryGroup<T>[]; bounds: SceneryBounds[] } {
  const groups: SceneryGroup<T>[] = [];
  const reserved = [...occupied];
  const bounds: SceneryBounds[] = [];
  const types = options.types;
  let seed = options.seed >>> 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const prop = (name: string, x: number, y: number) => ({ type: types[name], x, y });
  const landmarks = [
    [prop('witchHouse', -32, -9), prop('cauldron', 61, 10), prop('potionGreen', 96, 16), prop('broom', -104, 10), prop('book', 36, 39)],
    [prop('crypt', -22, -12), prop('coffin', 73, 10), prop('skull', 45, 31), prop('bones', -39, 29), prop('sign', -108, 5)],
    [prop('hay', -40, 0), prop('pumpkinPatch', 50, 17), prop('leafyPumpkin', -86, 25), prop('pumpkinStack', 2, 35), prop('carvedPumpkin', 94, 31)],
    [prop('shop', -24, -12), prop('chest', 65, 17), prop('candyBucket', 27, 38), prop('carvedPumpkin', -74, 28)],
    [prop('dungeon', -23, -8), prop('purpleCrystals', 57, 17), prop('redCrystals', -94, 17), prop('skull', 24, 35)],
    [prop('witchHouse', -32, -10), prop('crystalBall', 61, 5), prop('cauldron', 94, 35), prop('potionPurple', 37, 29), prop('broom', -100, 8)],
    [prop('rockWide', -18, 10), prop('purpleCrystals', 45, 6), prop('redCrystals', -73, 22), prop('glowBlue', 77, 31), prop('book', 12, 37)],
    [prop('crypt', -27, -13), prop('coffin', 72, 17), prop('sign', -103, 15), prop('skull', 32, 37)],
  ];
  const details = [
    [prop('coffin', -18, 0), prop('skull', 26, 12), prop('bones', -32, 23)],
    [prop('cauldron', 0, 0), prop('potionGreen', 34, 12), prop('potionPurple', -35, 8), prop('book', 9, 26)],
    [prop('tallStump', -12, 0), prop('mushroomTeal', 37, 17), prop('redFern', -49, 12)],
    [prop('hay', -12, 0), prop('pumpkin', -53, 20), prop('carvedPumpkin', 37, 23)],
    [prop('purpleCrystals', -9, 0), prop('redCrystals', 35, 19), prop('glowBlue', -44, 14)],
    [prop('wideStump', -15, 4), prop('mushroomBlue', 41, 19), prop('tealPlant', -47, 23)],
    [prop('sign', -16, 0), prop('pumpkinStack', 25, 17), prop('bushLow', -39, 29)],
    [prop('rockWide', -12, 0), prop('redFern', 42, 7), prop('mushroomTeal', -47, 21)],
    [prop('pumpkinPatch', -18, 0), prop('leafyPumpkin', 40, 19), prop('carvedPumpkin', -55, 18)],
    [prop('crystalBall', -15, 0), prop('book', 25, 14), prop('potionPurple', -39, 15)],
    [prop('bushLow', -24, 9), prop('tealPlant', 28, 9), prop('glowBlue', 0, 30)],
    [prop('chest', -18, 0), prop('candyBucket', 26, 18), prop('pumpkin', -48, 23)],
  ];
  const hitsTile = (box: SceneryBounds) => cells.some(cell => {
    const dx = Math.max(0, Math.abs(box.x + box.width / 2 - cell.x) - box.width / 2 - options.clearance);
    const dy = Math.max(0, Math.abs(box.y + box.height / 2 - cell.y - (tile.depth - (tile.elevation ?? 0)) / 2) - box.height / 2 - options.clearance);
    return dx / (tile.width / 2) + dy / ((tile.height + tile.depth + (tile.elevation ?? 0)) / 2) <= 1;
  });
  const clear = (box: SceneryBounds) => !hitsTile(box) && !reserved.some(other =>
    box.x < other.x + other.width + 5 && box.x + box.width + 5 > other.x
    && box.y < other.y + other.height + 5 && box.y + box.height + 5 > other.y);

  const place = (index: number, template: typeof details[number], order: number) => {
    const cell = cells[index];
    if (!cell) return;
    const direction = order % 2 ? -1 : 1;
    const phase = random() * Math.PI * 2;
    for (const distance of options.distances) {
      for (let step = 0; step < 32; step++) {
        const angle = phase + step * Math.PI / 16;
        const x = cell.x + Math.cos(angle) * distance;
        const y = cell.y + Math.sin(angle) * distance;
        const items = template.map(item => ({ type: item.type, x: x + item.x * direction, y: y + item.y, flip: false }));
        const boxes = items.map(item => ({ x: item.x - item.type.width / 2, y: item.y - item.type.height, width: item.type.width, height: item.type.height }));
        const left = Math.min(...boxes.map(box => box.x)) - 8;
        const right = Math.max(...boxes.map(box => box.x + box.width)) + 8;
        const feet = items.map(item => item.y);
        const ground = { x: left, y: Math.min(...feet) - 12, width: right - left, height: Math.max(...feet) - Math.min(...feet) + 27 };
        if (!boxes.every(clear) || !clear(ground)) continue;
        groups.push({ items, ground });
        reserved.push(...boxes, ground);
        bounds.push(...boxes, ground);
        return;
      }
    }
  };
  // Place distinct landmarks first so filler plants never displace them.
  const selectedLandmarks = landmarks.slice(0, options.landmarkCount);
  selectedLandmarks.forEach((template, index) => place(Math.floor((index + 1) * cells.length / (selectedLandmarks.length + 1)), template, index));
  for (let index = 4, group = 0; index < cells.length - 4; index += options.detailInterval, group++) {
    place(index, details[group % details.length], group);
  }
  return { groups, bounds };
}
