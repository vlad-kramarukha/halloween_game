

export const pickupPlacement = {
  seed: 20261032, protectedStartCells: 3, protectedFinishCells: 3,
  types: [{ id: 'coin', count: 6 }, { id: 'ghost', count: 6 }, { id: 'pumpkin', count: 6 }],
} as const;
export const candyPlacement = {
  seed: 20261033, count: 12, protectedStartCells: 3, protectedFinishCells: 3,
  types: [{ id: 'candy-wrapped' }, { id: 'candy-lollipop' }, { id: 'candy-chocolate' }, { id: 'candy-apple' },
    { id: 'candy-cupcake' }, { id: 'candy-cookie' }, { id: 'candy-ghost' }],
} as const;
export const magicPlacement = {
  seed: 20261042, protectedStartCells: 3, protectedFinishCells: 3,
  types: [{ id: 'broom', count: 2 }, { id: 'potion', count: 3 }],
} as const;
export type PickupId = typeof pickupPlacement.types[number]['id'] | typeof candyPlacement.types[number]['id'] | typeof magicPlacement.types[number]['id'];
export type ObjectKind = 'ghost' | 'coin' | 'pumpkin' | 'candy' | 'broom' | 'potion';

export function objectKind(id: PickupId): ObjectKind {
  if (id === 'candy-ghost') return 'ghost'; // The same beige ghost sprite always has the same mechanic.
  return id.startsWith('candy-') ? 'candy' : id as ObjectKind;
}

/** Six-player pacing: five ordinary pickups per leg, with rare group effects. */
export const pickupBalance = {
  players: 6,
  seed: 20261043,
  protectedStartCells: 6,
  protectedFinishCells: 6,
  broomSections: [2, 3],
  potionSections: [1, 4, 5],
} as const;

/** Joint placement keeps rewards and penalties balanced instead of layering independent layouts. */
export function createBoardPickupLayout(cellCount: number, reserved: ReadonlySet<number>): Map<number, PickupId> {
  if (!Number.isInteger(cellCount) || cellCount < 2) throw new Error('Invalid board size');
  const result = new Map<number, PickupId>();
  const start = pickupBalance.protectedStartCells;
  const end = cellCount - pickupBalance.protectedFinishCells;
  let state = pickupBalance.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  // Ghost candy is mechanically a ghost, so keep it out of the extra-roll reward bag.
  const variants = candyPlacement.types.filter(type => objectKind(type.id) === 'candy').map(type => type.id);
  const candies = [...variants, ...variants];
  for (let i = candies.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candies[i], candies[j]] = [candies[j], candies[i]];
  }
  for (let section = 0; section < pickupBalance.players; section++) {
    const first = start + Math.floor(section * (end - start) / pickupBalance.players);
    const last = start + Math.floor((section + 1) * (end - start) / pickupBalance.players);
    const ids: PickupId[] = [candies[section * 2], 'coin', 'ghost', 'pumpkin', candies[section * 2 + 1]];
    // Mirror alternating legs so the sequence is not identical throughout the route.
    if (section % 2) ids.reverse();
    if (pickupBalance.broomSections.some(value => value === section)) ids.splice(2, 0, 'broom');
    if (pickupBalance.potionSections.some(value => value === section)) ids.splice(ids.length - 1, 0, 'potion');
    const available: number[] = [];
    for (let cell = first; cell < last; cell++) if (!reserved.has(cell)) available.push(cell);
    if (available.length < ids.length) throw new Error('Not enough free cells for the balanced pickup layout');
    // Find evenly spaced positions, penalizing adjacent objects and boundary clusters.
    let best: number[] = [];
    let bestScore = Infinity;
    const previous = [...result.keys()].at(-1);
    const choose = (selected: number[], offset: number, score: number) => {
      if (score >= bestScore) return;
      if (selected.length === ids.length) { best = [...selected]; bestScore = score; return; }
      const target = first + (selected.length + .5) * (last - first) / ids.length;
      for (let i = offset; i <= available.length - (ids.length - selected.length); i++) {
        const cell = available[i];
        const before = selected.at(-1) ?? previous;
        const adjacency = before !== undefined && cell - before < 2 ? 1000 : 0;
        selected.push(cell);
        choose(selected, i + 1, score + adjacency + Math.pow(cell - target, 2));
        selected.pop();
      }
    };
    choose([], 0, 0);
    ids.forEach((id, i) => result.set(best[i], id));
  }
  return result;
}