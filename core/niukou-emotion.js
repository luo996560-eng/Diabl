/* NiukouEmotion: richer, data-driven emotion cues (clause-aware negation, intensity, contrast, hypothetical and
 * reported speech, emoticons, sarcasm hints, valence/arousal/dominance, mood trajectory).
 * It only describes tone. It never judges good/evil and never changes game state. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  function norm(t) { return root.NiukouText ? root.NiukouText.normalize(t) : String(t || ''); }
  function packs() { var rt = root.WulinPackRuntime; return rt && rt.all ? rt.all() : []; }
  function emotionPacks() { return packs().map(function (p) { return p.content || {}; }).filter(function (c) { return c.module === 'emotion'; }); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  var HYPO = ['如果', '假如', '若是', '倘若', '要是', '萬一', '假使'];
  var REPORTED = ['他說', '她說', '聽說', '據說', '有人說', '別人說', '傳聞'];
  var DEFAULT_NEG = ['不', '沒', '無', '未', '別'];
  var POS_SARCASM = ['真了不起', '好本事', '真有你的', '可真是', '真是多謝', '真是公正', '真厲害', '佩服佩服', '好極了', '太棒了', '真好'];

  function splitClauses(text) {
    var out = [], re = /[^，,。．！!？?；;：:\n]+[，,。．！!？?；;：:\n]*/g, m;
    while ((m = re.exec(text))) out.push({ text: m[0].replace(/[，,。．！!？?；;：:\n]+$/, ''), tail: (m[0].match(/[，,。．！!？?；;：:\n]+$/) || [''])[0], at: m.index });
    return out;
  }
  function negatedBefore(clause, at, cues) {
    var left = clause.slice(Math.max(0, at - 8), at);
    if (/不過|不然|不但|不僅|不管|不得不|不禁|不愧/.test(left.slice(-3))) return false;
    for (var i = 0; i < cues.length; i++) { var w = cues[i]; if (w && (left.endsWith(w) || left.endsWith(w + '很') || left.endsWith(w + '太') || left.endsWith(w + '那麼'))) return true; }
    return false;
  }
  function intensityBefore(clause, at, mods) {
    var f = 1;
    mods.forEach(function (m) { var left = clause.slice(Math.max(0, at - m.term.length - 2), at); if (left.endsWith(m.term)) f *= m.factor; });
    return f;
  }

  function analyze(rawText, history, opts) {
    opts = opts || {};
    var text = norm(rawText), clauses = splitClauses(text), cats = [], negators = DEFAULT_NEG.slice(), mods = [], contrast = [];
    emotionPacks().forEach(function (c) {
      (c.categories || []).forEach(function (cat) { cats.push(cat); });
      negators = negators.concat(c.negationCues || []); mods = mods.concat(c.intensityCues || []); contrast = contrast.concat(c.contrastCues || []);
    });
    if (!contrast.length) contrast = ['但是', '可是', '然而', '不過', '只是', '卻'];
    negators = negators.filter(function (w, i) { return w && negators.indexOf(w) === i; }).sort(function (a, b) { return b.length - a.length; });
    var contrastAt = -1;
    clauses.forEach(function (cl, i) { if (contrastAt < 0 && contrast.some(function (w) { return cl.text.indexOf(w) === 0 || cl.text.indexOf(w) > 0; })) contrastAt = i; });
    var scores = Object.create(null), suppressed = Object.create(null);
    cats.forEach(function (cat) { scores[cat.id] = { cat: cat, score: 0, cues: [], negated: false }; });
    var exclaims = (text.match(/[！!]/g) || []).length;
    clauses.forEach(function (cl, ci) {
      var hypo = HYPO.some(function (w) { return cl.text.indexOf(w) >= 0; });
      var reported = REPORTED.some(function (w) { return cl.text.indexOf(w) >= 0; });
      var pos = contrastAt < 0 ? 1 : (ci < contrastAt ? 0.7 : (ci === contrastAt ? 1.15 : 1.15));
      var tailBoost = /[！!]{2,}/.test(cl.tail) ? 1.3 : (/[！!]/.test(cl.tail) ? 1.12 : 1);
      cats.forEach(function (cat) {
        var rec = scores[cat.id];
        (cat.cues || []).forEach(function (cue) {
          var from = 0, at;
          while ((at = cl.text.indexOf(cue.term, from)) >= 0) {
            from = at + cue.term.length;
            if (negatedBefore(cl.text, at, negators)) { rec.negated = true; suppressed[cat.id] = true; continue; }
            var w = (cue.weight || 0.5) * intensityBefore(cl.text, at, mods) * pos * tailBoost;
            if (hypo) w *= 0.5; if (reported) w *= 0.45;
            rec.score += w; rec.cues.push(cue.term);
          }
        });
        (cat.emoticons || []).forEach(function (em) { if (em && text.indexOf(em) >= 0 && cl.text.indexOf(em) >= 0) { rec.score += 0.45; rec.cues.push(em); } });
      });
    });
    var found = [];
    Object.keys(scores).forEach(function (id) {
      var r = scores[id]; if (r.score <= 0) return;
      var uniq = r.cues.filter(function (c, i) { return r.cues.indexOf(c) === i; });
      found.push({ id: id, label: r.cat.label, score: clamp(r.score / 1.5, 0, 1), valence: r.cat.valence, arousal: r.cat.arousal, dominance: typeof r.cat.dominance === 'number' ? r.cat.dominance : 0, cues: uniq.slice(0, 4), responseNeed: r.cat.responseNeed, negated: !!suppressed[id] });
    });
    found.sort(function (a, b) { return b.score - a.score; });
    // sarcasm: praise phrases while history or clause polarity is negative, flat laughter, trailing ellipsis
    var sarcasm = { score: 0, reasons: [] };
    var posHit = POS_SARCASM.some(function (w) { return text.indexOf(w) >= 0; });
    var histNeg = false;
    (Array.isArray(history) ? history.slice(-3) : []).forEach(function (m) { var b = typeof m === 'string' ? m : m && m.text || ''; if (/失望|生氣|憑什麼|不公|可惡|背叛|白費|無用/.test(norm(b))) histNeg = true; });
    var negNear = found.some(function (e) { return e.valence < -0.3 && e.id !== 'sarcasm' && e.score >= 0.3; });
    if (posHit && (histNeg || negNear)) { sarcasm.score += 0.55; sarcasm.reasons.push('讚語出現在負面脈絡'); }
    if (/呵呵|哈{1}\.{2,}|^好[啊吧]?[。.]$/.test(text)) { sarcasm.score += 0.25; sarcasm.reasons.push('平淡或冷笑式回應'); }
    if (/[，,]卻|偏偏|倒是|還真/.test(text) && posHit) { sarcasm.score += 0.15; sarcasm.reasons.push('轉折加讚語'); }
    if (found.some(function (e) { return e.id === 'sarcasm' && e.score >= 0.3; })) { sarcasm.score += 0.35; sarcasm.reasons.push('詞庫反諷線索'); }
    sarcasm.score = clamp(sarcasm.score, 0, 1);
    // aggregate VAD
    var wsum = 0, v = 0, a = 0, d = 0;
    found.slice(0, 3).forEach(function (e) { wsum += e.score; v += e.valence * e.score; a += e.arousal * e.score; d += e.dominance * e.score; });
    var vad = wsum ? { valence: +(v / wsum).toFixed(2), arousal: +(a / wsum).toFixed(2), dominance: +(d / wsum).toFixed(2) } : { valence: 0, arousal: 0, dominance: 0 };
    if (sarcasm.score >= 0.6) vad.valence = Math.min(vad.valence, -0.3);
    var top = found[0] || null, second = found[1] || null;
    var mixed = !!(top && second && second.score >= 0.3 && Math.abs(top.score - second.score) <= 0.2 && top.valence * second.valence < 0);
    var intensity = top ? clamp(top.score * (0.6 + 0.4 * clamp(top.arousal, 0, 1)) + Math.min(exclaims, 3) * 0.04, 0, 1) : 0;
    return { version: VERSION, emotions: found.slice(0, 3), dominant: top ? top.id : null, vad: vad, intensity: +intensity.toFixed(2), mixed: mixed, sarcasm: sarcasm, negatedCues: Object.keys(suppressed), neutral: !top };
  }

  /* Mood trajectory: exponential moving average of valence/arousal over turns. */
  function newMood() { return { n: 0, valence: 0, arousal: 0, dominance: 0, last: null, trend: 'steady', history: [] }; }
  function updateMood(mood, result) {
    var m = Object.assign(newMood(), mood || {}), r = result && result.vad ? result : { vad: { valence: 0, arousal: 0, dominance: 0 }, dominant: null };
    var keep = 0.65, prev = m.valence;
    var weight = result && result.neutral ? 0.15 : 1;
    m.valence = +(m.valence * (1 - (1 - keep) * weight) + r.vad.valence * (1 - keep) * weight).toFixed(3);
    m.arousal = +(m.arousal * (1 - (1 - keep) * weight) + r.vad.arousal * (1 - keep) * weight).toFixed(3);
    m.dominance = +(m.dominance * (1 - (1 - keep) * weight) + r.vad.dominance * (1 - keep) * weight).toFixed(3);
    m.n += 1; m.last = r.dominant;
    m.history = (m.history || []).concat([+m.valence.toFixed(2)]).slice(-12);
    var diff = m.valence - prev;
    m.trend = diff > 0.06 ? 'improving' : diff < -0.06 ? 'worsening' : 'steady';
    return m;
  }
  function moodLabel(mood) {
    if (!mood || !mood.n) return '尚無資料';
    var t = mood.trend === 'improving' ? '轉好' : mood.trend === 'worsening' ? '轉差' : '平穩';
    var base = mood.valence > 0.25 ? '偏愉快' : mood.valence < -0.25 ? '偏低落' : '中性';
    return base + '・' + t;
  }
  root.NiukouEmotion = { version: VERSION, analyze: analyze, newMood: newMood, updateMood: updateMood, moodLabel: moodLabel };
})(typeof window !== 'undefined' ? window : globalThis);
