import redPlantUrl from '../assets/Free Forest Props/Plant 3/Red.png';
import bambooUrl from '../assets/Free Forest Props/Bamboo plant/Purple teal.png';
import orangeMushroomsUrl from '../assets/Free Forest Props/Double mushroom/Double orange.png';
import flatStonesUrl from '../assets/Free Forest Props/Rocks/ISO rocks 6.png';
import dryGrassUrl from '../assets/Free Forest Props/Grass 2/G2 yellow.png';
import logUrl from '../assets/Free Forest Props/Stumps/Hollow_Stump.png';
import stumpUrl from '../assets/Free Forest Props/Stumps/Stump1.png';
import rockUrl from '../assets/Free Forest Props/Rocks/ISO_Rock.png';
import stonesUrl from '../assets/Free Forest Props/Rocks/ISO_Rocks_3.png';
import mushroomsUrl from '../assets/Free Forest Props/Shrooms & grass/Purple.png';
import glowUrl from '../assets/Free Forest Props/Glow shroom/Purple.png';
import bushUrl from '../assets/Free Forest Props/Bush 1/Orange.png';
import grassUrl from '../assets/Free Forest Props/Grass 3/G3 teal.png';

export const forestConfig = {
  enabled: true,
  seed: 20261035,
  cellInterval: 4,
  edgeGrass: { interval: 1, width: 24, height: 23, distances: [62, 78, 94] },
  clearance: 10,
  distances: [100, 140, 180, 230, 280, 340],
  tint: 'rgb(218, 205, 230)',
  soil: 'rgb(43, 35, 47)',
  shadow: 'rgb(10, 8, 17)',
  types: {
    redPlant: { textureKey: 'forest-red-plant', url: redPlantUrl, width: 46, height: 59, frame: { x: 280, y: 65, width: 580, height: 740 } },
    bamboo: { textureKey: 'forest-bamboo', url: bambooUrl, width: 60, height: 60, frame: { x: 75, y: 75, width: 940, height: 940 } },
    orangeMushrooms: { textureKey: 'forest-orange-mushrooms', url: orangeMushroomsUrl, width: 32, height: 45, frame: { x: 170, y: 35, width: 680, height: 955 } },
    flatStones: { textureKey: 'forest-flat-stones', url: flatStonesUrl, width: 55, height: 45, frame: { x: 240, y: 280, width: 560, height: 470 } },
    dryGrass: { textureKey: 'forest-dry-grass', url: dryGrassUrl, width: 32, height: 32, frame: { x: 0, y: 0, width: 1024, height: 1024 } },
    log: { textureKey: 'forest-log', url: logUrl, width: 104, height: 75, frame: { x: 140, y: 245, width: 750, height: 540 } },
    stump: { textureKey: 'forest-stump', url: stumpUrl, width: 82, height: 64, frame: { x: 90, y: 185, width: 850, height: 660 } },
    rock: { textureKey: 'forest-rock', url: rockUrl, width: 74, height: 72, frame: { x: 220, y: 235, width: 580, height: 560 } },
    stones: { textureKey: 'forest-stones', url: stonesUrl, width: 55, height: 36, frame: { x: 135, y: 270, width: 760, height: 500 } },
    mushrooms: { textureKey: 'forest-mushrooms', url: mushroomsUrl, width: 38, height: 42, frame: { x: 64, y: 10, width: 900, height: 1000 } },
    glow: { textureKey: 'forest-glow-mushroom', url: glowUrl, width: 36, height: 50, frame: { x: 180, y: 30, width: 670, height: 930 } },
    bush: { textureKey: 'forest-bush', url: bushUrl, width: 62, height: 57, frame: { x: 65, y: 75, width: 900, height: 820 } },
    grass: { textureKey: 'forest-grass', url: grassUrl, width: 32, height: 31, frame: { x: 190, y: 190, width: 670, height: 650 } },
  },
} as const;

