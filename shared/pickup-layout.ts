interface PickupType { readonly id: string }
interface PlacementOptions<T extends PickupType> {
  readonly seed: number;
  readonly countPerType: number;
  readonly protectedStartCells: number;
  readonly protectedFinishCells: number;
  readonly types: readonly T[];
}

/** Each section receives one of each pickup type, avoiding reserved cells. */
export function createPickupLayout<T extends PickupType>(cellCount: number, blocked: ReadonlySet<number>, options: PlacementOptions<T>): Map<number, T> {
  if (![cellCount, options.countPerType, options.protectedStartCells, options.protectedFinishCells]
    .every(n => Number.isInteger(n) && n >= 0) || cellCount < 2) {
    throw new Error('Invalid pickup placement settings');
  }
  if (new Set(options.types.map(type => type.id)).size !== options.types.length) {
    throw new Error('Pickup IDs must be unique');
  }
  const result = new Map<number, T>();
  const start = Math.max(1, options.protectedStartCells);
  const end = cellCount - Math.max(1, options.protectedFinishCells);
  let state = options.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let section = 0; section < options.countPerType; section++) {
    const first = start + Math.floor(section * (end - start) / options.countPerType);
    const last = start + Math.floor((section + 1) * (end - start) / options.countPerType);
    const available: number[] = [];
    for (let index = first; index < last; index++) {
      if (!blocked.has(index)) available.push(index);
    }
    if (available.length < options.types.length) {
      throw new Error('Not enough free cells in a route section for all pickups');
    }
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    options.types.forEach((type, i) => result.set(available[i], type));
  }
  return result;
}

/** One random pickup per route section, with repeatable variant selection. */
export function createRandomPickupLayout<T extends PickupType>(
  cellCount: number,
  blocked: ReadonlySet<number>,
  options: Omit<PlacementOptions<T>, 'countPerType'> & { readonly count: number },
): Map<number, T> {
  if (options.types.length === 0) throw new Error('Random pickup variants cannot be empty');
  const slots = createPickupLayout(cellCount, blocked, {
    ...options,
    countPerType: options.count,
    types: [{ id: 'random-pickup' }],
  });
  let state = (options.seed ^ 0x9e3779b9) >>> 0;
  const result = new Map<number, T>();
  for (const index of slots.keys()) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    result.set(index, options.types[Math.floor(state / 4294967296 * options.types.length)]);
  }
  return result;
}
