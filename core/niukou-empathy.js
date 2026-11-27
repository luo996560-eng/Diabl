/* NiukouEmpathy: turns an emotion analysis into a short, persona-aware empathic stance.
 * Output is text and metadata only. It never changes attitude, rewards or any game state. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  function dialoguePack() {
    var rt = root.WulinPackRuntime, all = rt && rt.all ? rt.all() : [];
    for (var i = 0; i < all.length; i++) if (all[i].content && all[i].content.module === 'dialogue') return all[i].content;
    return null;
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pickStable(list, seed, used) {
    if (!list || !list.length) return '';
    var fresh = list.filter(function (x) { return !used || used.indexOf(x) < 0; });
    var pool = fresh.length ? fresh : list;
    return pool[hash(String(seed)) % pool.length];
  }
  function toneFor(pack, trait) {
    var t = (pack && pack.tones || []).filter(function (x) { return x.id === trait; })[0];
    return t || { id: trait || 'neutral', pre: [], post: [] };
  }
  /* analysis: result of NiukouEmotion.analyze; ctx: {persona, used[], count, unsafe, seed, cap}
   * stance: validate (acknowledge), ask (invite detail), celebrate (share joy), steady (calm), none */
  function plan(analysis, ctx) {
    ctx = ctx || {};
    var pack = dialoguePack(), cap = (pack && pack.policy && pack.policy.maxEmpathyPerDialogue) || 3;
    var none = function (why) { return { stance: 'none', reason: why, line: '', emotion: null, followUp: '' }; };
    if (!analysis) return none('no-analysis');
    if (ctx.unsafe) return none('unsafe-signal');
    if (typeof ctx.count === 'number' && ctx.count >= (ctx.cap || cap)) return none('cap-reached');
    var tone = toneFor(pack, ctx.persona || 'neutral');
    if (tone.skip) return none('persona-declines');
    var top = analysis.emotions && analysis.emotions[0];
    var id = null;
    if (analysis.sarcasm && analysis.sarcasm.score >= 0.6) id = 'sarcasm';
    else if (top && top.score >= (ctx.minScore || 0.35)) id = top.id;
    if (!id) return none('no-clear-emotion');
    var rows = pack ? pack.empathy.filter(function (e) { return e.emotion === id; }) : [];
    if (!rows.length) return none('no-template');
    var row = rows[0], seed = (ctx.seed || '') + id;
    var base = pickStable(row.validate, seed, ctx.used);
    var pre = pickStable(tone.pre, seed + 'p'), post = pickStable(tone.post, seed + 'q');
    var positive = top && top.valence > 0.3 && id !== 'sarcasm';
    var stance = positive ? 'celebrate' : (analysis.mixed ? 'ask' : (top && top.arousal >= 0.7 && top.valence < 0 ? 'steady' : 'validate'));
    var ask = row.ask && row.ask.length && (stance === 'validate' || stance === 'ask') ? pickStable(row.ask, seed + 'a', ctx.used) : '';
    if (analysis.mixed && !ask) ask = '你心裡似乎有兩種心情，哪一種更重一些？';
    return { stance: stance, emotion: id, label: id === 'sarcasm' ? '話裡帶刺' : top.label, line: pre + base + post, followUp: ask, reason: 'emotion:' + id, persona: tone.id, intensity: analysis.intensity || 0 };
  }
  function compose(p, opts) {
    if (!p || p.stance === 'none' || !p.line) return '';
    return p.line + (opts && opts.withAsk && p.followUp ? p.followUp : '');
  }
  /* Reflective listening for the lab: restates the clue words the analysis relied on. */
  function reflect(analysis) {
    var top = analysis && analysis.emotions && analysis.emotions[0];
    if (!top) return '';
    var cue = top.cues && top.cues[0] ? '（你提到「' + top.cues[0] + '」）' : '';
    return '聽起來你有些' + top.label + cue + '。';
  }
  root.NiukouEmpathy = { version: VERSION, plan: plan, compose: compose, reflect: reflect, toneFor: function (t) { return toneFor(dialoguePack(), t); } };
})(typeof window !== 'undefined' ? window : globalThis);
