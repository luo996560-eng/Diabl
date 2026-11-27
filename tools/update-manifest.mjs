// Usage: node tools/update-manifest.mjs [--check]
// Recomputes SHA-256 and version for every manifest entry from the actual pack bytes.
// With --check it only reports drift (exit 1) and also flags pack files missing from the manifest.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'packs');
const manifestPath = path.join(dir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const check = process.argv.includes('--check');
let drift = 0;
for (const entry of manifest.packs) {
  const bytes = await readFile(path.join(dir, entry.path));
  const pack = JSON.parse(bytes.toString('utf8'));
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (pack.id !== entry.id) { console.error(`${entry.path}: id mismatch (${pack.id} != ${entry.id})`); drift++; continue; }
  if (entry.sha256 !== sha || entry.version !== pack.version) {
    drift++;
    console.log(`${check ? 'DRIFT' : 'update'} ${entry.id}: ${entry.version}/${entry.sha256.slice(0, 8)} -> ${pack.version}/${sha.slice(0, 8)}`);
    entry.sha256 = sha; entry.version = pack.version;
  }
}
const listed = new Set(manifest.packs.map((p) => p.path));
for (const file of await readdir(dir)) {
  if (file.endsWith('.json') && file !== 'manifest.json' && !listed.has(file)) { console.error(`not in manifest: ${file}`); drift++; }
}
if (check) process.exit(drift ? 1 : 0);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(drift ? 'manifest updated' : 'manifest already current');
