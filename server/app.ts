import { installStaticAssets } from './static-assets.js';
import express from 'express';
import { isLocalDevelopment } from './development.js';
import { randomBytes } from 'node:crypto';
import { installPlayerIdentity } from './player-identity.js';
import { installAdmin } from './admin.js';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { GameRoom, type GameRoomOptions } from './GameRoom.js';
import type { ClientEvents, ServerEvents } from '../shared/game.js';

export function createGameServer(options: { adminPassword?: string; development?: boolean; roomOptions?: Omit<GameRoomOptions, 'invitationToken'> } = {}) {
  const adminPassword = options.adminPassword || process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  const httpServer = createServer(app);
  const io = new Server<ClientEvents, ServerEvents>(httpServer, {
    maxHttpBufferSize: 4096,
    allowRequest: (req, done) => {
      const origin = req.headers.origin;
      if (!origin) { done(null, true); return; }
      let allowed = false;
      try {
        const parsed = new URL(origin);
        allowed = (parsed.protocol === 'http:' || parsed.protocol === 'https:')
          && parsed.host === req.headers.host?.toLowerCase();
        allowed ||= options.development === true && isLocalDevelopment(req);
      } catch { /* Invalid origins cannot open a browser connection. */ }
      done(allowed ? null : 'Origin rejected', allowed);
    },
  });
  const rooms = new Map<string, GameRoom>();
  const readIdentity = installPlayerIdentity(app);
  const entryError = (roomId: unknown, invitationToken: unknown, development: boolean): string | null => {
    if (typeof roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return 'Для входа нужна ссылка приглашения от организатора.';
    if (invitationToken !== undefined && (typeof invitationToken !== 'string' || invitationToken.length > 128)) return 'Ссылка приглашения некорректна. Попросите организатора прислать новую.';
    const candidate = rooms.get(roomId);
    if (!development && !invitationToken) return 'Для входа нужна ссылка приглашения от организатора.';
    if (!candidate && invitationToken) return 'Комната по этой ссылке больше не существует. Попросите организатора прислать новую ссылку.';
    if (!development && !candidate?.invitationToken) return 'Комната по этой ссылке больше не существует. Попросите организатора прислать новую ссылку.';
    if (candidate && !candidate.acceptsInvitation(invitationToken)) return 'Ссылка приглашения недействительна. Попросите организатора прислать новую.';
    return null;
  };
  app.get('/api/entry', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const development = options.development === true && isLocalDevelopment(req);
    const error = entryError(req.query.room ?? (development ? 'demo' : undefined), req.query.invite, development);
    res.status(error ? 403 : 200).json(error ? { ok: false, error } : { ok: true });
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  const createRoom = (id: string, invitationToken?: string) => new GameRoom(id, state => io.to(state.roomId).emit('game:state', state), { ...options.roomOptions, invitationToken });
  installAdmin(app, rooms, io, adminPassword, createRoom);
  app.get(['/admin', '/admin/'], (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(resolve('dist/admin.html')));
  installStaticAssets(app);
  app.get('/', (_req, res) => res.sendFile(resolve('dist/index.html')));

  io.on('connection', socket => {
    let room: GameRoom | undefined;
    let lastRequestAt = 0;
    socket.on('game:join', (request, reply) => {
      if (typeof reply !== 'function') return;
      try {
        if (room) throw new Error('Вы уже в комнате.');
        if (!request || typeof request !== 'object' || typeof request.roomId !== 'string'
          || !/^[a-zA-Z0-9_-]{1,32}$/.test(request.roomId)) throw new Error('Некорректное имя комнаты.');
        if (request.token !== undefined && (typeof request.token !== 'string' || request.token.length > 80)) throw new Error('Некорректная сессия.');
        const development = options.development === true && isLocalDevelopment(socket.request);
        const error = entryError(request.roomId, request.invitationToken, development);
        if (error) throw new Error(error);
        let candidate = rooms.get(request.roomId);
        const identity = development
          ? (request.token && rooms.get(request.roomId)?.identityForToken(request.token)) || 'dev:' + socket.id
          : readIdentity(socket.handshake.headers.cookie);
        if (!identity) throw new Error('Не удалось определить игрока. Обновите страницу и разрешите cookie.');
        let joinRequest = request;
        for (const existingRoom of rooms.values()) {
          const member = existingRoom.findIdentity(identity);
          if (!member) continue;
          if (existingRoom.id !== request.roomId) throw new Error('Вы уже участвуете в комнате «' + existingRoom.id + '». Сначала выйдите из неё.');
          if (member.connected) throw new Error('Игра уже открыта в другой вкладке. Продолжите там или сначала выйдите из игры.');
          // A new tab may resume the same offline character, but cannot create another.
          joinRequest = { ...request, token: member.token };
        }
        if (!candidate) {
          if (rooms.size >= 100) throw new Error('Сервер заполнен. Попробуйте позже.');
          candidate = createRoom(request.roomId);
          rooms.set(request.roomId, candidate);
        }
        const joined = candidate.join(socket.id, joinRequest, identity);
        room = candidate;
        void socket.join(room.id);
        reply({ ok: true, ...joined, state: room.snapshot() });
      } catch (error) { reply({ ok: false, error: error instanceof Error ? error.message : 'Не удалось войти.' }); }
    });
    socket.on('game:event', (request, reply) => {
      if (typeof reply !== 'function') return;
      try {
        if (!room || !request || !Number.isSafeInteger(request.eventId) || typeof request.action !== 'string'
          || (request.optionId !== undefined && typeof request.optionId !== 'string')
          || (request.targetPlayerId !== undefined && typeof request.targetPlayerId !== 'string')) throw new Error('Некорректное действие события.');
        room.requestEvent(socket.id, request);
        reply({ ok: true });
      } catch (error) { reply({ ok: false, error: error instanceof Error ? error.message : 'Действие отклонено.' }); }
    });
    socket.on('game:roll', (request, reply) => {
      if (typeof reply !== 'function') return;
      try {
        if (Date.now() - lastRequestAt < 200) throw new Error('Дождитесь ответа сервера.');
        lastRequestAt = Date.now();
        if (!room || !request || !Number.isSafeInteger(request.turnId)) throw new Error('Сначала войдите в игру.');
        room.requestRoll(socket.id, request.turnId);
        reply({ ok: true });
      } catch (error) { reply({ ok: false, error: error instanceof Error ? error.message : 'Бросок отклонён.' }); }
    });
    socket.on('game:leave', reply => {
      if (typeof reply !== 'function') return;
      if (room) {
        const previous = room;
        room = undefined;
        previous.leave(socket.id);
        void socket.leave(previous.id);
      }
      reply({ ok: true });
    });
    socket.on('disconnect', () => room?.disconnect(socket.id));
  });
  const cleanup = setInterval(() => {
    for (const [id, room] of rooms) if (room.prune()) { room.destroy(); rooms.delete(id); }
  }, 10_000);
  cleanup.unref();
  httpServer.on('close', () => { clearInterval(cleanup); rooms.forEach(room => room.destroy()); });
  return { app, httpServer, io, adminPassword };
}

