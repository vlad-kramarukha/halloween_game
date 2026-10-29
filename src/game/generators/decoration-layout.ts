interface Point { readonly x: number; readonly y: number }
interface DecorationType { readonly url: string; readonly textureKey: string; readonly size: number; readonly frame?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }
interface EntranceType extends DecorationType { readonly entrance: Point }
interface Options {
  readonly seed: number;
  readonly scarecrowRoutePosition: number;
  readonly wellRoutePositions: readonly number[];
  readonly cellInterval: number;
  readonly clearance: number;
  readonly distances: readonly number[];
  readonly types: { readonly scarecrow: DecorationType; readonly well: DecorationType; readonly gate: EntranceType; readonly mansion: EntranceType; readonly tree: DecorationType; readonly tombstone: DecorationType; readonly lantern: DecorationType; readonly candle: DecorationType };
}
export interface DecorationPlacement extends Point { type: DecorationType; flip: boolean }

/** Test whole sprite bounds against every tile, including its vertical faces. */
export function createDecorationLayout(cells: readonly Point[], tile: { width: number; height: number; depth: number; elevation?: number }, options: Options): DecorationPlacement[] {
  const placed: DecorationPlacement[] = [];
  let state = options.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const fits = (p: Point, size: number, clearance = options.clearance) => {
    const half = size / 2 + clearance;
    const hitsTile = cells.some(cell => {
      const dx = Math.max(0, Math.abs(p.x - cell.x) - half);
      const dy = Math.max(0, Math.abs(p.y - cell.y - (tile.depth - (tile.elevation ?? 0)) / 2) - half);
      return dx / (tile.width / 2) + dy / (tile.height / 2 + (tile.depth + (tile.elevation ?? 0)) / 2) <= 1;
    });
    return !hitsTile && !placed.some(other =>
      Math.abs(p.x - other.x) < (size + other.type.size) / 2 + 4 &&
      Math.abs(p.y - other.y) < (size + other.type.size) / 2 + 4);
  };
  // Align the actual threshold in each sprite with the far corner of its tile.
  if (cells.length >= 2) {
    for (const [cell, type] of [
      [cells[0], options.types.gate],
      [cells[cells.length - 1], options.types.mansion],
    ] as const) {
      placed.push({
        x: cell.x - (type.entrance.x - 0.5) * type.size,
        y: cell.y - (tile.elevation ?? 0) - tile.height / 2 - (type.entrance.y - 0.5) * type.size,
        type,
        flip: false,
      });
    }
  }
  for (let i = 3, group = 0; i < cells.length; i += options.cellInterval, group++) {
    const cell = cells[i];
    const type = group % 3 === 0 ? options.types.tree : options.types.tombstone;
    const phase = random() * Math.PI * 2;
    let anchor: Point | undefined;
    for (const distance of options.distances) {
      for (let step = 0; step < 16; step++) {
        const angle = phase + step * Math.PI / 8;
        const p = { x: cell.x + Math.cos(angle) * distance, y: cell.y + Math.sin(angle) * distance };
        if (fits(p, type.size)) { anchor = p; break; }
      }
      if (anchor) break;
    }
    if (!anchor) continue;
    placed.push({ ...anchor, type, flip: group % 2 === 0 });
    const accent = group % 2 === 0 ? options.types.lantern : options.types.candle;
    for (const angle of [0.4, 2.7, 0, Math.PI, -0.5, 3.6]) {
      const distance = (type.size + accent.size) / 2 + 12;
      const p = { x: anchor.x + Math.cos(angle) * distance, y: anchor.y + Math.sin(angle) * distance };
      if (fits(p, accent.size)) {
        placed.push({ ...p, type: accent, flip: false });
        break;
      }
    }
  }
  const extraProps = [
    ...options.wellRoutePositions.map(fraction => ({ fraction, type: options.types.well })),
    { fraction: options.scarecrowRoutePosition, type: options.types.scarecrow },
  ];
  for (const { fraction, type } of extraProps) {
    const cell = cells[Math.min(cells.length - 1, Math.floor(cells.length * fraction))];
    if (!cell) continue;

    let added = false;
    for (const distance of [...options.distances, 270, 310]) {
      for (let step = 0; step < 24; step++) {
        const angle = step * Math.PI / 12;
        const point = { x: cell.x + Math.cos(angle) * distance, y: cell.y + Math.sin(angle) * distance };
        if (fits(point, type.size)) {
          placed.push({ ...point, type, flip: false });
          added = true;
          break;
        }
      }
      if (added) break;
    }
  }
  return placed.sort((a, b) => a.y - b.y);
}







