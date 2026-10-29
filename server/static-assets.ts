import express, { type Express } from 'express';
import { access } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const immutable = { maxAge: '1y', immutable: true } as const;
const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Precompression is built once; requests do not spend CPU recompressing the Phaser bundle. */
export function installStaticAssets(app: Express, root = resolve('dist')): void {
  app.use('/assets', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { next(); return; }
    if (!/^\/[\w.-]+$/.test(req.path)) { res.sendStatus(404); return; }
    if (!types[extname(req.path)]) { next(); return; }
    res.vary('Accept-Encoding');
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
    if (!encoding) { res.sendStatus(406); return; }
    if (encoding === 'identity') { next(); return; }
    const file = resolve(root, 'assets', req.path.slice(1) + (encoding === 'br' ? '.br' : '.gz'));
    void access(file).then(() => {
      res.type(types[extname(req.path)]);
      res.setHeader('Content-Encoding', encoding);
      res.sendFile(file, immutable, error => { if (error) next(error); });
    }, () => next());
  }, express.static(resolve(root, 'assets'), immutable));
  app.use('/game-assets', (req, res, next) => {
    if (!/^\/[\w.-]+$/.test(req.path)) { res.sendStatus(404); return; }
    next();
  }, express.static(resolve(root, 'game-assets'), immutable));
  app.use(express.static(root, {
    setHeaders(res, path) { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
  }));
}