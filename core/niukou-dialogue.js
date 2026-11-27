/* NiukouDialogue: lightweight dialogue state (speech acts, topics, pending questions, repetition, follow-ups).
 * It produces suggestions for how a reply could proceed; it never writes game state. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  function pack() {
    var rt = root.WulinPackRuntime, all = rt && rt.all ? rt.all() : [];
    for (var i = 0; i < all.length; i++) if (all[i].content && all[i].content.module === 'dialogue') return all[i].content;
    return null;
  }
  function norm(t) { return root.NiukouText ? root.NiukouText.normalize(t) : String(t || ''); }
  function createState() { return { turn: 0, topics: [], acts: [], asked: [], used: [], lastTexts: [], unresolved: 0 }; }
  function detectActs(text) {
    var p = pack(), s = norm(text), out = [];
    if (!p) return out;
    p.acts.forEach(function (a) {
      var hits = a.cues.filter(function (c) { return s.indexOf(c) >= 0; });
      if (!hits.length) return;
      if (a.id === 'agree' && /不|沒|未|別/.test(s)) return;
      if (a.id === 'question-fact' && hits.length === 1 && hits[0] === '什麼' && /不管什麼|無論什麼/.test(s)) return;
      out.push({ id: a.id, label: a.label, cues: hits.slice(0, 3), score: Math.min(1, 0.4 + hits.length * 0.2) });
    });
    if (/[？?]/.test(s) && !out.some(function (x) { return x.id.indexOf('question') === 0; })) out.push({ id: 'question-fact', label: '詢問事實', cues: ['？'], score: 0.6 });
    return out.sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
  }
  function detectTopics(text) {
    var p = pack(), s = norm(text), out = [];
    if (!p) return out;
    p.topics.forEach(function (t) { var hits = t.terms.filter(function (w) { return s.indexOf(w) >= 0; }); if (hits.length) out.push({ id: t.id, label: t.label, hits: hits.slice(0, 3) }); });
    return out;
  }
  function observe(state, text) {
    var st = state || createState(), acts = detectActs(text), topics = detectTopics(text), s = norm(text);
    st.turn++;
    var repeat = st.lastTexts.some(function (x) { return x === s; });
    st.lastTexts = st.lastTexts.concat([s]).slice(-6);
    var prev = st.topics[0] || null, topicShift = !!(topics.length && prev && topics[0].id !== prev);
    if (topics.length) { st.topics = topics.map(function (t) { return t.id; }).concat(st.topics.filter(function (x) { return !topics.some(function (t) { return t.id === x; }); })).slice(0, 5); }
    st.acts = acts.map(function (a) { return a.id; }).concat(st.acts).slice(0, 8);
    var asks = acts.some(function (a) { return a.id.indexOf('question') === 0; });
    if (asks) st.unresolved++; else if (acts.some(function (a) { return ['thanks', 'agree', 'clarify'].indexOf(a.id) >= 0; })) st.unresolved = Math.max(0, st.unresolved - 1);
    return { acts: acts, topics: topics, asksQuestion: asks, repeat: repeat, topicShift: topicShift, turn: st.turn };
  }
  /* Next-step suggestion: which strategy ids apply and which gentle follow-up could keep the thread alive. */
  function suggest(state, observed, emotionResult) {
    var p = pack(), st = state || createState(), steps = [], follow = '';
    var ids = (observed.acts || []).map(function (a) { return a.id; });
    if (ids.indexOf('clarify') >= 0) steps.push('採用玩家最新說法，承認先前理解可能有誤');
    if (observed.asksQuestion) steps.push('先直接回答問的事，再補充一個必要細節');
    if (ids.indexOf('thanks') >= 0) steps.push('簡短接受謝意，不必客套重複');
    if (ids.indexOf('apology') >= 0) steps.push('接受歉意，但不代替對方宣告事情已了');
    if (ids.indexOf('request') >= 0) steps.push('說明能否答應與條件，不含糊');
    if (ids.indexOf('promise') >= 0) steps.push('記住承諾的範圍與期限，不擴大解讀');
    if (observed.repeat) steps.push('玩家重複同一句話：點出已聽到，改問一個新問題');
    if (observed.topicShift) steps.push('話題轉換：簡短銜接再進入新話題');
    if (emotionResult && emotionResult.intensity >= 0.6) steps.unshift('先承認情緒，再談內容');
    if (p && !observed.asksQuestion && (observed.topics || []).length) {
      var topic = p.topics.filter(function (t) { return t.id === observed.topics[0].id; })[0];
      var fresh = topic && topic.followUps.filter(function (f) { return st.asked.indexOf(f) < 0; });
      if (fresh && fresh.length) { follow = fresh[0]; }
    }
    if (follow) { st.asked = st.asked.concat([follow]).slice(-12); }
    return { steps: steps.slice(0, 4), followUp: follow };
  }
  root.NiukouDialogue = { version: VERSION, createState: createState, observe: observe, suggest: suggest, detectActs: detectActs, detectTopics: detectTopics };
})(typeof window !== 'undefined' ? window : globalThis);
