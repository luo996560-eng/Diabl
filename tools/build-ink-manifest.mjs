#!/usr/bin/env node
// 掃描 assets/ink 下的 WebP，重建 manifest.json。
import { readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = path.join(root, 'assets/ink');
const groups = { pet: 'pet', wife: 'wife', foe: 'foe' };
const images = [];
for (const [kind, dir] of Object.entries(groups)) {
  const entries = (await readdir(path.join(base, dir))).filter((f) => f.endsWith('.webp')).sort();
  for (const f of entries) {
    const rel = dir + '/' + f;
    const bytes = (await stat(path.join(base, rel))).size;
    images.push({ path: rel, kind, key: path.basename(f, '.webp'), bytes });
  }
}
const manifest = { version: 1, style: 'ink-wash-xuan-paper', counts: { pet: 50, wife: 100, foe: 60 }, images };
await writeFile(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, 0));
console.log('images', images.length);
