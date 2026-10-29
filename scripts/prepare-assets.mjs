import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = process.cwd();
const normalize = value => value.split(path.sep).join('/');
const outDir = path.join(root, 'public/game-assets');
await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(path.join(root, '.asset-cache'), { recursive: true });
await fs.mkdir(path.join(root, 'src/generated'), { recursive: true });
async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const files = new Set();
for (const source of (await walk(path.join(root, 'src'))).filter(file => /\.ts$/.test(file))) {
  const text = await fs.readFile(source, 'utf8');
  for (const match of text.matchAll(/from\s+['"]([^'"]+\.png)['"]/g)) files.add(path.resolve(path.dirname(source), match[1]));
}
const manifest = {};
const scales = {};
let beforeBytes = 0, afterBytes = 0, beforePixels = 0, afterPixels = 0;
sharp.concurrency(2);
// Sequential preparation avoids parallel image decoding spikes on the build machine.
for (const file of [...files].sort()) {
  const relative = normalize(path.relative(root, file));
  const buffer = await fs.readFile(file);
  const metadata = await sharp(buffer).metadata();
  let size = 384;
  if (/Cute_Halloween_Monsters|Chibi_Halloween_Creatures|Candy_and_Treats|Game_Resources/.test(relative)) size = 192;
  if (/Haunted_Locations|halloween_shop|cemetery_gate/.test(relative)) size = 640;
  if (/dead_tree/.test(relative)) size = 512;
  // Keep the source sprite sheet grid and the full-resolution background.
  if (/Halloween_PumpkinPatch|backgrounds/.test(relative)) size = Math.max(metadata.width, metadata.height);
  const hash = createHash('sha256').update(buffer).update('webp-88-v1-' + size).digest('hex').slice(0, 20);
  const filename = hash + '.webp';
  const output = path.join(outDir, filename);
  const factor = Math.min(1, size / Math.max(metadata.width, metadata.height));
  const width = Math.max(1, Math.round(metadata.width * factor));
  const height = Math.max(1, Math.round(metadata.height * factor));
  try { await fs.access(output); } catch {
    await sharp(buffer).resize(width, height).webp({ quality: 88, alphaQuality: 100, effort: 4 }).toFile(output);
  }
  const url = '/game-assets/' + filename;
  const entry = { url, scaleX: width / metadata.width, scaleY: height / metadata.height, width, height };
  manifest[relative] = entry;
  scales[url] = { x: entry.scaleX, y: entry.scaleY };
  beforeBytes += buffer.length; afterBytes += (await fs.stat(output)).size;
  beforePixels += metadata.width * metadata.height; afterPixels += width * height;
}
async function writeChanged(file, value) {
  const content = JSON.stringify(value, null, 2) + '\n';
  try { if (await fs.readFile(file, 'utf8') === content) return; } catch {}
  await fs.writeFile(file, content);
}
await writeChanged(path.join(root, '.asset-cache/manifest.json'), manifest);
await writeChanged(path.join(root, 'src/generated/asset-scales.json'), scales);
const metrics = { files: files.size, originalBytes: beforeBytes, optimizedBytes: afterBytes, originalRGBABytes: beforePixels * 4, optimizedRGBABytes: afterPixels * 4 };
await writeChanged(path.join(root, '.asset-cache/metrics.json'), metrics);
console.log(`Assets: ${files.size}; transfer ${(beforeBytes/1048576).toFixed(1)} -> ${(afterBytes/1048576).toFixed(1)} MiB; decoded RGBA ${(beforePixels*4/1048576).toFixed(1)} -> ${(afterPixels*4/1048576).toFixed(1)} MiB`);
