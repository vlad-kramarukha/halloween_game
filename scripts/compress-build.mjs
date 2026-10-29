import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const root = resolve('dist/assets');
let count = 0;
for (const name of await readdir(root)) {
  if (!['.js', '.css', '.json', '.svg'].includes(extname(name))) continue;
  const path = resolve(root, name);
  if (!(await stat(path)).isFile()) continue;
  const source = await readFile(path);
  const versions = [
    ['br', brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })],
    ['gz', gzipSync(source, { level: 9 })],
  ];
  for (const [extension, bytes] of versions) if (bytes.length < source.length) await writeFile(path + '.' + extension, bytes);
  count++;
}
console.log('Precompressed JS/CSS assets: ' + count + ' (Brotli + gzip)');