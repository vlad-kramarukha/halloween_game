interface EventType { readonly id: string }

interface EventPlacementOptions<T extends EventType> {
  readonly seed: number;
  readonly occurrencesPerType: number;
  readonly protectedStartCells: number;
  readonly protectedFinishCells: number;
  readonly minOrdinaryBetween: number;
  readonly types: readonly T[];
}

/** Equal type counts and one of each type in every route section, with seeded jitter. */
export function createEventLayout<T extends EventType>(cellCount: number, options: EventPlacementOptions<T>): Map<number, T> {
  const integers = [cellCount, options.occurrencesPerType, options.protectedStartCells,
    options.protectedFinishCells, options.minOrdinaryBetween];
  if (integers.some(value => !Number.isInteger(value) || value < 0) || cellCount < 2) {
    throw new Error('Event layout requires non-negative integer settings and at least two cells');
  }
  if (new Set(options.types.map(type => type.id)).size !== options.types.length) {
    throw new Error('Event IDs must be unique');
  }
  const result = new Map<number, T>();
  if (!options.types.length) return result;
  const start = Math.max(1, options.protectedStartCells);
  const end = cellCount - Math.max(1, options.protectedFinishCells);
  const available = Math.max(0, end - start);
  const slotMinimum = options.minOrdinaryBetween + 1;
  // Small boards use fewer complete sets rather than favoring a particular event type.
  const rounds = Math.min(options.occurrencesPerType, Math.floor(available / (options.types.length * slotMinimum)));
  if (!rounds) return result;
  const slotCount = rounds * options.types.length;
  const leftMargin = Math.floor(options.minOrdinaryBetween / 2);
  const rightMargin = options.minOrdinaryBetween - leftMargin;
  let state = options.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let round = 0; round < rounds; round++) {
    const types = [...options.types];
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    for (let i = 0; i < types.length; i++) {
      const slot = round * types.length + i;
      const first = start + Math.floor(slot * available / slotCount) + leftMargin;
      const last = start + Math.floor((slot + 1) * available / slotCount) - 1 - rightMargin;
      const index = first + Math.floor(random() * (last - first + 1));
      result.set(index, types[i]);
    }
  }
  return result;
}
