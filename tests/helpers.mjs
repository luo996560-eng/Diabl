import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORE = ['niukou-text', 'niukou-vocabulary', 'niukou-emotion', 'niukou-empathy', 'niukou-dialogue', 'niukou-vocab-integration', 'niukou-vocab-usage', 'niukou-cognition', 'niukou-neural', 'niukou-imitation', 'niukou-learning', 'niukou-guide', 'niukou-wordbank', 'niukou-websearch'];

export function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

export async function boot() {
  const manifestBytes = await readFile(path.join(root, 'packs/manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const files = new Map([['https://game.example/packs/manifest.json', manifestBytes]]);
  for (const e of manifest.packs) files.set(`https://game.example/packs/${e.path}`, await readFile(path.join(root, 'packs', e.path)));
  const sb = {
    URL, URLSearchParams, TextDecoder, Uint8Array, ArrayBuffer, Float32Array, Promise, Error, Date, Math, JSON, Object, Array, Map, Set, setTimeout, clearTimeout, console,
    crypto: webcrypto, localStorage: makeStorage(), AbortController,
    document: { currentScript: { src: 'https://game.example/core/pack-loader.js' } },
    location: { href: 'https://game.example/index.html', origin: 'https://game.example' },
    fetch: async (input) => { const b = files.get(String(input)); return b ? new Response(b, { status: 200 }) : new Response('', { status: 404 }); }
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(await readFile(path.join(root, 'core/pack-loader.js'), 'utf8'), sb, { filename: 'pack-loader.js' });
  await sb.WulinPackRuntime.ready;
  for (const name of CORE) vm.runInContext(await readFile(path.join(root, `core/${name}.js`), 'utf8'), sb, { filename: `${name}.js` });
  return { sb, manifest, run: (code) => vm.runInContext(code, sb) };
}

export async function loadWiki(sb) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const a = html.indexOf('var WIKI_DATA={'), b = html.indexOf('function masterPortraitHTML', a);
  if (a < 0 || b < 0) throw new Error('WIKI_DATA not found');
  return vm.runInNewContext('(' + html.slice(a + 'var WIKI_DATA='.length, b).trim().replace(/\/\*[\s\S]*$/, '').replace(/;\s*$/, '') + ')', {});
}
