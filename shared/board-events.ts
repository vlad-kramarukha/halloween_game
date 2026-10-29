/** Seeded positions of the hidden orange event cells; card texts are drawn separately. */
export const eventsConfig = {
  seed: 20261031,
  hiddenColor: 'rgb(235, 137, 48)',
  occurrencesPerType: 5,
  protectedStartCells: 3,
  protectedFinishCells: 3,
  minOrdinaryBetween: 2,
  types: [
    { id: 'event-1', name: 'Событие 1', color: 'rgb(66, 166, 225)' },
    { id: 'event-2', name: 'Событие 2', color: 'rgb(222, 91, 111)' },
    { id: 'event-3', name: 'Событие 3', color: 'rgb(164, 112, 225)' },
    { id: 'event-4', name: 'Событие 4', color: 'rgb(184, 203, 81)' },
    { id: 'event-5', name: 'Событие 5', color: 'rgb(222, 116, 188)' },
  ],
} as const;

