import { characterCatalog } from '../../shared/characters';
import avatar0 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/01_ghost.png';
import avatar1 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/02_skeleton.png';
import avatar2 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/03_vampire.png';
import avatar3 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/04_zombie.png';
import avatar4 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/05_mummy.png';
import avatar5 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/06_werewolf.png';
import avatar6 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/07_witch.png';
import avatar7 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/08_frankenstein_monster.png';
import avatar8 from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/09_grim_reaper.png';
import avatar9 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/01_bat.png';
import avatar10 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/02_black_cat.png';
import avatar11 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/03_raven.png';
import avatar12 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/04_spider.png';
import avatar13 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/05_owl.png';
import avatar14 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/06_ghost.png';
import avatar15 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/07_pumpkin_dragon.png';
import avatar16 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/08_blue_spirit_flame.png';
import avatar17 from '../assets/Halloween_and_Fantasy_Game_Icons/03_Chibi_Halloween_Creatures/09_green_slime.png';
import avatar18 from '../assets/Halloween_and_Fantasy_Game_Icons/12_Pumpkins_and_Harvest/08_scarecrow.png';

const urls = {
  'ghost': avatar0,
  'skeleton': avatar1,
  'vampire': avatar2,
  'zombie': avatar3,
  'mummy': avatar4,
  'werewolf': avatar5,
  'witch': avatar6,
  'frankenstein-monster': avatar7,
  'grim-reaper': avatar8,
  'bat': avatar9,
  'black-cat': avatar10,
  'raven': avatar11,
  'spider': avatar12,
  'owl': avatar13,
  'little-ghost': avatar14,
  'pumpkin-dragon': avatar15,
  'blue-spirit-flame': avatar16,
  'green-slime': avatar17,
  'scarecrow': avatar18,
};
export const characters = characterCatalog.map(character => ({ ...character, url: urls[character.id] }));

// Keep existing sessions renderable, but offer only selectable characters on entry.
export const selectableCharacters = characters.filter(character => character.id !== 'little-ghost');
