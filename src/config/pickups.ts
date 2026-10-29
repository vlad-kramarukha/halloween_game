import { pickupPlacement, magicPlacement } from '../../shared/board-pickups';
import broomUrl from '../assets/Halloween_and_Fantasy_Game_Icons/13_Potions_and_Witchcraft/07_broomstick.png';
import potionUrl from '../assets/Halloween_and_Fantasy_Game_Icons/13_Potions_and_Witchcraft/03_moon_potion.png';
import coinUrl from '../assets/Halloween_and_Fantasy_Game_Icons/10_Halloween_Game_Resources/03_pumpkin_coin.png';
import ghostUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/09_ghost_treat.png';
import pumpkinUrl from '../assets/Halloween_PumpkinPatch/Halloween_PumpkinPatch_Bright.png';

export const pickupsConfig = {
  ...pickupPlacement,
  offsetY: -8,
  collection: { popDuration: 90, fadeDuration: 410, lift: 48, popScale: 1.15, endScale: .12, turn: 18, color: 'rgb(255, 176, 82)', highlight: 'rgb(255, 223, 155)' },
  floating: {
    enabled: true,
    lift: 6,
    amplitude: 4,
    minPeriod: 2600,
    maxPeriod: 3400,
    magic: {
      broom: { lift: 10, amplitude: 6, sway: 3, tilt: 8, shimmer: 0 },
      potion: { lift: 7, amplitude: 4, sway: 0, tilt: 4, shimmer: .1 },
    },
  },
  types: [
    { ...pickupPlacement.types[0], textureKey: 'pickup-coin', url: coinUrl, size: 60 },
    { ...pickupPlacement.types[1], textureKey: 'pickup-ghost', url: ghostUrl, size: 60 },
    { ...pickupPlacement.types[2], textureKey: 'pickup-pumpkin', url: pumpkinUrl, size: 64, frameWidth: 128, frameHeight: 128, frame: 0 },
    { ...magicPlacement.types[0], textureKey: 'pickup-broom', url: broomUrl, size: 64 },
    { ...magicPlacement.types[1], textureKey: 'pickup-potion', url: potionUrl, size: 60 },
  ],
} as const;


