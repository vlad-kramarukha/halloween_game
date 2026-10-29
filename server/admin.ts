import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import type { Express, Request } from 'express';
import type { Server } from 'socket.io';
import type { ClientEvents, ServerEvents } from '../shared/game.js';
import { gameConfig } from '../shared/game.js';
import { GameRoom } from './GameRoom.js';

const lifetime = 8 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest();

export function installAdmin(app: Express, rooms: Map<string, GameRoom>, io: Server<ClientEvents, ServerEvents>, password: string, createRoom: (id: string, invitationToken?: string) => GameRoom) {
  const router = express.Router();
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { count: number; until: number }>();
  const tokenFor = (req: Request) => req.headers.cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith('hr_admin='))?.slice('hr_admin='.length);
  const cookie = (req: Request, value: string, seconds: number) =>
    `hr_admin=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${seconds}${req.secure ? '; Secure' : ''}`;
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // JSON plus a custom header prevents cross-site form submissions to privileged actions.
  router.use((req, res, next) => {
    if (req.method !== 'GET' && (req.get('X-Admin-Request') !== '1' || !req.is('application/json'))) {
      res.status(403).json({ error: 'Запрос отклонён.' }); return;
    }
    next();
  });
  router.use(express.json({ limit: '2kb' }));
  router.post('/login', (req, res) => {
    const now = Date.now();
    for (const [key, attempt] of attempts) if (attempt.until <= now) attempts.delete(key);
    for (const [key, expires] of sessions) if (expires <= now) sessions.delete(key);
    const ip = req.ip ?? 'unknown';
    const attempt = attempts.get(ip) ?? { count: 0, until: now + 5 * 60_000 };
    if (attempt.count >= 10 || attempts.size >= 1000 || sessions.size >= 1000) {
      res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' }); return;
    }
    attempt.count++; attempts.set(ip, attempt);
    if (typeof req.body?.password !== 'string' || !timingSafeEqual(digest(req.body.password), digest(password))) {
      res.status(401).json({ error: 'Неверный пароль.' }); return;
    }
    attempts.delete(ip);
    const previous = tokenFor(req);
    if (previous) sessions.delete(previous);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, now + lifetime);
    res.setHeader('Set-Cookie', cookie(req, token, lifetime / 1000));
    res.json({ ok: true });
  });
  router.use((req, res, next) => {
    const token = tokenFor(req);
    if (!token || (sessions.get(token) ?? 0) <= Date.now()) {
      if (token) sessions.delete(token);
      res.status(401).json({ error: 'Войдите в админку.' }); return;
    }
    next();
  });
  router.post('/logout', (req, res) => {
    sessions.delete(tokenFor(req)!);
    res.setHeader('Set-Cookie', cookie(req, '', 0)); res.json({ ok: true });
  });
  router.post('/rooms', (req, res) => {
    if (rooms.size >= 100) { res.status(400).json({ error: 'Достигнут лимит в 100 комнат.' }); return; }
    const supplied = req.body?.roomId;
    if (supplied !== undefined && (typeof supplied !== 'string' || (supplied.trim() && !/^[a-zA-Z0-9_-]{1,32}$/.test(supplied.trim())))) {
      res.status(400).json({ error: 'Название: до 32 латинских букв, цифр, дефисов или подчёркиваний.' }); return;
    }
    const roomId = supplied?.trim() || 'room-' + randomBytes(6).toString('hex');
    if (rooms.has(roomId)) { res.status(409).json({ error: 'Комната с таким названием уже существует.' }); return; }
    const invitationToken = randomBytes(24).toString('base64url');
    const room = createRoom(roomId, invitationToken);
    rooms.set(roomId, room);
    res.status(201).json({ roomId, invitationToken });
  });
  router.get('/rooms', (_req, res) => {
    res.json({ cellCount: gameConfig.cellCount, maxPlayers: gameConfig.maxPlayers,
      rooms: [...rooms.values()].map(room => {
        const state = room.snapshot();
        return { ...state, invitationToken: room.invitationToken, onlineCount: state.players.filter(player => player.connected).length, playerCount: state.players.length };
      }) });
  });
  router.post('/rooms/:roomId/:action', (req, res) => {
    const room = rooms.get(String(req.params.roomId));
    if (!room) { res.status(404).json({ error: 'Комната не найдена.' }); return; }
    try {
      switch (req.params.action) {
        case 'start': room.start(); break;
        case 'pause': room.pause(); break;
        case 'resume': room.resume(); break;
        case 'reset': room.reset(); break;
        case 'move': room.movePlayer(req.body?.playerId, req.body?.cell); break;
        case 'kick': {
          const socketId = room.kickPlayer(req.body?.playerId);
          if (socketId) {
            const socket = io.sockets.sockets.get(socketId);
            socket?.emit('game:kicked', { message: 'Администратор исключил вас из комнаты.' });
            socket?.disconnect(true);
          }
          break;
        }
        default: res.status(404).json({ error: 'Действие не найдено.' }); return;
      }
      res.json({ ok: true, state: room.snapshot() });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Действие не выполнено.' });
    }
  });
  router.use((error: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: 'Некорректный запрос.' });
  });
  app.use('/api/admin', router);
}
