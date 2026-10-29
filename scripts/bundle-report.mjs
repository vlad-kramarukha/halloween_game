import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('dist');
const manifest = JSON.parse(await readFile(resolve(root, '.vite/manifest.json'), 'utf8'));
const seen = new Set();
const initial = new Set();
function visit(key) {
  if (seen.has(key)) return;
  seen.add(key);
  const item = manifest[key];
  if (!item) return;
  if (item.file.endsWith('.js')) initial.add(item.file);
  for (const dependency of item.imports ?? []) visit(dependency);
}
visit('index.html');
let plain = 0;
let brotli = 0;
for (const file of initial) {
  const bytes = (await stat(resolve(root, file))).size;
  plain += bytes;
  brotli += await stat(resolve(root, file + '.br')).then(result => result.size).catch(() => bytes);
}
console.log('Initial entry JavaScript: ' + plain + ' bytes; Brotli transfer: ' + brotli + ' bytes');
console.log('Initial JS files: ' + [...initial].join(', '));
if ([...initial].some(file => /phaser|start-game/.test(file))) throw new Error('Game engine leaked into the initial entry bundle');
if (plain > 64 * 1024) throw new Error('Initial entry JS exceeds the 64 KiB budget');
