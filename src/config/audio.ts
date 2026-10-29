import spooky1 from '../sound/Spooky 1.mp3?url';
import spooky2 from '../sound/Spooky 2.mp3?url';
import spooky3 from '../sound/Spooky 3.mp3?url';
import spooky4 from '../sound/Spooky 4.mp3?url';
import spooky5 from '../sound/Spooky 5.mp3?url';
import spooky6 from '../sound/Spooky 6.mp3?url';
import spooky7 from '../sound/Spooky 7.mp3?url';
import spooky8 from '../sound/Spooky 8.mp3?url';
import click from '../sound/CozyChimeUI/click_wood_01.ogg?url';
import confirm from '../sound/CozyChimeUI/confirm_02.ogg?url';
import turn from '../sound/CozyChimeUI/notification_02.ogg?url';
import coin from '../sound/CozyChimeUI/coin_01.ogg?url';
import candy from '../sound/CozyChimeUI/sparkle_01.ogg?url';
import victory from '../sound/CozyChimeUI/levelup_03.ogg?url';
import ghost from '../sound/Magic/cast_01.ogg?url';
import potion from '../sound/Magic/heal_01.ogg?url';
import portal from '../sound/Magic/portal_open_01.ogg?url';
import curse from '../sound/Magic/lightning_bolt_01.ogg?url';
import broom from '../sound/Ranger/arrow_flyby_01.ogg?url';
import step from '../sound/Puzzle/tile_swap_01.ogg?url';
import dice from '../sound/CozyChimeUI/click_wood_01.ogg?url';
import land from '../sound/Casino/reel_stop_01.ogg?url';
import card from '../sound/Casino/card_deal_01.ogg?url';
import defeat from '../sound/DarkAmbience/deep_impact_01.ogg?url';
import select from '../sound/Retro8-bitUI/menu_select_01.ogg?url';
import join from '../sound/Sci-fiHUD/access_granted_01.ogg?url';
import leave from '../sound/Sci-fiHUD/hologram_on_01.ogg?url';
import pause from '../sound/Sci-fiHUD/alarm_01.ogg?url';
import resume from '../sound/Sci-fiHUD/confirm_01.ogg?url';
import start from '../sound/Puzzle/level_complete_01.ogg?url';
import forward from '../sound/Retro8-bitUI/powerup_01.ogg?url';
import backward from '../sound/RetroArcadeAction/hit_01.ogg?url';
import result from '../sound/Casino/win_small_01.ogg?url';
import target from '../sound/Magic/ice_shard_01.ogg?url';
import wrapped from '../sound/Retro8-bitUI/item_pickup_01.ogg?url';
import lollipop from '../sound/Puzzle/star_03.ogg?url';
import chocolate from '../sound/RetroArcadeAction/gem_01.ogg?url';
import apple from '../sound/Puzzle/match_3_01.ogg?url';
import cupcake from '../sound/Puzzle/combo_05.ogg?url';
import stepAlt from '../sound/Sci-fiHUD/click_digital_01.ogg?url';
import scan from '../sound/Sci-fiHUD/scan_sweep_01.ogg?url';
import mystery from '../sound/DarkAmbience/eerie_music_box_01.ogg?url';

export const audioConfig = {
  storageKey: 'halloween-audio',
  musicVolume: .18, effectsVolume: .55,
  pausedMusicFactor: .5, maxVoices: 6, minStepInterval: 125, maxEffectDelay: 350,
  playlist: [spooky1, spooky2, spooky3, spooky4, spooky5, spooky6, spooky7, spooky8],
  effects: {
    click: { url: click, gain: .45 },
    confirm: { url: confirm, gain: .55 },
    turn: { url: turn, gain: .6 },
    coin: { url: coin, gain: .7 },
    candy: { url: candy, gain: .55 },
    victory: { url: victory, gain: .8 },
    ghost: { url: ghost, gain: .35 },
    potion: { url: potion, gain: .45 },
    portal: { url: portal, gain: .45 },
    curse: { url: curse, gain: .22 },
    broom: { url: broom, gain: .45 },
    step: { url: step, gain: .18, variants: [step, stepAlt] },
    dice: { url: dice, gain: .3 },
    land: { url: land, gain: .35 },
    card: { url: card, gain: .65 },
    defeat: { url: defeat, gain: .18 },
    select: { url: select, gain: .23 },
    join: { url: join, gain: .25 },
    leave: { url: leave, gain: .2 },
    pause: { url: pause, gain: .12 },
    resume: { url: resume, gain: .3 },
    start: { url: start, gain: .4 },
    forward: { url: forward, gain: .25 },
    backward: { url: backward, gain: .2 },
    result: { url: result, gain: .35 },
    target: { url: target, gain: .25 },
    wrapped: { url: wrapped, gain: .4 },
    lollipop: { url: lollipop, gain: .4 },
    chocolate: { url: chocolate, gain: .4 },
    apple: { url: apple, gain: .4 },
    cupcake: { url: cupcake, gain: .35 },
    scan: { url: scan, gain: .23 },
    mystery: { url: mystery, gain: .13 },
  },
} as const;
export type SoundEffect = keyof typeof audioConfig.effects;

