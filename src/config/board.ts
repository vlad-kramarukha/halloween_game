import { gameConfig } from '../../shared/game';
/** Board settings. cellCount includes both start and finish. */
export const boardConfig = {
  cellCount: gameConfig.cellCount,
  path: { minStraight: 12, maxStraight: 20, minTurnSpacing: 4, maxTurnSpacing: 6, seed: 31 },
  tile: {
    scale: 2,
    width: 116,
    height: 58,
    depth: 22,
    elevation: 24,
    gap: 6,
    edgeWidth: 1.6,
    edgeOpacity: 0.8,
    highlightWidth: 2,
    highlightOpacity: 0.35,
    baseLightOpacity: 0.4,
  },
  numbering: {
    enabled: true,
    fontSize: 14,
color: 'rgb(240, 233, 248)',
},
  glow: { enabled: true, spread: 44, opacity: 0.16, layers: 14, offsetY: 3 },
  shadow: { offsetX: 5, offsetY: 13, opacity: 0.35 },
  viewport: { x: 90, y: 70, width: 1260, height: 760, maxScale: 1.25 },
  colors: {
    background: 'rgb(0, 0, 0)',
    top: 'rgb(92, 77, 116)',
    topAlternate: 'rgb(105, 89, 132)',
    left: 'rgb(40, 32, 55)',
    right: 'rgb(60, 50, 79)',
    edge: 'rgb(157, 132, 184)',
    highlight: 'rgb(224, 207, 244)',
    endpointEdge: 'rgb(255, 236, 207)',
    start: 'rgb(117, 196, 176)',
    startLeft: 'rgb(49, 92, 86)',
    startRight: 'rgb(68, 126, 112)',
    finish: 'rgb(245, 174, 96)',
    finishLeft: 'rgb(132, 80, 46)',
    finishRight: 'rgb(170, 107, 57)',
    glow: 'rgb(255, 132, 30)',
    shadow: 'rgb(8, 8, 16)',
  },
} as const;







