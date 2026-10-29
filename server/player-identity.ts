import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';

const cookieName = 'hr_player';

/** A signed browser identity shared by tabs; room credentials stay server-side. */
export function installPlayerIdentity(app: Express) {
  const secret = randomBytes(32);
  const sign = (id: string) => createHmac('sha256', secret).update(id).digest('hex');
  const read = (cookies?: string): string | null => {
    const value = cookies?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return null;
    const [id, signature] = value.split('.');
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id), 'hex')) ? id : null;
  };
  app.post('/api/player', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.get('X-Game-Request') !== '1') { res.status(403).json({ error: 'Запрос отклонён.' }); return; }
    if (!read(req.headers.cookie)) {
      const id = randomBytes(32).toString('hex');
      res.setHeader('Set-Cookie', cookieName + '=' + id + '.' + sign(id)
        + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000' + (req.secure ? '; Secure' : ''));
    }
    res.json({ ok: true });
  });
  return read;
}