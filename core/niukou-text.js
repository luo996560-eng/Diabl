/* NiukouText: local text utilities (script normalization, segmentation, term extraction, synonyms).
 * - Simplified->Traditional uses the character table from the OpenCC project (Apache-2.0), shipped as a data pack.
 * - Segmentation follows the dictionary-DAG + dynamic-programming idea popularised by jieba (MIT), using only the
 *   game's own pack vocabulary, so it needs no extra dictionary download.
 * Nothing here talks to the network or writes game state. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var cache = { key: '', s2t: null, simp: null, amb: null, dict: null, maxLen: 1, syn: null, known: null };

  function runtimePacks() {
    var rt = root.WulinPackRuntime;
    return rt && typeof rt.all === 'function' ? rt.all() : [];
  }
  function packKey(packs) { return packs.map(function (p) { return p.id + '@' + p.version; }).join('|'); }

  /* A small built-in list so segmentation still works before packs finish loading. */
  var FUNCTION_WORDS = ['我們', '你們', '他們', '她們', '咱們', '自己', '什麼', '怎麼', '為什麼', '為何', '因為', '所以', '如果', '假如', '但是', '可是', '然而', '不過', '只是', '而且', '或者', '還是', '已經', '正在', '一定', '可能', '也許', '應該', '必須', '需要', '想要', '希望', '知道', '覺得', '認為', '喜歡', '討厭', '時候', '現在', '以後', '以前', '今天', '明天', '昨天', '這個', '那個', '這裡', '那裡', '這樣', '那樣', '沒有', '不是', '不會', '不能', '不要', '不用', '可以', '能夠', '一起', '一下', '一些', '非常', '特別', '真的', '當然', '其實', '終於', '馬上', '剛才', '後來', '然後', '請問', '謝謝', '對不起', '你好'];
  var STOP = {};
  FUNCTION_WORDS.concat(['我', '你', '他', '她', '它', '的', '了', '是', '在', '有', '和', '與', '也', '都', '就', '還', '很', '不', '沒', '要', '會', '能', '把', '被', '讓', '對', '到', '說', '去', '來', '做', '這', '那', '嗎', '呢', '吧', '啊', '啦', '喔', '呀']).forEach(function (w) { STOP[w] = true; });

  function build() {
    var packs = runtimePacks(), key = packKey(packs);
    if (cache.key === key && cache.dict) return cache;
    var s2t = Object.create(null), simp = Object.create(null), amb = Object.create(null);
    var dict = Object.create(null), maxLen = 1, syn = Object.create(null), known = Object.create(null);
    function add(word, weight) {
      if (typeof word !== 'string') return;
      var w = word.trim();
      if (w.length < 2 || w.length > 12) return;
      if (!dict[w] || dict[w] < weight) dict[w] = weight;
      if (w.length > maxLen) maxLen = w.length;
      known[w] = true;
    }
    FUNCTION_WORDS.forEach(function (w) { add(w, 1.2); });
    packs.forEach(function (p) {
      var c = p && p.content || {};
      if (c.module === 'script') {
        for (var i = 0; i + 1 < (c.s2t || '').length; i += 2) s2t[c.s2t.charAt(i)] = c.s2t.charAt(i + 1);
        (c.simplifiedOnly || '').split('').forEach(function (ch) { simp[ch] = true; });
        (c.ambiguous || []).forEach(function (a) { amb[a.ch] = a; });
      }
      (c.entries || []).forEach(function (e) { add(e.term, 3); (e.aliases || []).forEach(function (a) { add(a, 2.6); }); });
      (c.glossary || []).forEach(function (e) { add(e.term, 3); });
      (c.groups || []).forEach(function (g) {
        (g.members || []).forEach(function (m) { add(m, 2.2); (syn[m] = syn[m] || []).push(g.id); });
      });
      (c.categories || []).forEach(function (cat) { (cat.cues || []).forEach(function (cue) { add(cue.term, 2); }); });
      (c.cues || []).forEach(function (cue) { (cue.terms || []).forEach(function (t) { add(t, 2); }); });
      (c.acts || []).forEach(function (a) { (a.cues || []).forEach(function (t) { add(t, 1.8); }); });
      (c.topics || []).forEach(function (t) { (t.terms || []).forEach(function (w) { add(w, 2.2); }); });
    });
    var extra = root.NiukouVocabIntegration && root.NiukouVocabIntegration.localTerms ? root.NiukouVocabIntegration.localTerms() : [];
    extra.forEach(function (w) { add(w, 3); });
    cache = { key: key, s2t: s2t, simp: simp, amb: amb, dict: dict, maxLen: maxLen, syn: syn, known: known };
    return cache;
  }
  function refresh() { cache.key = ''; return build(); }

  function isCJK(ch) { var c = ch.charCodeAt(0); return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf); }

  /* ---- script normalization ---- */
  function looksSimplified(text, st) {
    for (var i = 0; i < text.length; i++) if (st.simp[text.charAt(i)]) return true;
    return false;
  }
  function convertScript(text, st) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i), a = st.amb[ch];
      if (a) {
        var win = text.slice(Math.max(0, i - 3), i) + text.slice(i + 1, i + 4), to = a.default;
        for (var r = 0; r < a.rules.length; r++) {
          if (a.rules[r].near.some(function (n) { return win.indexOf(n) >= 0; })) { to = a.rules[r].to; break; }
        }
        out += to;
      } else out += st.s2t[ch] || ch;
    }
    return out;
  }
  function cleanInput(text) {
    var s = String(text == null ? '' : text);
    if (s.normalize) s = s.normalize('NFC');
    s = s.replace(/[\u200b-\u200d\ufeff\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    s = s.replace(/[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); });
    return s.replace(/[ \t\u3000]+/g, ' ').trim();
  }
  function toTraditional(text) {
    var s = cleanInput(text), st = build();
    if (!st.simp || !Object.keys(st.simp).length || !looksSimplified(s, st)) return { text: s, converted: false };
    return { text: convertScript(s, st), converted: true };
  }
  function normalize(text) { return toTraditional(text).text; }

  /* ---- segmentation (dictionary DAG + max-score DP) ---- */
  function segment(text) {
    var s = normalize(text), st = build(), tokens = [], i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (!isCJK(ch)) {
        var j = i + 1;
        if (/[A-Za-z0-9]/.test(ch)) { while (j < s.length && /[A-Za-z0-9_]/.test(s.charAt(j))) j++; tokens.push({ t: s.slice(i, j), kind: 'latin' }); }
        else if (!/\s/.test(ch)) tokens.push({ t: ch, kind: 'punct' });
        i = j; continue;
      }
      var k = i; while (k < s.length && isCJK(s.charAt(k))) k++;
      var run = s.slice(i, k), n = run.length, best = new Array(n + 1), cut = new Array(n + 1);
      best[n] = 0;
      for (var a = n - 1; a >= 0; a--) {
        best[a] = best[a + 1] - 1.5; cut[a] = 1; // an unknown single character is a mild penalty
        for (var len = Math.min(st.maxLen, n - a); len >= 2; len--) {
          var w = run.substr(a, len), weight = st.dict[w];
          if (weight) {
            var sc = best[a + len] + weight * Math.pow(len, 1.4);
            if (sc > best[a]) { best[a] = sc; cut[a] = len; }
          }
        }
      }
      var p = 0;
      while (p < n) { var l = cut[p]; tokens.push({ t: run.substr(p, l), kind: l > 1 ? 'word' : 'char' }); p += l; }
      i = k;
    }
    return tokens;
  }
  function words(text) { return segment(text).filter(function (x) { return x.kind === 'word'; }).map(function (x) { return x.t; }); }

  /* ---- n-grams, similarity ---- */
  function bigrams(text) {
    var cs = Array.from(normalize(text).replace(/[\s，,。．.！!？?；;：:、「」『』（）()…—\-~～]/g, '')), out = [];
    for (var i = 0; i < cs.length - 1; i++) out.push(cs[i] + cs[i + 1]);
    return out;
  }
  function similarity(a, b) {
    var A = bigrams(a), B = bigrams(b);
    if (!A.length || !B.length) return normalize(a) === normalize(b) ? 1 : 0;
    var sa = Object.create(null), inter = 0, union = 0;
    A.forEach(function (g) { sa[g] = 1; });
    var sb = Object.create(null);
    B.forEach(function (g) { if (!sb[g]) { sb[g] = 1; if (sa[g]) inter++; } });
    union = Object.keys(sa).length + Object.keys(sb).length - inter;
    return union ? inter / union : 0;
  }

  /* ---- synonyms ---- */
  function synonymTags(text) {
    var st = build(), s = normalize(text), seen = Object.create(null), out = [];
    Object.keys(st.syn).forEach(function (m) {
      if (m.length < 2 || s.indexOf(m) < 0) return;
      st.syn[m].forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    });
    return out;
  }

  /* ---- unknown-term extraction (for the curiosity queue) ---- */
  var PATTERNS = [
    /[「『【]([\u4e00-\u9fff]{2,8})[」』】]/g,
    /(?:什麼是|何謂|啥是|什麼叫做?|何為)([\u4e00-\u9fff]{2,8})/g,
    /([\u4e00-\u9fff]{2,8})(?:是什麼意思|是什麼|是啥|是何意|什麼意思|何解|怎麼解釋)/g,
    /(?:聽說過|聽過|知道)([\u4e00-\u9fff]{2,6})(?:嗎|麼|沒有|否)/g
  ];
  function unknownTerms(text, opts) {
    opts = opts || {};
    var s = normalize(text), st = build(), found = [], seen = Object.create(null), exclude = Object.create(null);
    (opts.exclude || []).forEach(function (w) { if (w) exclude[String(w)] = true; });
    PATTERNS.forEach(function (re) {
      re.lastIndex = 0; var m;
      while ((m = re.exec(s))) {
        var t = m[1];
        if (!t || seen[t] || STOP[t] || st.known[t] || exclude[t]) continue;
        if (/^[我你他她它這那哪]/.test(t) && t.length <= 3) continue;
        seen[t] = 1; found.push({ term: t, origin: 'pattern' });
      }
    });
    if (opts.history && opts.history.length) {
      var counts = Object.create(null);
      opts.history.concat([s]).forEach(function (line) {
        var runs = String(line || '').match(/[\u4e00-\u9fff]{2,4}/g) || [];
        runs.forEach(function (r) { for (var n = 2; n <= Math.min(4, r.length); n++) for (var i = 0; i + n <= r.length; i++) { var g = r.substr(i, n); if (!STOP[g] && !st.known[g] && !exclude[g]) counts[g] = (counts[g] || 0) + 1; } });
      });
      Object.keys(counts).filter(function (g) { return counts[g] >= 3 && g.length >= 3 && s.indexOf(g) >= 0; }).slice(0, 2).forEach(function (g) {
        if (!seen[g]) { seen[g] = 1; found.push({ term: g, origin: 'repeat' }); }
      });
    }
    return found.slice(0, 4);
  }

  /* ---- cues for emoticons / punctuation intensity ---- */
  function surface(text) {
    var s = String(text || '');
    return {
      length: Array.from(s).length,
      exclaim: (s.match(/[！!]/g) || []).length,
      question: (s.match(/[？?]/g) || []).length,
      ellipsis: (s.match(/…|\.{3,}|。{3,}/g) || []).length,
      repeatChars: (s.match(/([\u4e00-\u9fff])\1{1,}/g) || []).length,
      latin: (s.match(/[A-Za-z]/g) || []).length,
      emoji: (s.match(/[\u2600-\u27bf\ud83c-\ud83e][\ud000-\udfff]?/g) || []).length
    };
  }

  root.NiukouText = {
    version: VERSION, normalize: normalize, toTraditional: toTraditional, segment: segment, words: words,
    similarity: similarity, bigrams: bigrams, synonymTags: synonymTags, unknownTerms: unknownTerms, surface: surface,
    isKnown: function (t) { return !!build().known[normalize(t)]; }, refresh: refresh, isCJK: isCJK, stopwords: STOP
  };
})(typeof window !== 'undefined' ? window : globalThis);
