/* 鈕釦・自由回應判定 v0.1.0
 * 玩家不打選項，直接用自己的話說明行動；本模組只做「善／中立／惡／無關」判定與選項對應，
 * 不直接修改遊戲狀態。實際效果仍由原本的 choose(index) 流程發放。
 */
(function (root) {
  'use strict';

  var EVIL = [
    ['殺害', 1.3], ['滅口', 1.3], ['下毒', 1.3], ['毒害', 1.2], ['殺', 1.2],
    ['搶劫', 1.2], ['打劫', 1.2], ['搶奪', 1.1], ['搶', 1.0], ['搜刮', 1.1],
    ['盜取', 1.1], ['偷', 1.0], ['盜', 1.0], ['竊', 1.1], ['詐', 1.1], ['騙', 0.9],
    ['拐', 1.0], ['擄', 1.1], ['綁', 1.0], ['勒索', 1.2], ['脅迫', 1.2], ['威脅', 1.1],
    ['恐嚇', 1.1], ['逼迫', 1.0], ['逼', 0.7], ['羞辱', 1.0], ['嘲笑', 0.7], ['譏', 0.7],
    ['出賣', 1.2], ['背叛', 1.1], ['賣掉', 1.1], ['私吞', 1.1], ['佔為己有', 1.1],
    ['栽贓', 1.2], ['偽證', 1.2], ['撒謊', 0.9], ['說謊', 0.9], ['強取', 1.1], ['霸佔', 1.1],
    ['見死不救', 1.2], ['冷眼旁觀', 1.0], ['視而不見', 1.0], ['丟下', 0.9],
    ['砍', 1.1], ['揍', 1.0], ['踹', 1.0], ['砸', 1.0], ['放火', 1.2], ['縱火', 1.2],
    ['燒', 1.0], ['打', 0.5], ['坑', 0.8], ['不管', 0.6], ['不理', 0.6]
  ];
  var GOOD = [
    ['相救', 1.3], ['搭救', 1.2], ['救助', 1.2], ['施救', 1.2], ['救', 1.2],
    ['仗義', 1.2], ['相助', 1.1], ['幫助', 1.1], ['幫', 1.0], ['出手', 0.6],
    ['收留', 1.1], ['收養', 1.1], ['照顧', 1.0], ['陪伴', 1.0], ['安慰', 1.0], ['開導', 0.9],
    ['歸還', 1.2], ['奉還', 1.2], ['原封不動', 1.1], ['還', 0.5],
    ['送醫', 1.2], ['請大夫', 1.1], ['醫治', 1.0], ['療傷', 1.0], ['扶', 0.9], ['攙', 0.9],
    ['施捨', 1.0], ['捐', 1.0], ['分文不取', 1.2], ['贈', 0.9], ['送', 0.5],
    ['報官', 1.0], ['送官', 1.0], ['稟告', 1.0], ['公開真相', 1.2], ['揭穿', 0.9],
    ['阻止', 1.0], ['掩護', 1.0], ['護送', 1.2], ['擋', 0.8], ['攔', 0.7],
    ['提醒', 0.9], ['指路', 1.1], ['贖', 1.0], ['賠', 0.9], ['認錯', 1.0], ['道歉', 0.9]
  ];
  var NEUTRAL = [
    ['不插手', 1.0], ['觀察', 0.9], ['打聽', 0.9], ['詢問', 0.8], ['思索', 0.8],
    ['考慮', 0.8], ['想想', 0.7], ['婉拒', 0.9], ['拒絕', 0.8], ['離開', 0.8],
    ['走開', 0.8], ['繞道', 0.8], ['沉默', 0.9], ['點頭', 0.7], ['觀望', 0.9],
    ['記下', 0.8], ['記錄', 0.8], ['等待', 0.8], ['討價', 0.8], ['交易', 0.7],
    ['問', 0.6], ['看', 0.6], ['買', 0.6], ['賣', 0.6], ['談', 0.6]
  ];
  var NON_NEGATING = ['不過', '不然', '不但', '不僅', '不管', '不得不', '無非', '無論', '非常', '未嘗'];
  var NEGATORS = /(不|沒|無|未|別|勿|莫|沒能|無法|拒絕)$/;

  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/[\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[，。！？、；：「」『』（）()…—－\-]/g, ' ')
      .trim();
  }
  function negatedAt(text, at) {
    var left = text.slice(Math.max(0, at - 4), at);
    for (var i = 0; i < NON_NEGATING.length; i++) if (left.endsWith(NON_NEGATING[i])) return false;
    return NEGATORS.test(left);
  }
  function mask(text, at, len) {
    return text.slice(0, at) + new Array(len + 1).join('\u25FB') + text.slice(at + len);
  }
  function bigrams(text) {
    var t = normalize(text).replace(/ /g, ''), out = {}, i;
    if (t.length < 2) { if (t) out[t] = 1; return out; }
    for (i = 0; i < t.length - 1; i++) { var g = t.slice(i, i + 2); out[g] = (out[g] || 0) + 1; }
    return out;
  }
  function dice(a, b) {
    var x = bigrams(a), y = bigrams(b), keys = Object.keys(x), inter = 0, nx = 0, ny = 0, k;
    if (!keys.length || !Object.keys(y).length) return 0;
    for (k in x) nx += x[k];
    for (k in y) ny += y[k];
    keys.forEach(function (g) { if (y[g]) inter += Math.min(x[g], y[g]); });
    return (2 * inter) / (nx + ny);
  }
  function collect(text) {
    var work = normalize(text), all = [], hits = [], p;
    ['evil', 'good', 'neutral'].forEach(function (path) {
      var table = path === 'evil' ? EVIL : path === 'good' ? GOOD : NEUTRAL;
      table.forEach(function (row) { all.push({ path: path, term: row[0], w: row[1] }); });
    });
    all.sort(function (a, b) { return b.term.length - a.term.length; });
    all.forEach(function (cue) {
      var at;
      while ((at = work.indexOf(cue.term)) >= 0) {
        var neg = negatedAt(work, at);
        hits.push({ path: cue.path, term: cue.term, weight: cue.w, negated: neg });
        work = mask(work, at, cue.term.length);
      }
    });
    return { hits: hits, rest: work };
  }

  function judge(text, ctx) {
    var raw = String(text == null ? '' : text), norm = normalize(raw);
    var options = (ctx && ctx.options) || [];
    if (norm.replace(/ /g, '').length < 2) {
      return { path: 'off', confidence: 0, relevant: false, hits: [], target: null, reason: 'empty', text: raw };
    }
    var found = collect(raw), scores = { good: 0, neutral: 0, evil: 0 }, notes = [];
    found.hits.forEach(function (h) {
      if (h.negated) {
        // 否定語境：拒絕行善 → 轉為冷淡（弱惡），否定作惡 → 視為未行動
        if (h.path === 'good') { scores.evil += h.weight * 0.45; notes.push('否定「' + h.term + '」→ 冷淡'); }
        else if (h.path === 'evil') { scores.neutral += h.weight * 0.4; notes.push('否定「' + h.term + '」'); }
        return;
      }
      scores[h.path] += h.weight;
      if (notes.indexOf(h.term) < 0) notes.push(h.term);
    });
    var best = 'neutral', top = 0, second = 0;
    ['evil', 'good', 'neutral'].forEach(function (p) {
      if (scores[p] > top) { second = top; top = scores[p]; best = p; }
      else if (scores[p] > second) second = scores[p];
    });
    var sims = options.map(function (o, i) {
      return { index: o.index != null ? o.index : i, path: o.path || 'neutral', text: o.text || '', sim: dice(raw, o.text || '') };
    });
    var maxSim = sims.reduce(function (m, s) { return Math.max(m, s.sim); }, 0);
    if (top <= 0) {
      // 沒有任何行為線索：只有與某個選項用語高度重疊才算切題
      if (maxSim >= 0.1) {
        var near = sims.slice().sort(function (a, b) { return b.sim - a.sim; })[0];
        return { path: near.path, confidence: 0.45, relevant: true, hits: [], target: near, reason: 'similar-option', text: raw };
      }
      return { path: 'off', confidence: 0, relevant: false, hits: [], target: null, reason: 'no-signal', text: raw };
    }
    var evidence = Math.min(1, top / 1.2);
    var margin = top > 0 ? (second > 0 ? (top - second) / top : 1) : 0;
    var conf = Math.max(0, Math.min(0.97, evidence * 0.7 + margin * 0.3));
    // 同在兩條路上（例如「救他之後殺掉」）→ 保留高分者但壓低信心
    var conflict = scores.good > 0 && scores.evil > 0;
    if (conflict) conf = Math.min(conf, 0.55);
    var pool = sims.filter(function (s) { return s.path === best; });
    var target = (pool.length ? pool : sims).slice().sort(function (a, b) { return b.sim - a.sim; })[0] || null;
    return {
      path: best, confidence: Number(conf.toFixed(3)), relevant: conf >= 0.42,
      hits: found.hits, scores: scores, target: target, conflict: conflict,
      reason: conflict ? 'conflict' : 'cues', notes: notes.slice(0, 6), text: raw
    };
  }

  function pickIndex(judgement) {
    if (!judgement || !judgement.target) return -1;
    if (!judgement.relevant) return -1;
    return judgement.target.index;
  }

  function explain(judgement) {
    if (!judgement) return '';
    var label = { good: '善', neutral: '中立', evil: '惡', off: '無關' }[judgement.path] || '未知';
    if (judgement.reason === 'no-signal') return '鈕釦在你這句話裡找不到可對應的行動，請說清楚你要做什麼。';
    if (judgement.reason === 'empty') return '你什麼都沒說，鈕釦無從判斷。';
    if (!judgement.relevant) return '鈕釦判定偏向「' + label + '」，但信心只有 ' + Math.round(judgement.confidence * 100) + '%，不敢替你決定。';
    var cue = (judgement.notes && judgement.notes.length) ? '（依據：' + judgement.notes.join('、') + '）' : '';
    return '鈕釦判定：' + label + '，信心 ' + Math.round(judgement.confidence * 100) + '%' + cue;
  }

  root.NiukouChoice = {
    version: '0.1.0',
    judge: judge,
    pickIndex: pickIndex,
    explain: explain,
    similarity: dice
  };
})(typeof window !== 'undefined' ? window : globalThis);
