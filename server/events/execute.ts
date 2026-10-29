import { gameConfig } from '../../shared/game.js';
import type { EventCommand, EventParticipant } from './types.js';

export interface ExecutionContext { dice?: readonly number[]; targetPlayerId?: string | null }
export const emptyEffects = () => ({ nextRollModifier: 0, nextRollTwice: false, skipTurns: 0 });

/** One executor for all cards. Updates authoritative player references and describes actual effects. */
export function executeEventActions(commands: readonly EventCommand[], players: EventParticipant[], actorId: string, die = 0, context: ExecutionContext = {}): string[] {
  const messages: string[] = [];
  const actor = players.find(p => p.player.id === actorId);
  if (!actor) return messages;
  const positions = players.map(p => p.player.position);
  const leader = Math.max(...positions);
  const behind = positions.filter(position => position < actor.player.position);
  const nearestBehind = behind.length ? Math.max(...behind) : null;
  const setPosition = (participant: EventParticipant, position: number) => {
    const previous = participant.player.position;
    participant.player.position = Math.max(0, Math.min(gameConfig.cellCount - 1, position));
    const delta = participant.player.position - previous;
    const count = Math.abs(delta);
    const word = count % 10 === 1 && count % 100 !== 11 ? 'клетку'
      : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'клетки' : 'клеток';
    messages.push(participant.player.nickname + ': ' + (delta
      ? 'на ' + count + ' ' + word + (delta > 0 ? ' вперёд' : ' назад') + '. Клетка ' + (participant.player.position + 1)
      : 'остаётся на клетке ' + (participant.player.position + 1)) + '.');
  };
  for (const command of commands) {
    const targets = players.filter(p => command.target === 'self' ? p === actor
      : command.target === 'others' ? p !== actor
      : command.target === 'ahead' ? p.player.position > actor.player.position
      : p.player.id === context.targetPlayerId);
    if (!targets.length && command.target === 'ahead') messages.push('Впереди тебя никого нет. Все остаются на месте.');
    for (const target of targets) {
      switch (command.type) {
        case 'move': setPosition(target, target.player.position + (typeof command.steps === 'number' ? command.steps : (command.steps.sum ? (context.dice ?? [die]).reduce((sum, value) => sum + value, 0) : die) * command.steps.factor)); break;
        case 'leader': setPosition(target, leader); break;
        case 'nearest-behind':
          if (actor.player.position < leader) messages.push(target.player.nickname + ': впереди есть другой игрок. Остаёшься на месте.');
          else if (nearestBehind !== null) setPosition(target, nearestBehind);
          else messages.push(target.player.nickname + ': позади никого нет. Остаёшься на месте.');
          break;
        case 'modifier':
          target.effects.nextRollModifier += command.amount;
          messages.push(target.player.nickname + ': следующий бросок ' + (target.effects.nextRollModifier >= 0 ? '+' : '') + target.effects.nextRollModifier + '.'); break;
        case 'double-roll':
          target.effects.nextRollTwice = true;
          messages.push(target.player.nickname + ': в следующем ходу два броска, движение на их сумму.'); break;
        case 'skip':
          target.effects.skipTurns += command.turns;
          messages.push(target.player.nickname + ': пропуск следующего хода.'); break;
      }
    }
  }
  return messages;
}
export interface EventResolution {
  updates: { playerId: string; position: number; effects: import('../../shared/game.js').PlayerEffects }[];
  messages: string[];
}

/** Resolve against copies. The live room is unchanged until the player confirms. */
export function planEventActions(commands: readonly EventCommand[], players: EventParticipant[], actorId: string, die = 0, context: ExecutionContext = {}): EventResolution {
  const copies = players.map(({ player, effects }) => ({ player: { ...player }, effects: { ...effects } }));
  const messages = executeEventActions(commands, copies, actorId, die, context);
  return {
    messages,
    updates: copies.filter((copy, index) => copy.player.position !== players[index].player.position
      || JSON.stringify(copy.effects) !== JSON.stringify(players[index].effects))
      .map(copy => ({ playerId: copy.player.id, position: copy.player.position, effects: { ...copy.effects } })),
  };
}