import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const manifest = await readJson('packs/manifest.json');
const personaBytes = await readFile(path.join(root, 'packs/niukou-persona-zh-Hant.json'));
const persona = JSON.parse(personaBytes.toString('utf8'));
const personaEntry = manifest.packs.find((entry) => entry.id === persona.id);
assert.ok(personaEntry, 'persona pack is listed in manifest');
assert.equal(personaEntry.version, persona.version, 'manifest version matches pack');
assert.equal(personaEntry.sha256, sha256(personaBytes), 'manifest SHA-256 matches exact pack bytes');
assert.equal(persona.content.examples.length, 20, 'persona pack carries 20 curated examples');
assert.ok(persona.content.examples.every((example) => example.phenomenon), 'all new examples are tagged');
assert.ok(persona.content.examples.every((example) => example.input.length <= 180 && example.replyStyle.length <= 180), 'examples fit Worker prompt limits');

// Run the real browser pack-loader with mocked same-origin fetches. Include an old-style
// example without `phenomenon` to protect backwards compatibility for existing packs.
const legacyPack = {
  schemaVersion: 1,
  id: 'legacy-dialogue-sample',
  version: '1.0.0',
  type: 'data',
  content: { examples: [{ input: '我再想一想。', category: 'neutral', replyStyle: '尊重玩家尚未決定。' }] }
};
const legacyBytes = Buffer.from(JSON.stringify(legacyPack));
const simulatedManifest = {
  schemaVersion: 1,
  minCoreVersion: '1.0.0',
  packs: [
    { ...personaEntry },
    { id: legacyPack.id, name: '舊版格式相容測試', version: legacyPack.version, path: 'legacy-dialogue-sample.json', sha256: sha256(legacyBytes) }
  ]
};
const files = new Map([
  ['https://game.example/packs/manifest.json', Buffer.from(JSON.stringify(simulatedManifest))],
  ['https://game.example/packs/niukou-persona-zh-Hant.json', personaBytes],
  ['https://game.example/packs/legacy-dialogue-sample.json', legacyBytes]
]);
const loaderSource = await readFile(path.join(root, 'core/pack-loader.js'), 'utf8');
const sandbox = {
  URL,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  Promise,
  Error,
  crypto: webcrypto,
  document: { currentScript: { src: 'https://game.example/core/pack-loader.js' } },
  location: { href: 'https://game.example/index.html', origin: 'https://game.example' },
  fetch: async (input) => {
    const bytes = files.get(String(input));
    return bytes ? new Response(bytes, { status: 200 }) : new Response('', { status: 404 });
  }
};
sandbox.window = sandbox;
vm.runInNewContext(loaderSource, sandbox, { filename: 'core/pack-loader.js' });
await sandbox.WulinPackRuntime.ready;
assert.equal(sandbox.WulinPackRuntime.status, 'ready', 'loader accepts the new and legacy pack schemas');
assert.equal(sandbox.WulinPackRuntime.all().length, 2, 'both packs are loaded');

// Exercise the actual Worker handler and verify semantic labels reach the model context.
const workerSource = await readFile(path.join(root, 'workers/niukou-chat/src/index.js'), 'utf8');
const worker = (await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`)).default;
const originalFetch = globalThis.fetch;
let upstreamBody;
try {
  globalThis.fetch = async (_url, options) => {
    upstreamBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      category: 'neutral', confidence: 0.9, intent: 'complaint', reason: '示例測試', reply: '我明白你的不滿，讓我把事情說清楚。', clarification: ''
    }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const response = await worker.fetch(new Request('https://worker.example/chat', {
    method: 'POST',
    headers: { Origin: 'https://game.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: '可真是多謝你，讓我在雨裡等了一整夜。',
      npc: { name: '測試人物', scene: '客棧' },
      packs: [{ examples: [persona.content.examples[5]] }]
    })
  }), {
    ALLOWED_ORIGIN: 'https://game.example',
    AI_API_KEY: 'test-only-not-a-real-key',
    AI_BASE_URL: 'https://provider.example/v1',
    AI_MODEL: 'test-model'
  });
  assert.equal(response.status, 200, 'Worker responds successfully in the simulation');
  const responseBody = await response.json();
  assert.equal(responseBody.category, 'neutral');
  assert.ok(upstreamBody.messages[0].content.includes('"phenomenon":"反諷"'), 'phenomenon label reaches model prompt');
  assert.ok(upstreamBody.messages[0].content.includes('標籤可提示'), 'system prompt explains labels are descriptive hints');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('鈕釦資料包與 Worker 回歸測試通過。');
