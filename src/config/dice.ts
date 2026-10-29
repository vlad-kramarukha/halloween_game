import { gameConfig } from '../../shared/game';
export const diceConfig = {
  position: { left: 20, bottom: 20 },
  width: 192,
  size: 72,
  rollDuration: gameConfig.rollDuration,
  jumpHeight: 26,
  labels: {
    panel: 'Игровой кубик',
    roll: 'Бросить',
    rolling: 'Бросаем…',
    ready: 'Твой бросок',
    result: 'Выпало',
  },
  colors: {
    background: 'rgb(33, 27, 46)',
    border: 'rgb(91, 66, 107)',
    text: 'rgb(240, 233, 248)',
    muted: 'rgb(181, 165, 195)',
    accent: 'rgb(255, 167, 77)',
    face: 'rgb(255, 239, 210)',
    faceShade: 'rgb(233, 197, 149)',
    pip: 'rgb(45, 28, 42)',
  },
} as const;
