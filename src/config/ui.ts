import ghostAvatar from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/01_ghost.png';
import skeletonAvatar from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/02_skeleton.png';
import vampireAvatar from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/03_vampire.png';
import witchAvatar from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/07_witch.png';
import werewolfAvatar from '../assets/Halloween_and_Fantasy_Game_Icons/02_Cute_Halloween_Monsters/06_werewolf.png';
import exitIcon from '../assets/Halloween_and_Fantasy_Game_Icons/11_Haunted_Locations_and_Scenery/04_dungeon_door.png';

export interface UIPlayer {
  readonly id: string;
  readonly nickname: string;
  readonly avatarUrl: string | null;
  readonly active?: boolean;
  readonly self?: boolean;
  readonly connected?: boolean;
  readonly color?: string;
}

export const uiConfig = {
  position: { top: 20, left: 20, right: 20 },
  avatarSize: 80,
  selfAvatarSize: 'clamp(130px, 19vh, 200px)',
  playerWidth: 96,
  selfPlayerWidth: 216,
  playerGap: 12,
  exitSize: 56,
  // Preview roster until players are supplied by the server.
  players: [
    { id: 'player-1', nickname: 'Игрок 1', avatarUrl: ghostAvatar },
    { id: 'player-2', nickname: 'Игрок 2', avatarUrl: skeletonAvatar },
    { id: 'player-3', nickname: 'Игрок 3', avatarUrl: vampireAvatar },
    { id: 'player-4', nickname: 'Игрок 4', avatarUrl: witchAvatar },
    { id: 'player-5', nickname: 'Игрок 5', avatarUrl: werewolfAvatar },
  ] satisfies readonly UIPlayer[],
  icons: { exit: exitIcon },
  labels: {
    players: 'Игроки',
    avatar: 'Аватар игрока',
    exit: 'Выйти из игры',
    exitTooltip: 'Выйти из игры',
  },
  colors: {
    background: 'rgb(33, 27, 46)',
    border: 'rgb(76, 62, 94)',
    text: 'rgb(240, 233, 248)',
    muted: 'rgb(164, 150, 181)',
    accent: 'rgb(245, 174, 96)',
    avatarBackground: 'rgb(53, 42, 68)',
  },
} as const;
