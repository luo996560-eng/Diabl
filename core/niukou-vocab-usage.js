/* NiukouVocabUsage: decides which known terms are worth echoing, tracks exposure/mastery, and avoids repetition.
 * Suggestions only; reply text and game state stay under the game's control. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', KEY = 'wuxiaNiukouVocabUseV1', MAX_TERMS = 300, COOLDOWN = 6;
  function load() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (v && v.v === 1 && v.terms) return v; } catch (e) { /* ignore */ }
    return { v: 1, turn: 0, terms: {} };
  }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function matches(text, limit) { return root.NiukouVocabulary && root.NiukouVocabulary.match ? root.NiukouVocabulary.match(text, limit || 6) : []; }
  function prune(s) {
    var keys = Object.keys(s.terms);
    if (keys.length <= MAX_TERMS) return;
    keys.sort(function (a, b) { return (s.terms[a].last || 0) - (s.terms[b].last || 0); }).slice(0, keys.length - MAX_TERMS).forEach(function (k) { delete s.terms[k]; });
  }
  /* Called with what the player said. Terms the player uses become "familiar" and are preferred for echoes. */
  function observePlayer(text) {
    var hits = matches(text, 6); if (!hits.length) return [];
    var s = load(); s.turn++;
    hits.forEach(function (h) {
      var r = s.terms[h.term] || (s.terms[h.term] = { seen: 0, byPlayer: 0, byNiukou: 0, last: 0, lastUsed: -99 });
      r.seen++; r.byPlayer++; r.last = s.turn;
    });
    prune(s); save(s); return hits.map(function (h) { return h.term; });
  }
  function mastery(term) {
    var r = load().terms[term]; if (!r) return 0;
    return Math.min(1, +(0.25 * Math.min(r.byPlayer, 3) + 0.15 * Math.min(r.byNiukou, 3)).toFixed(2));
  }
  /* ctx: {text, emotion (top id), persona, sensitive:boolean}. Returns up to `limit` ranked suggestions. */
  function suggest(ctx, limit) {
    ctx = ctx || {}; var hits = matches(ctx.text || '', 6), s = load(), out = [];
    hits.forEach(function (h) {
      var r = s.terms[h.term] || { byPlayer: 0, byNiukou: 0, lastUsed: -99 };
      var cooling = (s.turn - (r.lastUsed || -99)) < COOLDOWN && r.byNiukou > 0;
      var avoid = (h.avoidWhen || []).join('、');
      var risky = (ctx.sensitive && /反諷|威脅|傷痛|悲|仇/.test(avoid + h.meaning)) || (ctx.emotion === 'sarcasm' && /敬稱|客套|禮數/.test(h.register));
      if (cooling || risky) return;
      var score = 1 + 0.3 * Math.min(r.byPlayer, 3) - 0.2 * Math.min(r.byNiukou, 3) + (h.origin === 'taught' ? 0.4 : 0);
      out.push({ term: h.term, meaning: h.meaning, register: h.register, avoid: (h.avoidWhen || [])[0] || '', origin: h.origin || 'pack', score: +score.toFixed(2) });
    });
    return out.sort(function (a, b) { return b.score - a.score; }).slice(0, limit || 2);
  }
  function record(term) {
    var s = load(), r = s.terms[term] || (s.terms[term] = { seen: 0, byPlayer: 0, byNiukou: 0, last: 0, lastUsed: -99 });
    r.byNiukou++; r.lastUsed = s.turn; r.last = s.turn; save(s);
  }
  /* A short, honest acknowledgement line. `style` may be 'plain' or 'classical'. */
  function echoLine(sug, style) {
    if (!sug) return '';
    var gist = String(sug.meaning || '').split(/[；。]/)[0].slice(0, 36);
    return style === 'classical' ? '「' + sug.term + '」——' + gist + '，在下明白。' : '你提到「' + sug.term + '」，我理解是：' + gist + '。';
  }
  function stats() { var s = load(); var k = Object.keys(s.terms); return { tracked: k.length, familiar: k.filter(function (t) { return s.terms[t].byPlayer >= 2; }).length, turn: s.turn }; }
  function clearAll() { try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  root.NiukouVocabUsage = { version: VERSION, observePlayer: observePlayer, suggest: suggest, record: record, mastery: mastery, echoLine: echoLine, stats: stats, clearAll: clearAll };
})(typeof window !== 'undefined' ? window : globalThis);
