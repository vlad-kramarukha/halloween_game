import { portalPlacement } from '../../shared/board-portals';
import scarecrowUrl from '../assets/Halloween_PumpkinPatch/Halloween_PumpkinPatch_Bright.png';
import wellUrl from '../assets/Halloween_and_Fantasy_Game_Icons/11_Haunted_Locations_and_Scenery/09_haunted_well.png';
import portalUrl from '../assets/Halloween_and_Fantasy_Game_Icons/11_Haunted_Locations_and_Scenery/06_magic_portal.png';
import gateUrl from '../assets/Halloween_and_Fantasy_Game_Icons/01_Graveyard_Props/09_cemetery_gate.png';
import mansionUrl from '../assets/Halloween_and_Fantasy_Game_Icons/11_Haunted_Locations_and_Scenery/01_haunted_mansion.png';
import treeUrl from '../assets/Halloween_and_Fantasy_Game_Icons/01_Graveyard_Props/08_dead_tree.png';
import tombstoneUrl from '../assets/Halloween_and_Fantasy_Game_Icons/01_Graveyard_Props/01_tombstone.png';
import lanternUrl from '../assets/Halloween_and_Fantasy_Game_Icons/01_Graveyard_Props/06_lantern.png';
import candleUrl from '../assets/Halloween_and_Fantasy_Game_Icons/01_Graveyard_Props/05_candle.png';

export const decorationsConfig = {
  enabled: true,
  seed: 20261034,
  cellInterval: 8,
  wellRoutePositions: [0.25, 0.75],
  scarecrowRoutePosition: 0.08,
  portal: { ...portalPlacement, offsetY: 8 },
  clearance: 14,
  ground: {
    enabled: true,
    widthScale: 1.2,
    heightScale: 0.32,
    baseOffsetY: 0.36,
    soil: 'rgb(48, 39, 51)',
    edge: 'rgb(32, 27, 38)',
    stone: 'rgb(83, 72, 91)',
    moss: 'rgb(64, 68, 55)',
    shadow: 'rgb(9, 7, 15)',
  },
  lights: {
    enabled: true,
    textureSize: 128,
    color: 'rgb(255, 145, 46)',
    opacity: 0.65,
    flickerAmount: 0.16,
    updatesPerSecond: 20,
    lantern: { diameter: 104, offsetY: 0.1 },
    candle: { diameter: 72, offsetY: -0.24 },
  },

  distances: [100, 135, 175, 220],
  tint: 'rgb(211, 201, 223)',
  types: {
    scarecrow: { textureKey: 'decor-scarecrow', url: scarecrowUrl, size: 180, frame: { x: 512, y: 0, width: 256, height: 448 } },
    well: { textureKey: 'decor-well', url: wellUrl, size: 140 },
    portal: { textureKey: 'decor-portal', url: portalUrl, size: 110 },
    gate: { textureKey: 'decor-gate', url: gateUrl, size: 220, entrance: { x: 0.5, y: 0.82 } },
    mansion: { textureKey: 'decor-mansion', url: mansionUrl, size: 280, entrance: { x: 0.5, y: 0.80 } },
    tree: { textureKey: 'decor-tree', url: treeUrl, size: 154 },
    tombstone: { textureKey: 'decor-tombstone', url: tombstoneUrl, size: 92 },
    lantern: { textureKey: 'decor-lantern', url: lanternUrl, size: 50 },
    candle: { textureKey: 'decor-candle', url: candleUrl, size: 38 },
  },
} as const;









