export const characterCatalog = [
  { id: 'ghost', name: 'Призрак' },
  { id: 'skeleton', name: 'Скелет' },
  { id: 'vampire', name: 'Вампир' },
  { id: 'zombie', name: 'Зомби' },
  { id: 'mummy', name: 'Мумия' },
  { id: 'werewolf', name: 'Оборотень' },
  { id: 'witch', name: 'Ведьма' },
  { id: 'frankenstein-monster', name: 'Франкенштейн' },
  { id: 'grim-reaper', name: 'Жнец' },
  { id: 'bat', name: 'Летучая мышь' },
  { id: 'black-cat', name: 'Чёрный кот' },
  { id: 'raven', name: 'Ворон' },
  { id: 'spider', name: 'Паук' },
  { id: 'owl', name: 'Сова' },
  { id: 'little-ghost', name: 'Призрачок' },
  { id: 'pumpkin-dragon', name: 'Тыквенный дракон' },
  { id: 'blue-spirit-flame', name: 'Огонёк' },
  { id: 'green-slime', name: 'Слизень' },
  { id: 'scarecrow', name: 'Пугало' },
] as const;
export type CharacterId = (typeof characterCatalog)[number]['id'];
export const characterIds: readonly CharacterId[] = characterCatalog.map(character => character.id);
