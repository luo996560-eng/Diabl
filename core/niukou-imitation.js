/* NiukouImitation: learns the player's own speaking habits (length, register, particles, favourite known words)
 * from what the player types, entirely on this device, and offers gentle mirroring of Niukou's own wording.
 * It never imitates other people, never stores full sentences, and never touches NPC lines or game state. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', KEY = 'wuxiaNiukouStyleV1';
  function stylePack() {
    var rt = root.WulinPackRuntime, all = rt && rt.all ? rt.all() : [];
    for (var i = 0; i < all.length; i++) if (all[i].content && all[i].content.module === 'style') return all[i].content;
    return null;
  }
  function empty() { return { v: 1, n: 0, len: 0, exclaim: 0, question: 0, ellipsis: 0, emoji: 0, reg: { classical: 0, casual: 0, rough: 0, polite: 0 }, particles: {}, fav: {} }; }
  function load() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (v && v.v === 1 && v.reg) return v; } catch (e) { /* ignore */ }
    return empty();
  }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function norm(t) { return root.NiukouText ? root.NiukouText.normalize(t) : String(t || ''); }
  function ema(prev, x, n) { var a = n < 6 ? 1 / (n + 1) : 0.18; return +(prev * (1 - a) + x * a).toFixed(3); }
  function observe(text) {
    var raw = String(text || '').trim(); if (Array.from(raw).length < 2) return null;
    var s = load(), t = norm(raw), pk = stylePack(), surf = root.NiukouText ? root.NiukouText.surface(t) : { length: t.length, exclaim: 0, question: 0, ellipsis: 0, emoji: 0 };
    s.len = ema(s.len, surf.length, s.n); s.exclaim = ema(s.exclaim, Math.min(surf.exclaim, 3), s.n);
    s.question = ema(s.question, Math.min(surf.question, 2), s.n); s.ellipsis = ema(s.ellipsis, Math.min(surf.ellipsis, 2), s.n); s.emoji = ema(s.emoji, Math.min(surf.emoji, 3), s.n);
    var maxFav = (pk && pk.limits && pk.limits.maxFavoriteWords) || 24;
    if (pk) pk.registers.forEach(function (r) {
      var hit = (r.cues || []).filter(function (c) { return t.indexOf(c) >= 0; }).length;
      s.reg[r.id] = ema(s.reg[r.id] || 0, Math.min(hit, 3), s.n);
      (r.particles || []).forEach(function (p) { if (r.id === 'casual' && t.slice(-3).indexOf(p) >= 0) s.particles[p] = (s.particles[p] || 0) + 1; });
    });
    // favourite words: only words already known to the vocabulary (never arbitrary fragments of the sentence)
    (root.NiukouText ? root.NiukouText.words(t) : []).forEach(function (w) { if (!root.NiukouText.stopwords[w]) s.fav[w] = (s.fav[w] || 0) + 1; });
    var keys = Object.keys(s.fav); if (keys.length > maxFav) keys.sort(function (a, b) { return s.fav[b] - s.fav[a]; }).slice(maxFav).forEach(function (k) { delete s.fav[k]; });
    s.n++; save(s); return summary(s);
  }
  function summary(sIn) {
    var s = sIn || load(), regs = Object.keys(s.reg).sort(function (a, b) { return s.reg[b] - s.reg[a]; });
    var dom = s.n >= 3 && s.reg[regs[0]] >= 0.35 ? regs[0] : 'plain';
    var label = { classical: '古風文言', casual: '口語輕鬆', rough: '粗獷直率', polite: '客氣有禮', plain: '平實白話' }[dom];
    return { n: s.n, avgLength: Math.round(s.len), length: s.len < 8 ? 'terse' : s.len > 22 ? 'verbose' : 'balanced', register: dom, label: label,
      exclaims: s.exclaim >= 0.5, asks: s.question >= 0.5, ellipsis: s.ellipsis >= 0.4, favorites: Object.keys(s.fav).sort(function (a, b) { return s.fav[b] - s.fav[a]; }).slice(0, 6), ready: s.n >= 5 };
  }
  function applySwaps(text, pairs, max) {
    var out = text, done = [];
    (pairs || []).forEach(function (p) { if (done.length >= max) return; if (out.indexOf(p[0]) >= 0) { out = out.split(p[0]).join(p[1]); done.push(p[0] + '→' + p[1]); } });
    return { text: out, applied: done };
  }
  /* Mirror Niukou's own wording toward the player's habits. Returns {text, applied[]}. */
  function mirror(reply, opts) {
    var original = String(reply || ''), prof = summary(), pk = stylePack(), applied = [];
    if (!pk || !prof.ready) return { text: original, applied: [], ready: prof.ready };
    var text = original, maxChars = (pk.limits && pk.limits.maxMirrorChars) || 60;
    var cls = pk.registers.filter(function (r) { return r.id === 'classical'; })[0];
    if (prof.register === 'classical' && cls) { var r = applySwaps(text, cls.toClassical, 4); text = r.text; applied = applied.concat(r.applied); }
    else if (prof.register === 'plain' && cls) { var r2 = applySwaps(text, cls.toPlain, 4); text = r2.text; applied = applied.concat(r2.applied); }
    if (prof.length === 'terse') {
      var first = (text.match(/[^。！？]+[。！？]?/g) || [text]).slice(0, 2).join('');
      if (first && first.length < text.length && Array.from(first).length <= maxChars) { text = first; applied.push('簡短'); }
    }
    if (prof.register === 'casual' && /[。]$/.test(text) && !/[啦喔呀嘛吧呢]。$/.test(text)) {
      var s = load(), ps = Object.keys(s.particles).sort(function (a, b) { return s.particles[b] - s.particles[a]; });
      var p = ps[0] || '喔'; text = text.replace(/。$/, p + '。'); applied.push('語尾「' + p + '」');
    }
    return { text: text, applied: applied, ready: true };
  }
  function reset() { try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  root.NiukouImitation = { version: VERSION, observe: observe, summary: summary, mirror: mirror, reset: reset };
})(typeof window !== 'undefined' ? window : globalThis);
