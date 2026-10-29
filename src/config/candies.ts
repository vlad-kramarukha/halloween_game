import { candyPlacement } from '../../shared/board-pickups';
import wrappedCandyUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/01_wrapped_candy.png';
import lollipopUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/02_swirl_lollipop.png';
import chocolateUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/04_chocolate_bar.png';
import appleUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/05_caramel_apple.png';
import cupcakeUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/06_ghost_cupcake.png';
import cookieUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/07_pumpkin_cookie.png';
import ghostTreatUrl from '../assets/Halloween_and_Fantasy_Game_Icons/07_Halloween_Candy_and_Treats/09_ghost_treat.png';

export const candiesConfig = {
  ...candyPlacement,
  types: [
    { id: 'candy-wrapped', textureKey: 'candy-wrapped', url: wrappedCandyUrl, size: 58 },
    { id: 'candy-lollipop', textureKey: 'candy-lollipop', url: lollipopUrl, size: 58 },
    { id: 'candy-chocolate', textureKey: 'candy-chocolate', url: chocolateUrl, size: 58 },
    { id: 'candy-apple', textureKey: 'candy-apple', url: appleUrl, size: 58 },
    { id: 'candy-cupcake', textureKey: 'candy-cupcake', url: cupcakeUrl, size: 58 },
    { id: 'candy-cookie', textureKey: 'candy-cookie', url: cookieUrl, size: 58 },
    { id: 'candy-ghost', textureKey: 'candy-ghost', url: ghostTreatUrl, size: 58 },
  ],
} as const;
