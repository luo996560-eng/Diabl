/* NiukouVocabIntegration: one merged vocabulary view over (a) hash-verified packs, (b) terms the player taught,
 * and (c) web-derived drafts the player explicitly approved. Web text stays local, keeps its source and licence,
 * and only supplies context. It is never used to decide good/evil or to change game state. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', KEY = 'wuxiaNiukouLexiconV1', MAX_LOCAL = 200, MAX_DRAFTS = 30;
  function load() {
    try {
      var v = JSON.parse(root.localStorage.getItem(KEY) || 'null');
      if (v && v.v === 1 && Array.isArray(v.entries) && Array.isArray(v.drafts)) return v;
    } catch (e) { /* fall through */ }
    return { v: 1, entries: [], drafts: [], rejected: [] };
  }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
  function clip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').trim().slice(0, n); }
  function norm(t) { return root.NiukouText ? root.NiukouText.normalize(t) : String(t || ''); }

  /* ---- reading web extracts into a short meaning ---- */
  function cleanExtract(raw, limit, term) {
    var lines = String(raw || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    var good = [];
    var stop = false;
    lines.forEach(function (l) {
      if (stop) return;
      if (/^(同義詞|近義詞|反義詞|相關詞彙|衍生詞|派生詞|翻譯|參見|相關詞|成語接龍)$/.test(l)) { stop = true; return; }
      if (/\[[^\]]*(標準漢語|拼音|注音|粵拼|閩南語|客家語)[^\]]*\]/.test(l)) return;   // example sentences with pronunciation tags
      if (term && l === term) return;
      if (/^=+.*=+$/.test(l)) return;                    // headings
      if (/^(參見|參考|相關|另見|翻譯|發音|讀音|注音|拼音|漢語拼音|注釋|來源|延伸閱讀)/.test(l)) return;
      if (/^[A-Za-z0-9 ,.;:()\-\/_\[\]]+$/.test(l)) return; // pure latin metadata
      if (l.length < 4) return;
      good.push(l.replace(/\s+/g, ' ').replace(/^[\d\.\)\(、\-\*•\s]+/, ''));
    });
    var out = '';
    for (var i = 0; i < good.length && out.length < (limit || 220); i++) out += (out ? '；' : '') + good[i].replace(/[。；;]+$/, '');
    return clip(out, limit || 220);
  }
  function firstSentence(raw, limit) {
    var t = String(raw || '').replace(/（[^）]*）|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    var m = t.match(/^[^。！？\n]{6,}[。！？]?/);
    return clip(m ? m[0] : t, limit || 160);
  }
  function guessRegister(term, meaning) {
    var m = meaning || '';
    if (/成語|比喻|形容|喻/.test(m)) return '成語／比喻';
    if (/稱謂|稱呼|敬稱|謙稱/.test(m)) return '稱謂';
    if (/武|功|劍|刀|俠|門派|江湖/.test(m)) return '武學／江湖';
    if (/情|心|感|意/.test(m)) return '情感／表達';
    return '網路詞典候選';
  }

  /* results: [{source:'wiktionary'|'wikipedia'|'wikidata', title, extract, description, aliases[], url, license, licenseUrl}] */
  function draftFromResults(term, results) {
    var t = norm(clip(term, 32)), rs = (results || []).filter(function (r) { return r && r.ok !== false; });
    if (!t || !rs.length) return null;
    var wk = rs.filter(function (r) { return r.source === 'wiktionary'; })[0];
    var wp = rs.filter(function (r) { return r.source === 'wikipedia'; })[0];
    var wd = rs.filter(function (r) { return r.source === 'wikidata'; })[0];
    var parts = [];
    if (wk && wk.extract) { var m1 = cleanExtract(wk.extract, 200, t); if (m1) parts.push({ from: 'wiktionary', text: m1 }); }
    if (wp && wp.extract) { var m2 = firstSentence(wp.extract, 150); if (m2) parts.push({ from: 'wikipedia', text: m2 }); }
    if (wd && wd.description) { var m3 = clip(wd.description, 80); if (m3) parts.push({ from: 'wikidata', text: m3 }); }
    if (!parts.length) return null;
    // cross-check: agreement raises confidence; sources never silently overwrite each other
    // the dictionary entry is the primary meaning; encyclopedia text is only used when no dictionary entry exists (it often describes a work or person with the same title)
    var meaning = clip(parts[0].text, 238);
    var aliases = [];
    (wd && wd.aliases || []).forEach(function (a) { var x = norm(clip(a, 24)); if (x && x !== t && aliases.indexOf(x) < 0 && aliases.length < 6) aliases.push(x); });
    var sources = rs.map(function (r) { return { source: r.source, url: clip(r.url, 300), license: clip(r.license, 120), licenseUrl: clip(r.licenseUrl, 300), title: clip(r.title, 60) }; });
    var agree = parts.length > 1 ? NiukouOverlap(parts[0].text, parts[1].text) : 0;
    var confidence = Math.min(0.9, 0.35 + 0.15 * rs.length + 0.25 * agree);
    return { id: 'draft:' + t, term: t, aliases: aliases, meaning: meaning, register: guessRegister(t, meaning), useWhen: [], avoidWhen: ['把網路詞典摘錄當成唯一定義', '忽略上下文與語氣'], status: 'draft', activeInJudgement: false, confidence: +confidence.toFixed(2), sources: sources, createdAt: new Date().toISOString() };
  }
  function NiukouOverlap(a, b) {
    return root.NiukouText ? root.NiukouText.similarity(a, b) : 0;
  }

  /* ---- store operations ---- */
  function addDraft(d) {
    if (!d || !d.term) return { ok: false, reason: 'empty' };
    var s = load();
    if (s.entries.some(function (e) { return e.term === d.term; })) return { ok: false, reason: 'already-approved' };
    if (s.drafts.some(function (e) { return e.term === d.term; })) return { ok: false, reason: 'already-draft' };
    if (root.NiukouVocabulary && root.NiukouVocabulary.entries && packTerms()[d.term]) return { ok: false, reason: 'in-pack' };
    s.drafts.push(d); if (s.drafts.length > MAX_DRAFTS) s.drafts = s.drafts.slice(-MAX_DRAFTS);
    save(s); return { ok: true };
  }
  function packTerms() {
    var out = Object.create(null), rows = root.NiukouVocabulary && root.NiukouVocabulary.entries ? root.NiukouVocabulary.entries() : [];
    rows.forEach(function (r) { var e = r.entry || {}; if (e.term) out[e.term] = r.source; (e.aliases || []).forEach(function (a) { if (!out[a]) out[a] = r.source; }); });
    return out;
  }
  function approve(termOrId, edits) {
    var s = load(), i = s.drafts.findIndex(function (d) { return d.term === termOrId || d.id === termOrId; });
    if (i < 0) return { ok: false, reason: 'not-found' };
    var d = s.drafts[i];
    var e = Object.assign({}, d, edits || {}, { status: 'player-approved', activeInJudgement: false, approvedAt: new Date().toISOString(), origin: 'web' });
    e.meaning = clip(e.meaning, 240); e.term = clip(e.term, 32);
    if (!e.meaning) return { ok: false, reason: 'no-meaning' };
    s.drafts.splice(i, 1);
    s.entries = s.entries.filter(function (x) { return x.term !== e.term; }).concat([e]).slice(-MAX_LOCAL);
    save(s); return { ok: true, entry: e };
  }
  function reject(termOrId) {
    var s = load(), d = s.drafts.filter(function (x) { return x.term === termOrId || x.id === termOrId; })[0];
    if (!d) return false;
    s.drafts = s.drafts.filter(function (x) { return x !== d; });
    s.rejected = s.rejected.concat([d.term]).slice(-100); save(s); return true;
  }
  function teach(term, meaning, extras) {
    var t = norm(clip(term, 32)), m = clip(meaning, 240);
    if (t.length < 2 || !m) return { ok: false, reason: 'need-term-and-meaning' };
    var s = load();
    s.entries = s.entries.filter(function (x) { return x.term !== t; }).concat([{ id: 'taught:' + t, term: t, aliases: [], meaning: m, register: clip(extras && extras.register || '玩家教導', 40), useWhen: [], avoidWhen: [], status: 'player-taught', activeInJudgement: false, origin: 'taught', sources: [], approvedAt: new Date().toISOString() }]).slice(-MAX_LOCAL);
    save(s); return { ok: true };
  }
  function remove(term) { var s = load(); var n = s.entries.length; s.entries = s.entries.filter(function (e) { return e.term !== term; }); save(s); return s.entries.length < n; }
  function wasRejected(term) { return load().rejected.indexOf(norm(term)) >= 0; }
  function localEntries() { return load().entries; }
  function drafts() { return load().drafts; }
  function localTerms() { var out = []; load().entries.forEach(function (e) { out.push(e.term); (e.aliases || []).forEach(function (a) { out.push(a); }); }); return out; }

  /* ---- unified index ---- */
  function index() {
    var rows = [], seen = Object.create(null), conflicts = [];
    var pk = root.NiukouVocabulary && root.NiukouVocabulary.entries ? root.NiukouVocabulary.entries() : [];
    pk.forEach(function (r) { var e = r.entry || {}; if (!e.term) return; if (seen[e.term]) { conflicts.push({ term: e.term, kept: seen[e.term], dropped: r.source }); return; } seen[e.term] = r.source; rows.push({ entry: e, origin: 'pack', source: r.source }); });
    load().entries.forEach(function (e) { if (seen[e.term]) { conflicts.push({ term: e.term, kept: seen[e.term], dropped: e.origin || 'local' }); return; } seen[e.term] = e.origin || 'local'; rows.push({ entry: e, origin: e.origin === 'taught' ? 'taught' : 'approved', source: e.origin || 'local' }); });
    return { rows: rows, conflicts: conflicts };
  }
  function matchLocal(text, limit) {
    var s = norm(text).slice(0, 1000), hits = [];
    load().entries.forEach(function (e) {
      var forms = [e.term].concat(e.aliases || []).filter(function (t) { return t && t.length >= 2; });
      var m = forms.filter(function (t) { return s.indexOf(t) >= 0; });
      if (m.length) hits.push({ id: e.id, term: e.term, matched: m.slice(0, 3), meaning: e.meaning, register: e.register || '', useWhen: (e.useWhen || []).slice(0, 3), avoidWhen: (e.avoidWhen || []).slice(0, 3), responseNeed: '', source: 'local-' + (e.origin || 'approved'), origin: e.origin || 'approved' });
    });
    return hits.slice(0, limit || 3);
  }
  function exportLocal() {
    var s = load();
    return { schemaVersion: 1, type: 'niukou-local-lexicon-export', locale: 'zh-Hant', generatedAt: new Date().toISOString(),
      notice: '這些詞條由玩家在本機審核採用；網路來源詞條保留來源與授權資訊，重新散布前須逐筆確認授權（如 CC BY-SA）。不屬於 packs/ 的官方資料包。',
      entries: s.entries, pendingDrafts: s.drafts };
  }
  function stats() { var s = load(), p = index(); return { pack: p.rows.filter(function (r) { return r.origin === 'pack'; }).length, approved: s.entries.filter(function (e) { return e.origin !== 'taught'; }).length, taught: s.entries.filter(function (e) { return e.origin === 'taught'; }).length, drafts: s.drafts.length, conflicts: p.conflicts.length }; }
  function clearAll() { try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  /* Make the base matcher see approved/taught entries too (context only). */
  function attach() {
    var V = root.NiukouVocabulary;
    if (!V || V.__integrated) return V;
    var base = V.match;
    V.match = function (text, limit) {
      var a = base.call(V, text, limit), seen = Object.create(null);
      a.forEach(function (h) { seen[h.term] = 1; });
      matchLocal(text, 3).forEach(function (h) { if (!seen[h.term]) a.push(h); });
      return a.slice(0, limit || 4);
    };
    V.__integrated = true; return V;
  }

  root.NiukouVocabIntegration = { version: VERSION, draftFromResults: draftFromResults, addDraft: addDraft, approve: approve, reject: reject, teach: teach, remove: remove, wasRejected: wasRejected,
    entries: localEntries, drafts: drafts, localTerms: localTerms, index: index, matchLocal: matchLocal, exportLocal: exportLocal, stats: stats, clearAll: clearAll, attach: attach, cleanExtract: cleanExtract, firstSentence: firstSentence, packTerms: packTerms };
  attach();
})(typeof window !== 'undefined' ? window : globalThis);
