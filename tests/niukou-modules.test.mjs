import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, makeStorage } from './helpers.mjs';

const { sb, manifest, run } = await boot();
const J = (v) => JSON.parse(JSON.stringify(v));

test('all packs load without errors', () => {
  assert.equal(sb.WulinPackRuntime.status, 'ready');
  assert.equal(sb.WulinPackRuntime.all().length, manifest.packs.length);
  assert.deepEqual(J(sb.WulinPackRuntime.errors || []), []);
});

test('text: traditional conversion, segmentation, unknown terms', () => {
  const T = sb.NiukouText;
  assert.equal(T.normalize('这个门派很强'), '這個門派很強');
  assert.equal(T.normalize('頭髮'), '頭髮');
  const w = J(T.words('我想與前輩切磋武藝'));
  assert.ok(w.includes('前輩') && w.includes('切磋'), w.join('|'));
  assert.ok(T.similarity('前輩指點', '前輩指教') > 0.3);
  const u = J(T.unknownTerms('什麼是以柔克剛', {}));
  assert.ok(Array.isArray(u));
  assert.ok(J(T.unknownTerms('「鶴唳九霄」是什麼意思', {})).some((x) => x.term === '鶴唳九霄'));
});

test('emotion: negation, contrast, mixed, VAD, mood', () => {
  const E = sb.NiukouEmotion, ids = (t) => J(E.analyze(t).emotions).map((e) => e.id);
  assert.ok(ids('我非常生氣，也很傷心').includes('anger'));
  assert.ok(ids('我非常生氣，也很傷心').includes('sadness'));
  assert.ok(!ids('我不是生氣').includes('anger'));
  assert.ok(!ids('我不生氣').includes('anger'));
  assert.ok(!ids('我不是孤單').includes('loneliness'));
  const sad = E.analyze('我好難過，失去了師父');
  assert.ok(sad.vad.valence < 0);
  let m = E.newMood(); m = E.updateMood(m, sad); assert.ok(m.n === 1 && E.moodLabel(m).length > 0);
  assert.ok(E.analyze('哈哈，你真是太厲害了……').sarcasm !== undefined);
});

test('empathy and dialogue produce proposals', () => {
  const emo = sb.NiukouEmotion.analyze('我好難過');
  const plan = sb.NiukouEmpathy.plan(emo, { persona: 'gentle' });
  assert.ok(plan && plan.stance !== 'none', JSON.stringify(plan));
  const line = sb.NiukouEmpathy.compose(plan);
  assert.ok(typeof line === 'string' && line.length > 0);
  assert.equal(sb.NiukouEmpathy.plan(emo, { persona: 'hostile' }).stance, 'none');
  assert.equal(sb.NiukouEmpathy.plan(emo, { persona: 'gentle', count: 3 }).stance, 'none');
  const st = sb.NiukouDialogue.createState();
  const o = sb.NiukouDialogue.observe(st, '請問這把劍是誰打造的？');
  assert.ok(o.asksQuestion);
  assert.ok(sb.NiukouDialogue.observe(st, '請問這把劍是誰打造的？').repeat);
});

test('cognition enrich keeps negation behaviour and adds emotion/normalized', () => {
  const c = J(sb.NiukouCognition.inspect('我不是生氣，只是有點傷心', { intent: 'chat' }, []));
  assert.ok(!c.emotions.some((e) => e.id === 'anger'));
  const s = J(sb.NiukouCognition.inspect('这个人让我很生气', {}, []));
  assert.ok(s.emotion && s.normalized.includes('這個'));
});

test('vocab integration: draft -> approve -> match -> export', () => {
  const V = sb.NiukouVocabIntegration;
  V.clearAll();
  const draft = V.draftFromResults('鶴唳九霄', [{ source: 'wiktionary', ok: true, title: '鶴唳九霄', extract: '鶴唳九霄：形容聲音響亮高遠。出自成語。', url: 'https://zh.wiktionary.org/wiki/x', license: 'CC BY-SA', licenseUrl: 'u' }]);
  assert.ok(draft && draft.term === '鶴唳九霄');
  assert.ok(V.addDraft(draft).ok);
  assert.equal(V.drafts().length, 1);
  assert.ok(V.approve('鶴唳九霄').ok);
  assert.ok(J(sb.NiukouVocabulary.match('他的嘯聲鶴唳九霄', 6)).some((e) => e.term === '鶴唳九霄'));
  const exp = V.exportLocal();
  assert.ok(JSON.stringify(exp).includes('CC BY-SA'));
  assert.equal(V.teach('x', 'y').ok, false);
  assert.ok(V.teach('劍氣縱橫', '形容劍法氣勢凌厲，劍光四射。').ok);
  V.clearAll();
});

test('vocab usage and imitation stay local and bounded', () => {
  sb.NiukouVocabUsage.clearAll();
  sb.NiukouVocabUsage.observePlayer('晚輩特來請教前輩，切磋一二');
  assert.ok(sb.NiukouVocabUsage.stats());
  sb.NiukouImitation.reset();
  for (let i = 0; i < 6; i++) sb.NiukouImitation.observe('晚輩斗膽，敢問前輩高見。');
  const sum = J(sb.NiukouImitation.summary());
  assert.ok(sum);
  assert.ok(!JSON.stringify(localStorageDump()).includes('晚輩斗膽，敢問前輩高見。'));
});
function localStorageDump() { return [...sb.localStorage._m.entries()]; }

test('websearch: safe terms, allow-list, parsing, cache, breaker, rate limit', async () => {
  const W = sb.NiukouWebSearch;
  assert.equal(W.isSafeTerm('以柔克剛').ok, true);
  for (const bad of ['a', '一', 'https://x.y', '我的手機0912345678', 'abc@d.com', '甲'.repeat(20), 'hello'])
    assert.equal(W.isSafeTerm(bad).ok, false, bad);
  assert.equal(W.isSafeTerm('李逍遙', { exclude: ['李逍遙'] }).ok, false);

  const urls = [];
  const fake = async (url, init) => {
    urls.push(String(url));
    assert.equal(init.credentials, 'omit'); assert.equal(init.method, 'GET');
    const u = new URL(url), q = u.searchParams;
    let body = {};
    if (u.hostname === 'zh.wiktionary.org') body = { query: { pages: { 1: { title: '以柔克剛', extract: '以柔克剛 成語 用柔和的方法克服剛強。' } } } };
    else if (u.hostname === 'zh.wikipedia.org') body = { query: { pages: { '-1': { title: '以柔克剛', missing: '' } } } };
    else if (q.get('action') === 'wbsearchentities') body = { search: [{ id: 'Q1', label: '以柔克剛', description: '成語' }] };
    else body = { entities: { Q1: { aliases: { 'zh-hant': [{ value: '柔能克剛' }] } } } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  W.configure({ fetch: fake, sleep: async () => {} });
  const r = J(await W.lookup('以柔克剛'));
  assert.equal(r.results.length, 3);
  assert.ok(r.results.find((x) => x.source === 'wiktionary').ok);
  assert.equal(r.results.find((x) => x.source === 'wikipedia').ok, false);
  assert.deepEqual(r.results.find((x) => x.source === 'wikidata').aliases, ['柔能克剛']);
  assert.ok(urls.every((u) => u.startsWith('https://') && /origin=\*/.test(u)));
  assert.ok(urls.every((u) => !/[?&](cookie|token|key)=/i.test(u)));
  const n = urls.length;
  assert.equal((await W.lookup('以柔克剛')).fromCache, true);
  assert.equal(urls.length, n);

  let calls = 0;
  W.configure({ fetch: async () => { calls++; throw new Error('boom'); }, sleep: async () => {} });
  W.clearCache();
  const off = await W.lookup('四兩撥千斤');
  assert.ok(off.offline);
  for (let i = 0; i < 4; i++) await W.lookup('四兩撥千斤', { force: true });
  assert.ok(calls <= 9, 'breaker pauses hosts after repeated failures, calls=' + calls);
  assert.ok(Object.values(J(W.status().hosts)).some((h) => h.paused));
  W.configure({ fetch: null }); W.clearCache();
});

test('learning: opt-in only, queue, daily cap, drafts need approval', async () => {
  const L = sb.NiukouLearning, W = sb.NiukouWebSearch, V = sb.NiukouVocabIntegration;
  L.clearAll(); V.clearAll(); W.clearCache();
  assert.equal(L.settings().autoWeb, false);
  const added = L.observe('「鶴唳九霄」是什麼意思？', {});
  assert.ok(added.includes('鶴唳九霄'));
  let calls = 0;
  W.configure({ sleep: async () => {}, fetch: async (url) => { calls++; const u = new URL(url);
    const body = u.hostname === 'zh.wiktionary.org' ? { query: { pages: { 1: { title: '鶴唳九霄', extract: '鶴唳九霄 形容聲音高亢嘹亮。' } } } } : { query: { pages: { '-1': { missing: '' } } }, search: [] };
    return new Response(JSON.stringify(body), { status: 200 }); } });
  assert.deepEqual(J(await L.tick({})), { ran: false, reason: 'disabled' });
  assert.equal(calls, 0);
  L.setSettings({ autoWeb: true });
  let clockMs = Date.now(); L._setClock(() => clockMs);
  const t = await L.tick({});
  assert.ok(t.ran && t.ok, JSON.stringify(t));
  assert.equal(V.drafts().length, 1);
  assert.equal(V.entries().length, 0, 'draft is not active until approved');
  assert.equal(L.summary().log.length, 1);
  assert.ok(L.approveDraft('鶴唳九霄').ok);
  assert.equal(V.entries().length, 1);
  L.setSettings({ dailyCap: 1 });
  L.addTerm('以柔克剛'); clockMs += 10000;
  assert.equal((await L.tick({})).reason, 'daily-cap');
  assert.equal(L.addTerm('hello').ok, false);
  L.noteJudgement('他似乎有點不對勁', 'off', 0.52, 'engine');
  assert.equal(L.questions(2).length, 1);
  for (let i = 0; i < 20; i++) L.recordOutcome(0.9, i % 2 === 0);
  assert.ok(L.calibrated(0.92) < 0.92);
  W.configure({ fetch: null }); L.clearAll(); V.clearAll();
});

test('neural: gates and cross-validated accuracy on labelled examples', () => {
  const N = sb.NiukouNeural;
  assert.equal(N.classify('隨便', []), null);
  assert.equal(N.classify('隨便', Array.from({ length: 20 }, () => ({ t: '甲', c: 'good', src: 'practice' }))), null);
  const rows = [];
  for (const p of sb.WulinPackRuntime.all()) for (const ex of (p.content.examples || [])) if (ex.input && ex.category) rows.push({ t: ex.input, c: ex.category });
  assert.ok(rows.length >= 100, 'rows ' + rows.length);
  const cv = N.evaluate(rows, 5);
  // small, adversarial sample set: must beat the majority-class baseline (about 0.39); real use stays gated behind human corrections
  assert.ok(cv.accuracy > 0.40, 'cv ' + JSON.stringify(cv));
  const conflict = [];
  for (let i = 0; i < 8; i++) { conflict.push({ t: '這句話很含糊', c: 'good', src: 'practice' }, { t: '這句話很含糊', c: 'evil', src: 'practice' }); }
  const out = N.classify('這句話很含糊', conflict);
  assert.ok(!out || out.accepted === false);
  assert.equal(N.modelInfo().version, '0.2.0');
});
