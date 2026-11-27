import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readBytes = (relative) => readFile(path.join(root, relative));
const readJson = async (relative) => JSON.parse((await readBytes(relative)).toString('utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = await readJson('packs/manifest.json');

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.packs.length, 16);
const packBytes = new Map();
const packs = [];
for (const entry of manifest.packs) {
  const bytes = await readBytes(`packs/${entry.path}`);
  const pack = JSON.parse(bytes.toString('utf8'));
  assert.equal(entry.sha256, sha256(bytes), `${entry.id}: exact-byte SHA-256`);
  assert.equal(pack.id, entry.id);
  assert.equal(pack.version, entry.version);
  packBytes.set(entry.path, bytes);
  packs.push(pack);
}
const persona = packs.find((p) => p.id === 'niukou-persona-zh-hant');
assert.equal(persona.content.examples.length, 20);
assert.ok(persona.content.examples.every((example) => example.phenomenon));
for (const moduleName of ['language', 'emotion', 'judgement', 'response', 'lexicon']) {
  assert.ok(packs.some((p) => p.content.module === moduleName), `includes ${moduleName} module`);
}

const files = new Map();
files.set('https://game.example/packs/manifest.json', Buffer.from(JSON.stringify(manifest)));
for (const entry of manifest.packs) files.set(`https://game.example/packs/${entry.path}`, packBytes.get(entry.path));
const loaderSource = await readFile(path.join(root, 'core/pack-loader.js'), 'utf8');
const loaderSandbox = {
  URL, TextDecoder, Uint8Array, ArrayBuffer, Promise, Error, crypto: webcrypto,
  document: { currentScript: { src: 'https://game.example/core/pack-loader.js' } },
  location: { href: 'https://game.example/index.html', origin: 'https://game.example' },
  fetch: async (input) => {
    const bytes = files.get(String(input));
    return bytes ? new Response(bytes, { status: 200 }) : new Response('', { status: 404 });
  }
};
loaderSandbox.window = loaderSandbox;
vm.runInNewContext(loaderSource, loaderSandbox, { filename: 'core/pack-loader.js' });
await loaderSandbox.WulinPackRuntime.ready;
assert.equal(loaderSandbox.WulinPackRuntime.status, 'ready');
assert.equal(loaderSandbox.WulinPackRuntime.all().length, manifest.packs.length);

const vocabularySource = await readFile(path.join(root, 'core/niukou-vocabulary.js'), 'utf8');
vm.runInNewContext(vocabularySource, loaderSandbox, { filename: 'core/niukou-vocabulary.js' });
const vocabHits = loaderSandbox.NiukouVocabulary.match('我想與前輩切磋，但先談清楚規矩。');
assert.ok(vocabHits.some((entry) => entry.term === '前輩'));
assert.ok(vocabHits.some((entry) => entry.term === '切磋'));

const cognitionSource = await readFile(path.join(root, 'core/niukou-cognition.js'), 'utf8');
vm.runInNewContext(cognitionSource, loaderSandbox, { filename: 'core/niukou-cognition.js' });
const cognition = loaderSandbox.NiukouCognition.inspect('我非常生氣，也很傷心。', { intent: 'complaint' });
assert.ok(cognition.emotions.some((emotion) => emotion.id === 'anger'));
assert.ok(cognition.emotions.some((emotion) => emotion.id === 'sadness'));
assert.ok(cognition.responsePlan.length > 0);
assert.equal(cognition.isProposalOnly, true);
const vocabularyCognition = loaderSandbox.NiukouCognition.inspect('我願與前輩切磋，但先談清楚規矩。', {});
assert.ok(vocabularyCognition.vocabulary.some((entry) => entry.term === '前輩'));
assert.ok(vocabularyCognition.vocabulary.some((entry) => entry.term === '切磋'));
assert.equal(loaderSandbox.NiukouCognition.inspect('我不是生氣。', {}).emotions.some((e) => e.id === 'anger'), false,
  'emotion cue following a negation is not reported as positive anger');
assert.equal(loaderSandbox.NiukouCognition.inspect('我不生氣。', {}).emotions.some((e) => e.id === 'anger'), false,
  'single-character negation is recognized');
assert.equal(loaderSandbox.NiukouCognition.inspect('我不是孤單。', {}).emotions.some((e) => e.id === 'loneliness'), false,
  'negation suppresses loneliness cue');
const resolvedReference = loaderSandbox.NiukouCognition.inspect('他現在在哪裡？', {}, [{ who: 'npc', text: '掌門剛到大殿。' }]);
assert.equal(resolvedReference.context.candidate, '掌門');
assert.equal(resolvedReference.context.needsClarification, false);
const ambiguousReference = loaderSandbox.NiukouCognition.inspect('他現在在哪裡？', {}, [{ who: 'npc', text: '掌門和師妹剛到大殿。' }]);
assert.equal(ambiguousReference.context.candidate, null);
assert.equal(ambiguousReference.context.needsClarification, true);
assert.ok(ambiguousReference.responsePlan.some((strategy) => strategy.id === 'clarify-referent'));

const neuralSource = await readFile(path.join(root, 'core/niukou-neural.js'), 'utf8');
vm.runInNewContext(neuralSource, loaderSandbox, { filename: 'core/niukou-neural.js' });
const neural = loaderSandbox.NiukouNeural;
assert.equal(neural.classify('我願意幫忙。', []), null);
const eleven = Array.from({ length: 11 }, (_, i) => ({ t: `測試句${i}`, c: i % 2 ? 'good' : 'evil', src: 'correct' }));
assert.equal(neural.classify('我願意幫忙。', eleven), null, '11 human rows do not satisfy minimum 12');
const oneClass = Array.from({ length: 12 }, (_, i) => ({ t: `善意句${i}`, c: 'good', src: 'correct' }));
assert.equal(neural.classify('我願意幫忙。', oneClass), null, 'single-class training is refused');
const twelve = Array.from({ length: 12 }, (_, i) => ({
  t: `${i % 2 ? '我願意出手相助' : '我定要取你性命'}${i}`,
  c: i % 2 ? 'good' : 'evil', src: 'correct'
}));
const proposal = neural.classify('我願意出手相助', twelve);
assert.ok(proposal && typeof proposal.accepted === 'boolean');
assert.equal(proposal.feedbackCount, 12);
const conflict = Array.from({ length: 12 }, (_, i) => ({ t: '同一句話', c: i % 2 ? 'good' : 'evil', src: 'correct' }));
const uncertain = neural.classify('同一句話', conflict);
assert.ok(uncertain && !uncertain.accepted, 'conflicting labels stay below confidence/margin gates');
const automaticOnly = twelve.map((sample) => ({ ...sample, src: 'auto' }));
assert.equal(neural.classify('我願意出手相助', automaticOnly), null, 'automatic rows do not satisfy human-feedback threshold');

let lookupCalls = 0;
let lookupUrl = '';
const localValues = new Map();
const wordbankSandbox = {
  URL, URLSearchParams, Date,
  fetch: async (url) => {
    lookupCalls++;
    lookupUrl = String(url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ query: { pages: { '12': { pageid: 12, title: '切磋', fullurl: 'https://zh.wiktionary.org/wiki/%E5%88%87%E7%A3%8B', extract: '詞條摘錄' } } } }) };
  },
  localStorage: {
    getItem: (key) => localValues.get(key) || null,
    setItem: (key, value) => localValues.set(key, value)
  }
};
wordbankSandbox.window = wordbankSandbox;
const wordbankSource = await readFile(path.join(root, 'core/niukou-wordbank.js'), 'utf8');
vm.runInNewContext(wordbankSource, wordbankSandbox, { filename: 'core/niukou-wordbank.js' });
assert.equal(lookupCalls, 0, 'dictionary lookup does not run on module load');
const candidate = await wordbankSandbox.NiukouWordbank.search('切磋');
assert.equal(lookupCalls, 1, 'lookup is explicit and user-triggered');
assert.equal(new URL(lookupUrl).searchParams.get('titles'), '切磋', 'only the requested term is sent');
assert.equal(candidate.activeInJudgement, false);
assert.equal(candidate.source.host, 'zh.wiktionary.org');
const savedCandidate = wordbankSandbox.NiukouWordbank.saveCandidate(candidate);
assert.equal(savedCandidate.items.length, 1);
assert.equal(savedCandidate.items[0].status, 'unreviewed-candidate');
assert.equal(savedCandidate.items[0].activeInJudgement, false);
assert.equal(wordbankSandbox.NiukouWordbank.exportCandidates().entries.length, 1);
assert.throws(() => wordbankSandbox.NiukouWordbank.saveCandidate({ ...candidate, source: { ...candidate.source, host: 'evil.example' } }));
assert.equal(wordbankSandbox.NiukouWordbank.remove(candidate.id).length, 0);

const html = await readFile(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('./core/pack-loader.js') < html.indexOf('./core/niukou-cognition.js'));
assert.ok(html.indexOf('./core/niukou-vocabulary.js') < html.indexOf('./core/niukou-cognition.js'));
assert.ok(html.indexOf('./core/niukou-cognition.js') < html.indexOf('./core/niukou-neural.js'));
assert.ok(html.indexOf('./core/niukou-wordbank.js') < html.indexOf('function nkLookupWiktionary'));
assert.match(html, /只把下方單一詞語送往中文 Wiktionary 查詢/);
assert.match(html, /不會直接影響鈕釦判讀或遊戲狀態/);
assert.match(html, /var protectedRule=prop\.source==='niukou'&&prop\.confidence>=0\.9/);
assert.match(html, /!unsafeSignal&&prop\.source!=='niukou'/);
assert.match(html, /prop\.cat==='evil'&&prop\.confidence>=0\.8/);
assert.match(html, /if\(neural&&neural\.accepted/);

console.log('鈕釦認知模組、資料完整性、情緒否定、MLP 門檻與安全護欄測試通過。');
