/* NiukouGuide: answers questions outside of the roleplay dialogue.
 *  - game questions: retrieval (BM25 + synonym tags) over the in-game wiki plus the guide pack
 *  - read-only game-state questions and short advice from a snapshot supplied by the game
 *  - word definitions from the local lexicon, with an optional (player-triggered) web lookup hint
 *  - small utilities: safe calculator and date/time
 *  - brief empathic replies to emotional messages
 * It is local and rule based. Unknown questions get an honest "I don't know" and are logged locally for export. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', KEY = 'wuxiaNiukouGuideV1';
  var FILL = /之後|以後|之前|以前|請問|請教|想問|我想知道|麻煩|怎麼樣|怎麼|怎樣|如何|可以|能不能|能|會不會|嗎|呢|吧|啊|呀|什麼|是不是|是|的|了|有沒有|有|我|你|在|哪裡|哪|要|就|都|還|也|這個|那個|一下|告訴/g;
  var cache = { key: '', docs: [], idf: Object.create(null), avg: 1 };
  var external = { wiki: null, extra: [] };
  var lastDoc = null, lastQuestion = '';

  function norm(t) { return root.NiukouText ? root.NiukouText.normalize(String(t || '')) : String(t || ''); }
  function load() { try { var v = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (v && v.v === 1) return v; } catch (e) { /* ignore */ } return { v: 1, boost: {}, unanswered: [], stats: { asked: 0, answered: 0, helpful: 0, unhelpful: 0 } }; }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function packEntries() {
    var rt = root.WulinPackRuntime, all = rt && rt.all ? rt.all() : [], out = [];
    all.forEach(function (p) { var c = p && p.content; if (c && c.module === 'guide' && Array.isArray(c.entries)) c.entries.forEach(function (e) { out.push({ id: 'pack:' + e.id, cat: e.cat, q: e.q, a: e.a, keywords: e.keywords || [], source: 'pack' }); }); });
    return out;
  }
  function plain(html) {
    return String(html == null ? '' : html).replace(/<img[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  }
  function setSources(o) {
    o = o || {}; if (o.wiki) external.wiki = o.wiki; if (Array.isArray(o.extra)) external.extra = o.extra; cache.key = '';
  }
  function allDocs() {
    var docs = packEntries(), w = external.wiki;
    if (w) Object.keys(w).forEach(function (cat) { (w[cat] || []).forEach(function (it, i) { if (it && it.q && it.a) docs.push({ id: 'wiki:' + cat + ':' + i, cat: cat, q: plain(it.q), a: plain(it.a), keywords: [], source: 'wiki' }); }); });
    external.extra.forEach(function (it, i) { if (it && it.q && it.a) docs.push({ id: 'extra:' + i, cat: it.cat || '遊戲資料', q: plain(it.q), a: plain(it.a), keywords: it.keywords || [], source: 'game' }); });
    return docs;
  }
  function stripFill(s) { return norm(s).toLowerCase().replace(FILL, ' ').replace(/[，。！？、；：「」『』（）()\s,.!?;:~～…—\-]+/g, ' ').trim(); }
  function tokens(text) {
    var s = stripFill(text), T = root.NiukouText, out = [], seen = Object.create(null);
    function add(t) { if (t && !seen[t]) { seen[t] = 1; out.push(t); } }
    s.split(' ').forEach(function (chunk) {
      if (!chunk) return;
      if (/^[a-z0-9]+$/.test(chunk)) { add(chunk); return; }
      var cs = Array.from(chunk);
      if (cs.length === 1) { add(chunk); return; }
      for (var i = 0; i + 1 < cs.length; i++) add(cs[i] + cs[i + 1]);
      if (T && T.words) { try { T.words(chunk).forEach(function (w) { if (w.length >= 2) add('w:' + w); }); } catch (e) { /* optional */ } }
    });
    if (T && T.synonymTags) { try { T.synonymTags(s).forEach(function (g) { add('t:' + g); }); } catch (e) { /* optional */ } }
    return out;
  }
  function build() {
    var docs = allDocs(), key = docs.length + ':' + docs.map(function (d) { return d.id; }).join('').length + ':' + (docs[docs.length - 1] ? docs[docs.length - 1].a.length : 0);
    if (cache.key === key) return cache;
    var df = Object.create(null), total = 0;
    docs.forEach(function (d) {
      var tf = Object.create(null);
      function bump(list, w) { list.forEach(function (t) { tf[t] = (tf[t] || 0) + w; }); }
      bump(tokens(d.q), 3); bump(tokens(d.keywords.join(' ')), 3); bump(tokens(d.a), 1);
      d.qset = Object.create(null); tokens(d.q + ' ' + d.keywords.join(' ')).forEach(function (t) { d.qset[t] = 1; });
      d.tf = tf; d.len = Object.keys(tf).reduce(function (n, t) { return n + tf[t]; }, 0); total += d.len;
      Object.keys(tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
    });
    var N = docs.length || 1, idf = Object.create(null);
    Object.keys(df).forEach(function (t) { idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5)); });
    cache = { key: key, docs: docs, idf: idf, avg: total / N || 1, maxIdf: Math.log(1 + N + 0.5) };
    return cache;
  }
  function search(question, limit) {
    var c = build(), qt = tokens(question), boost = load().boost;
    if (!qt.length || !c.docs.length) return [];
    var k1 = 1.2, b = 0.75, qSum = 0;
    function tw(t) { return t.indexOf('t:') === 0 ? 1.5 : 1; }
    qt.forEach(function (t) { qSum += (c.idf[t] || c.maxIdf * 0.25) * tw(t); });
    var rows = c.docs.map(function (d) {
      var sc = 0, matched = 0, inQ = 0;
      qt.forEach(function (t) {
        var f = d.tf[t]; if (!f) return; var i = (c.idf[t] || 0) * tw(t);
        sc += i * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / c.avg)); matched += i; if (d.qset[t]) inQ += i;
      });
      var dq = 0; Object.keys(d.qset).forEach(function (t) { dq += (c.idf[t] || 0) * tw(t); });
      var cov = qSum ? matched / qSum : 0, qcov = qSum ? inQ / qSum : 0, prec = dq ? inQ / dq : 0;
      return { doc: d, score: sc * (1 + (boost[d.id] || 0) * 0.1), coverage: +cov.toFixed(3), qcov: qcov, prec: prec };
    }).filter(function (r) { return r.score > 0; }).sort(function (a, b2) { return (b2.coverage + 0.6 * b2.qcov + 0.5 * b2.prec + b2.score * 0.01) - (a.coverage + 0.6 * a.qcov + 0.5 * a.prec + a.score * 0.01); });
    return rows.slice(0, limit || 3);
  }

  /* ---------- utilities ---------- */
  function calcTokens(s) {
    var out = [], i = 0;
    while (i < s.length) {
      var ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) { var j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; var n = Number(s.slice(i, j)); if (!isFinite(n) || n > 1e15) throw new Error('數字太大'); out.push({ n: n }); i = j; continue; }
      if ('+-*/^%()'.indexOf(ch) >= 0) { out.push({ o: ch }); i++; continue; }
      throw new Error('不支援的符號');
    }
    return out;
  }
  function evalExpr(expr) {
    var t = calcTokens(expr), pos = 0, depth = 0;
    function peek() { return t[pos]; }
    function prim() {
      var x = t[pos++]; if (!x) throw new Error('算式不完整');
      if (x.n !== undefined) return x.n;
      if (x.o === '(') { if (++depth > 20) throw new Error('括號太深'); var v = add(); if (!t[pos] || t[pos].o !== ')') throw new Error('括號不成對'); pos++; depth--; return v; }
      if (x.o === '-') return -pow(); if (x.o === '+') return pow();
      throw new Error('算式有誤');
    }
    function pow() { var base = prim(); if (peek() && peek().o === '^') { pos++; var e = pow(); if (Math.abs(e) > 64) throw new Error('次方太大'); return Math.pow(base, e); } return base; }
    function mul() { var v = pow(); while (peek() && '*/%'.indexOf(peek().o) >= 0 && peek().o) { var o = t[pos++].o, r = pow(); if (o === '*') v *= r; else { if (r === 0) throw new Error('除數不能為 0'); v = o === '/' ? v / r : v % r; } } return v; }
    function add() { var v = mul(); while (peek() && (peek().o === '+' || peek().o === '-')) { var o = t[pos++].o, r = mul(); v = o === '+' ? v + r : v - r; } return v; }
    var res = add(); if (pos < t.length) throw new Error('算式有誤');
    if (!isFinite(res)) throw new Error('結果過大');
    return res;
  }
  function fmtNum(n) { return String(+n.toPrecision(12)); }
  function tryCalc(q) {
    var s = String(q || '').replace(/[＋]/g, '+').replace(/[－−]/g, '-').replace(/[×＊xX]/g, '*').replace(/[÷／]/g, '/').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/＾/g, '^')
      .replace(/請問|幫我|計算|算一下|算|等於多少|是多少|多少|等於|＝|=|\?|？|嗎/g, ' ').trim();
    if (!/^[0-9\s.+\-*/^%()]+$/.test(s) || !/[0-9]/.test(s) || !/[+\-*/^%]/.test(s.replace(/^\s*[+-]/, '')) || s.length > 60) return null;
    try { var v = evalExpr(s); return { text: s.replace(/\s+/g, '') + ' = ' + fmtNum(v) }; } catch (e) { return { text: '這個算式我算不了：' + e.message + '。' }; }
  }
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  function tryDate(q) {
    var now = new Date();
    if (/幾點|現在.*時間|現在是什麼時候/.test(q)) return { text: '現在是 ' + now.getHours() + ' 點 ' + String(now.getMinutes()).padStart(2, '0') + ' 分（以你裝置的時間為準）。' };
    if (/今天|今日|現在.*(日期|幾號|星期|禮拜)/.test(q) && /幾號|日期|星期|禮拜|幾月|哪一天|什麼日子/.test(q)) return { text: '今天是 ' + now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日，星期' + WD[now.getDay()] + '（以你裝置的時間為準）。' };
    return null;
  }

  /* ---------- game state ---------- */
  var ALIAS = { '年齡': ['幾歲', '年紀', '多大', '年齡'], '血量': ['血量', '生命', '血', 'hp'], '銀兩': ['銀兩', '錢', '銀子', '金錢', '財產'], '壓力': ['壓力'], '名聲': ['名聲', '聲望'], '俠氣': ['俠氣'], '魔性': ['魔性'], '武力': ['武力'], '內力': ['內力'], '悟性': ['悟性'], '福緣': ['福緣', '運氣'], '靜': ['靜'] };
  function tryState(q, state) {
    if (!state || !/多少|幾|多高|多低|現在|目前|有多|是多|我的|我現在/.test(q)) return null;
    var hit = [];
    Object.keys(state).forEach(function (label) {
      var names = ALIAS[label] || [label];
      if (names.some(function (n) { return q.toLowerCase().indexOf(n.toLowerCase()) >= 0; })) hit.push(label);
    });
    if (!hit.length) return null;
    return { text: '依你目前的存檔快照：' + hit.slice(0, 5).map(function (l) { return l + (l === '血量' && state['血量上限'] ? ' ' + state[l] + '／' + state['血量上限'] : ' ' + state[l]); }).join('、') + '。' };
  }
  function advise(state) {
    if (!state) return { text: '目前讀不到你的存檔快照，請先開始或讀取一場人生再問我。' };
    var tips = [], n = function (k) { return typeof state[k] === 'number' ? state[k] : null; };
    if (n('壓力') !== null && n('壓力') >= 80) tips.push('壓力 ' + n('壓力') + '，接近 100。壓力滿 100 會扣 20 血並回落到 50；靜高於 30 時會抵銷每月 +1。');
    if (n('血量') !== null && n('血量上限') && n('血量') / n('血量上限') <= 0.3) tips.push('血量偏低（' + n('血量') + '／' + n('血量上限') + '）。' + (n('年齡') !== null && n('年齡') < 18 ? '未滿 18 歲重傷不會死亡，但仍要小心。' : '避免高風險的戰鬥與逃不掉的追殺。'));
    if (n('俠氣') !== null && n('魔性') !== null) { var d = n('俠氣') - n('魔性'); tips.push(d >= 20 ? '俠氣減魔性為 ' + d + '，已屬正道。' : d <= -20 ? '俠氣減魔性為 ' + d + '，已屬邪道。' : '俠氣減魔性為 ' + d + '，仍在中立區間（正道 ≥ 20，邪道 ≤ −20）。'); }
    if (n('銀兩') !== null && state['伴侶'] && n('銀兩') >= 999) tips.push('銀兩已達 999，若伴侶情意 ≥ 80 就可以求婚。');
    if (!tips.length) tips.push('目前沒有明顯警訊。可以按自己的路線推進，想知道規則細節就直接問我。');
    return { text: tips.slice(0, 4).join('\n') };
  }

  /* ---------- definitions ---------- */
  function extractTerm(q) {
    var s = norm(q).replace(/[？?。！!\s]/g, ''), m;
    if ((m = s.match(/^(?:請問)?(?:什麼是|何謂|啥是|什麼叫做?|何為)[「『]?([\u4e00-\u9fff]{2,10})[」』]?$/))) return m[1];
    if ((m = s.match(/^[「『]?([\u4e00-\u9fff]{2,10})[」』]?(?:是什麼意思|是什麼|是啥|是何意|什麼意思|何解|怎麼解釋|的意思)$/))) return m[1];
    return '';
  }
  function localDefine(term) {
    var V = root.NiukouVocabIntegration, rows = V && V.index ? V.index().rows : [], i;
    for (i = 0; i < rows.length; i++) { var e = rows[i].entry; if (e.term === term || (e.aliases || []).indexOf(term) >= 0) return { term: e.term, meaning: e.meaning, register: e.register || '', origin: rows[i].origin, useWhen: e.useWhen || [], avoidWhen: e.avoidWhen || [] }; }
    return null;
  }

  /* ---------- chat ---------- */
  function tryChat(q) {
    var s = norm(q).replace(/[\s！!。.～~]/g, '');
    if (s.length > 10) return null;
    if (/^(你好|哈囉|嗨|hi|hello|早安|午安|晚安|安安)/i.test(s)) return { text: '你好，我是鈕釦。想問遊戲怎麼玩、查個詞、算個數，或只是聊聊，都可以。' };
    if (/^(謝謝|多謝|感謝|謝啦)/.test(s)) return { text: '不客氣。還有想問的就說。' };
    if (/^(再見|掰掰|拜拜|bye)/i.test(s)) return { text: '好，下次見。' };
    return null;
  }
  function tryEmpathy(q) {
    if (!root.NiukouEmotion || !root.NiukouEmpathy) return null;
    var a = root.NiukouEmotion.analyze(norm(q), []), top = a.emotions && a.emotions[0];
    if (!top || top.score < 0.45) return null;
    var plan = root.NiukouEmpathy.plan(a, { persona: 'warm', seed: q });
    if (plan.stance === 'none') return null;
    return { text: root.NiukouEmpathy.compose(plan, { withAsk: true }), emotion: top.id };
  }

  /* ---------- main entry ---------- */
  var FOLLOW = ['鈕釦是誰', '深度對話是什麼', '怎麼存檔', '我現在該注意什麼'];
  function ask(question, ctx) {
    ctx = ctx || {};
    var raw = String(question || '').trim().slice(0, 120), st = load(), res;
    if (!raw) return { domain: 'none', text: '想問什麼，直接打字就好。', items: [], confident: false };
    st.stats.asked++;
    function done(r) { st.stats.answered += r.confident ? 1 : 0; save(st); lastQuestion = raw; return r; }
    var q = norm(raw);
    if ((res = tryCalc(q))) return done({ domain: 'utility', text: res.text, items: [], confident: true });
    if ((res = tryDate(q))) return done({ domain: 'utility', text: res.text, items: [], confident: true });
    if (/該注意|現在.*(怎麼辦|該怎麼)|給我.*建議|提醒我|有什麼建議/.test(q)) return done({ domain: 'game-state', text: advise(ctx.state).text, items: [], confident: true });
    if ((res = tryState(q, ctx.state))) return done({ domain: 'game-state', text: res.text, items: [], confident: true });
    if ((res = tryChat(q))) return done({ domain: 'chat', text: res.text, items: [], confident: true });

    var term = extractTerm(q), def = term ? localDefine(term) : null;
    if (def) {
      var t = '「' + def.term + '」：' + def.meaning + (def.register ? '（' + def.register + '）' : '');
      if (def.avoidWhen.length) t += '\n使用時要避免：' + def.avoidWhen[0];
      return done({ domain: 'definition', text: t, items: [], confident: true, term: def.term, origin: def.origin });
    }
    var hits = search(q, 3), min = 0.34, top = hits[0];
    var rt = root.WulinPackRuntime, gp = rt && rt.all ? rt.all().filter(function (p) { return p.content && p.content.module === 'guide'; })[0] : null;
    if (gp && gp.content.limits && typeof gp.content.limits.minConfidence === 'number') min = gp.content.limits.minConfidence;
    if ((!top || top.coverage < min) && lastDoc && Array.from(stripFill(q).replace(/ /g, '')).length <= 3 && /呢|那|它|這|還有|然後/.test(q)) {
      var follow = search(lastDoc.q + ' ' + q, 3); if (follow[0] && follow[0].coverage >= min) { hits = follow; top = follow[0]; }
    }
    if (top && top.coverage >= min) {
      lastDoc = top.doc;
      var items = hits.filter(function (h, i) { return i === 0 || h.coverage >= Math.max(min, top.coverage * 0.75); }).map(function (h) { return { id: h.doc.id, cat: h.doc.cat, q: h.doc.q, a: h.doc.a, source: h.doc.source, coverage: h.coverage }; });
      return done({ domain: 'game', text: top.doc.a, items: items, confident: true, matched: top.doc.q });
    }
    if ((res = tryEmpathy(q))) return done({ domain: 'chat', text: res.text, items: [], confident: true, emotion: res.emotion });
    if (term) return done({ domain: 'definition', text: '我的詞庫裡還沒有「' + term + '」。如果你想，可以按下方的按鈕只把這個詞送去查詢，結果會先放進待審草稿。', items: [], confident: false, needsWeb: term });
    st.unanswered = st.unanswered.filter(function (u) { return u.q !== raw; }).concat([{ q: raw.slice(0, 60), at: Date.now() }]).slice(-30);
    var cand = hits.slice(0, 2).map(function (h) { return { id: h.doc.id, cat: h.doc.cat, q: h.doc.q, a: h.doc.a, source: h.doc.source, coverage: h.coverage }; });
    return done({ domain: 'unknown', text: '這個我不確定，不想隨便亂答。可以換個說法再問一次' + (cand.length ? '，或看看下面最接近的條目' : '') + '。我的長處是這個遊戲的玩法、鈕釦自己的功能、查詞語、簡單計算。', items: cand, confident: false, followUps: FOLLOW });
  }
  function feedback(id, helpful, question) {
    var st = load(); st.boost[id] = Math.max(-5, Math.min(5, (st.boost[id] || 0) + (helpful ? 1 : -1)));
    if (helpful) st.stats.helpful++; else { st.stats.unhelpful++; st.unanswered = st.unanswered.concat([{ q: String(question || lastQuestion).slice(0, 60), at: Date.now(), id: id }]).slice(-30); }
    save(st);
  }
  function unanswered() { return load().unanswered; }
  function exportUnanswered() { var s = load(); return { schemaVersion: 1, type: 'niukou-unanswered-questions', generatedAt: new Date().toISOString(), note: '只保存在本機，沒有自動上傳。', questions: s.unanswered }; }
  function stats() { return load().stats; }
  function clearAll() { try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } lastDoc = null; }
  root.NiukouGuide = { version: VERSION, ask: ask, search: search, setSources: setSources, advise: advise, feedback: feedback, unanswered: unanswered, exportUnanswered: exportUnanswered, stats: stats, clearAll: clearAll, evaluate: tryCalc, docCount: function () { return build().docs.length; } };
})(typeof window !== 'undefined' ? window : globalThis);
