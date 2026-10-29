export interface BoardCell {
  index: number;
  column: number;
  row: number;
}

export interface PathOptions {
  minStraight: number;
  maxStraight: number;
  minTurnSpacing: number;
  maxTurnSpacing: number;
  seed: number;
}

/** Open road with long runs and widely spaced bends, without intersections. */
export function createBoardPath(cellCount: number, options: PathOptions): BoardCell[] {
  if (!Number.isInteger(cellCount) || cellCount < 2) {
    throw new Error('cellCount must be an integer of at least 2');
  }
  for (const [min, max] of [
    [options.minStraight, options.maxStraight],
    [options.minTurnSpacing, options.maxTurnSpacing],
  ]) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 2 || max < min) {
      throw new Error('Path ranges must be integers with 2 <= min <= max');
    }
  }
  let state = options.seed >>> 0;
  const randomInt = (min: number, max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return min + Math.floor(state / 4294967296 * (max - min + 1));
  };
  const cells: BoardCell[] = [{ index: 0, column: 0, row: 0 }];
  let direction = 1;
  const advance = (dx: number, dy: number, length: number) => {
    for (let step = 0; step < length && cells.length < cellCount; step++) {
      const last = cells[cells.length - 1];
      cells.push({ index: cells.length, column: last.column + dx, row: last.row + dy });
    }
  };
  while (cells.length < cellCount) {
    advance(direction, 0, randomInt(options.minStraight, options.maxStraight));
    advance(0, 1, randomInt(options.minTurnSpacing, options.maxTurnSpacing));
    direction *= -1;
  }
  return cells;
}
