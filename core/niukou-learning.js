/* NiukouLearning: self-directed learning loop that stays on this device unless the player opts in to web lookups.
 *  - curiosity queue: unfamiliar terms the player asks about or repeats
 *  - optional "autonomous" lookups (OFF by default; daily cap; one term at a time; every request is logged)
 *  - active learning: remembers uncertain judgements so it can ask the player to confirm
 *  - calibration: compares stated confidence with how often the player confirmed it
 *  - spaced review of terms the player approved or taught
 * It proposes and records. It never changes game state. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', KEY = 'wuxiaNiukouLearningV1';
  var DAY = 24 * 3600 * 1000, STEPS = [1, 3, 7, 14, 30];
  var busy = false, lastAuto = 0, clock = function () { return Date.now(); };

  function fresh() {
    return { v: 1, settings: { autoWeb: false, dailyCap: 6, sources: { wiktionary: true, wikipedia: true, wikidata: true } },
      queue: [], log: [], uncertain: [], stats: { observed: 0, lookups: 0, drafts: 0, approved: 0, rejected: 0, answered: 0 },
      bins: [{ n: 0, ok: 0 }, { n: 0, ok: 0 }, { n: 0, ok: 0 }, { n: 0, ok: 0 }, { n: 0, ok: 0 }], review: {}, day: '', today: 0 };
  }
  function load() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (v && v.v === 1 && v.settings && Array.isArray(v.queue)) { var f = fresh(); return Object.assign(f, v, { settings: Object.assign(f.settings, v.settings), stats: Object.assign(f.stats, v.stats || {}) }); } } catch (e) { /* ignore */ }
    return fresh();
  }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function dayKey() { var d = new Date(clock()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function rollDay(s) { var k = dayKey(); if (s.day !== k) { s.day = k; s.today = 0; } }
  function V() { return root.NiukouVocabIntegration; }

  /* ---- settings ---- */
  function settings() { return load().settings; }
  function setSettings(patch) {
    var s = load();
    if (patch && typeof patch.autoWeb === 'boolean') s.settings.autoWeb = patch.autoWeb;
    if (patch && Number.isInteger(patch.dailyCap)) s.settings.dailyCap = Math.max(1, Math.min(20, patch.dailyCap));
    if (patch && patch.sources) ['wiktionary', 'wikipedia', 'wikidata'].forEach(function (k) { if (typeof patch.sources[k] === 'boolean') s.settings.sources[k] = patch.sources[k]; });
    save(s); return s.settings;
  }

  /* ---- curiosity queue ---- */
  function enqueue(s, term, origin) {
    var item = s.queue.filter(function (x) { return x.term === term; })[0], now = clock();
    if (item) { item.count++; item.lastAt = now; return item; }
    if (V() && (V().wasRejected(term) || V().entries().some(function (e) { return e.term === term; }) || V().drafts().some(function (d) { return d.term === term; }))) return null;
    item = { term: term, count: 1, origin: origin, status: 'pending', attempts: 0, firstAt: now, lastAt: now };
    s.queue.push(item); if (s.queue.length > 40) s.queue = s.queue.slice(-40);
    return item;
  }
  /* ctx: {exclude:[names], history:[texts]} */
  function observe(text, ctx) {
    if (!root.NiukouText) return [];
    var s = load(), found = root.NiukouText.unknownTerms(text, { exclude: ctx && ctx.exclude, history: ctx && ctx.history }), added = [];
    s.stats.observed++;
    found.forEach(function (f) {
      var ok = root.NiukouWebSearch ? root.NiukouWebSearch.isSafeTerm(f.term, { exclude: ctx && ctx.exclude }) : { ok: true, term: f.term };
      if (!ok.ok) return;
      var it = enqueue(s, ok.term, f.origin); if (it) added.push(it.term);
    });
    save(s); return added;
  }
  function addTerm(term, ctx) {
    var ok = root.NiukouWebSearch ? root.NiukouWebSearch.isSafeTerm(term, ctx) : { ok: true, term: term };
    if (!ok.ok) return { ok: false, reason: ok.reason };
    var s = load(), it = enqueue(s, ok.term, 'player'); save(s);
    return it ? { ok: true, term: ok.term } : { ok: false, reason: '已有這個詞或曾被你捨棄' };
  }
  function skip(term) { var s = load(); s.queue.forEach(function (x) { if (x.term === term) x.status = 'skipped'; }); save(s); }
  function queue() { return load().queue.filter(function (x) { return x.status === 'pending' || x.status === 'failed'; }); }

  /* ---- web lookups (manual or autonomous) ---- */
  function logEntry(s, entry) { s.log.push(entry); if (s.log.length > 40) s.log = s.log.slice(-40); }
  async function lookupTerm(term, opts) {
    opts = opts || {};
    var W = root.NiukouWebSearch; if (!W || !V()) return { ok: false, reason: '搜尋模組未載入' };
    var s0 = load(), srcs = Object.keys(s0.settings.sources).filter(function (k) { return s0.settings.sources[k]; });
    if (!srcs.length) return { ok: false, reason: '沒有啟用任何來源' };
    var res;
    try { res = await W.lookup(term, { sources: srcs, exclude: opts.exclude, force: !!opts.force }); }
    catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
    var s = load(); rollDay(s);
    s.stats.lookups++; if (opts.auto) s.today++;
    logEntry(s, { at: clock(), term: res.term, auto: !!opts.auto, sources: srcs, ok: !res.offline, cached: !!res.fromCache });
    var item = s.queue.filter(function (x) { return x.term === res.term; })[0];
    if (res.offline) { if (item) { item.attempts++; item.status = item.attempts >= 3 ? 'skipped' : 'failed'; } save(s); return { ok: false, reason: '目前無法連線', offline: true }; }
    var draft = V().draftFromResults(res.term, res.results);
    if (!draft) { if (item) item.status = 'nothing'; save(s); return { ok: false, reason: '各來源都找不到可用的解釋', results: res.results }; }
    var added = V().addDraft(draft);
    if (item) item.status = 'done';
    if (added.ok) s.stats.drafts++;
    save(s); return { ok: true, draft: draft, stored: added.ok, reason: added.ok ? '' : added.reason, results: res.results };
  }
  /* Called by the game at quiet moments. Does nothing unless the player switched autonomous lookup on. */
  async function tick(ctx) {
    var s = load(); rollDay(s);
    if (!s.settings.autoWeb) return { ran: false, reason: 'disabled' };
    if (busy) return { ran: false, reason: 'busy' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ran: false, reason: 'offline' };
    if (s.today >= s.settings.dailyCap) return { ran: false, reason: 'daily-cap' };
    if (clock() - lastAuto < 5000) return { ran: false, reason: 'cooldown' };
    var next = s.queue.filter(function (x) { return (x.status === 'pending' || x.status === 'failed') && x.attempts < 3 && (x.origin !== 'repeat' || x.count >= 3); })[0];
    if (!next) return { ran: false, reason: 'empty' };
    busy = true; lastAuto = clock();
    try { var r = await lookupTerm(next.term, { auto: true, exclude: ctx && ctx.exclude }); return Object.assign({ ran: true, term: next.term }, r); }
    finally { busy = false; }
  }
  function approveDraft(term, edits) { var r = V().approve(term, edits); if (r.ok) { var s = load(); s.stats.approved++; s.review[term] = { step: 0, next: clock() + STEPS[0] * DAY }; save(s); } return r; }
  function rejectDraft(term) { var ok = V().reject(term); if (ok) { var s = load(); s.stats.rejected++; s.queue.forEach(function (x) { if (x.term === term) x.status = 'skipped'; }); save(s); } return ok; }

  /* ---- active learning & calibration ---- */
  function noteJudgement(text, cat, conf, source) {
    if (!(conf < 0.7) || source === 'memory' || source === 'repeat') return false;
    var s = load(), t = String(text || '').slice(0, 80);
    if (s.uncertain.some(function (u) { return root.NiukouText ? root.NiukouText.similarity(u.t, t) > 0.8 : u.t === t; })) return false;
    s.uncertain.push({ t: t, c: cat, p: +conf.toFixed(2), at: clock() }); if (s.uncertain.length > 8) s.uncertain = s.uncertain.slice(-8);
    save(s); return true;
  }
  function questions(n) { return load().uncertain.slice().sort(function (a, b) { return Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5); }).slice(0, n || 2); }
  function answered(text) { var s = load(); s.uncertain = s.uncertain.filter(function (u) { return u.t !== String(text || '').slice(0, 80); }); s.stats.answered++; save(s); }
  function binOf(conf) { return Math.max(0, Math.min(4, Math.floor((conf - 0.5) * 10))); }
  function recordOutcome(conf, correct) {
    if (typeof conf !== 'number' || conf < 0.5) return;
    var s = load(), b = s.bins[binOf(conf)]; b.n++; if (correct) b.ok++; save(s);
  }
  function calibrated(conf) {
    var b = load().bins[binOf(conf)];
    if (!b || b.n < 8) return conf;
    var acc = b.ok / b.n, w = Math.min(0.6, b.n / 50);
    return +Math.max(0, Math.min(1, conf * (1 - w) + acc * w)).toFixed(3);
  }
  function calibration() { return load().bins.map(function (b, i) { return { range: (50 + i * 10) + '–' + (60 + i * 10) + '%', n: b.n, accuracy: b.n ? +(b.ok / b.n).toFixed(2) : null }; }); }

  /* ---- spaced review ---- */
  function dueReviews() {
    var s = load(), now = clock(), terms = V() ? V().entries() : [];
    return terms.filter(function (e) { var r = s.review[e.term]; return r && r.next <= now; }).slice(0, 3).map(function (e) { return { term: e.term, meaning: e.meaning }; });
  }
  function markReview(term, ok) {
    var s = load(), r = s.review[term] || { step: 0 };
    r.step = ok ? Math.min(STEPS.length - 1, r.step + 1) : 0; r.next = clock() + STEPS[r.step] * DAY; s.review[term] = r; save(s);
  }
  function teachTracked(term, meaning) { var r = V() ? V().teach(term, meaning) : { ok: false }; if (r.ok) { var s = load(); s.review[term] = { step: 0, next: clock() + STEPS[0] * DAY }; save(s); } return r; }

  function summary() {
    var s = load(); rollDay(s);
    return { version: VERSION, autoWeb: s.settings.autoWeb, dailyCap: s.settings.dailyCap, today: s.today, queue: queue().length, drafts: V() ? V().drafts().length : 0, stats: s.stats, log: s.log.slice(-6).reverse(), sources: s.settings.sources, uncertain: s.uncertain.length };
  }
  function clearAll() { try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  root.NiukouLearning = { version: VERSION, settings: settings, setSettings: setSettings, observe: observe, addTerm: addTerm, skip: skip, queue: queue, lookupTerm: lookupTerm, tick: tick,
    approveDraft: approveDraft, rejectDraft: rejectDraft, noteJudgement: noteJudgement, questions: questions, answered: answered, recordOutcome: recordOutcome, calibrated: calibrated, calibration: calibration,
    dueReviews: dueReviews, markReview: markReview, teach: teachTracked, summary: summary, clearAll: clearAll, _setClock: function (f) { clock = f; } };
})(typeof window !== 'undefined' ? window : globalThis);
