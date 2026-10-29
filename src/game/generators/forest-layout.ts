interface Point { readonly x: number; readonly y: number }
interface Prop { readonly textureKey: string; readonly width: number; readonly height: number }
interface Bounds { x: number; y: number; width: number; height: number }
interface Options<T extends Prop> {
  readonly seed: number;
  readonly cellInterval: number;
  readonly clearance: number;
  readonly edgeGrass: { readonly interval: number; readonly width: number; readonly height: number; readonly distances: readonly number[] };
  readonly distances: readonly number[];
  readonly types: { readonly redPlant: T; readonly bamboo: T; readonly orangeMushrooms: T; readonly flatStones: T; readonly dryGrass: T; readonly log: T; readonly stump: T; readonly rock: T; readonly stones: T; readonly mushrooms: T; readonly glow: T; readonly bush: T; readonly grass: T };
}
export interface ForestItem<T extends Prop> extends Point { type: T; flip: boolean }
export interface ForestGroup<T extends Prop> extends Point { items: ForestItem<T>[]; groundWidth?: number; groundHeight?: number }

/** Arrange small botanical compositions without covering the route or existing props. */
export function createForestLayout<T extends Prop>(cells: readonly Point[], tile: {width: number; height: number; depth: number; elevation?: number}, occupied: readonly Bounds[], options: Options<T>): ForestGroup<T>[] {
  const groups: ForestGroup<T>[] = [];
  const reserved = [...occupied];
  let seed = options.seed >>> 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const clear = (box: Bounds) => {
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const halfW = box.width / 2 + options.clearance;
    const halfH = box.height / 2 + options.clearance;
    return !cells.some(cell => {
      const dx = Math.max(0, Math.abs(center.x - cell.x) - halfW);
      const dy = Math.max(0, Math.abs(center.y - cell.y - (tile.depth - (tile.elevation ?? 0)) / 2) - halfH);
      return dx / (tile.width / 2) + dy / (tile.height / 2 + (tile.depth + (tile.elevation ?? 0)) / 2) <= 1;
    }) && !reserved.some(other => box.x < other.x + other.width + 5 && box.x + box.width + 5 > other.x && box.y < other.y + other.height + 5 && box.y + box.height + 5 > other.y);
  };
  const types = options.types;
  const compositions = [
    [{ type: types.log, x: -8, y: 0 }, { type: types.mushrooms, x: 43, y: 14 }, { type: types.grass, x: -49, y: 9 }],
    [{ type: types.rock, x: -14, y: -1 }, { type: types.bush, x: 40, y: 6 }, { type: types.stones, x: -1, y: 22 }],
    [{ type: types.stump, x: -8, y: 0 }, { type: types.glow, x: 41, y: 12 }, { type: types.grass, x: -46, y: 14 }],
    [{ type: types.bamboo, x: -21, y: 0 }, { type: types.flatStones, x: 27, y: 18 }, { type: types.orangeMushrooms, x: 48, y: 5 }, { type: types.grass, x: -46, y: 18 }],
    [{ type: types.redPlant, x: 19, y: 0 }, { type: types.stones, x: -24, y: 12 }, { type: types.orangeMushrooms, x: 48, y: 20 }, { type: types.dryGrass, x: -49, y: 20 }],
    [{ type: types.log, x: -8, y: 0 }, { type: types.glow, x: 46, y: 16 }, { type: types.flatStones, x: -33, y: 24 }, { type: types.dryGrass, x: 9, y: 20 }],
  ];
  for (let index = 5, group = 0; index < cells.length - 4; index += options.cellInterval, group++) {
    const cell = cells[index];
    const composition = compositions[group % compositions.length];
    const phase = random() * Math.PI * 2;
    const direction = group % 2 === 0 ? 1 : -1;
    let found = false;
    for (const distance of options.distances) {
      for (let step = 0; step < 24; step++) {
        const angle = phase + step * Math.PI / 12;
        const x = cell.x + Math.cos(angle) * distance;
        const y = cell.y + Math.sin(angle) * distance;
        const items = composition.map(p => ({ type: p.type, x: x + p.x * direction, y: y + p.y, flip: direction < 0 }));
        const boxes = items.map(p => ({x: p.x - p.type.width / 2, y: p.y - p.type.height, width: p.type.width, height: p.type.height}));
        const ground = { x: x - 80, y: y - 12, width: 160, height: 45 };
        if (!boxes.every(clear) || !clear(ground)) continue;
        groups.push({ x, y, items });
        reserved.push(...boxes, ground);
        found = true;
        break;
      }
      if (found) break;
    }
  }
  // Follow the local route direction. Each verge tuft is checked independently.
  for (let index = 2; index < cells.length - 2; index += options.edgeGrass.interval) {
    const cell = cells[index];
    const previous = cells[index - 1];
    const next = cells[index + 1];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    for (const side of [-1, 1]) {
      const scale = 0.8 + random() * 0.4;
      const variant = random() < 0.28 ? types.dryGrass : types.grass;
      const type = { ...variant, width: options.edgeGrass.width * scale, height: options.edgeGrass.height * scale };
      const jitter = (random() - 0.5) * 22;
      for (const distance of options.edgeGrass.distances) {
        const x = cell.x - dy / length * distance * side + dx / length * jitter;
        const y = cell.y + dx / length * distance * side + dy / length * jitter;
        const box = { x: x - type.width / 2, y: y - type.height, width: type.width, height: type.height };
        if (!clear(box)) continue;
        groups.push({ x, y: y - 9, items: [{ x, y, type, flip: side < 0 }], groundWidth: type.width * 1.2, groundHeight: 9 });
        reserved.push(box);
        break;
      }
    }
  }
  return groups;
}

