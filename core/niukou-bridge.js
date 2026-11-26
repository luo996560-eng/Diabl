/* Optional server-backed Niukou conversation. Provider credentials stay server-side. */
(function (root) {
  'use strict';
  var KEY = 'wulinNiukouEndpoint.v1';
  var MAX_TEXT = 240;
  function endpoint() {
    try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; }
  }
  function validEndpoint(value) {
    try {
      var url = new URL(String(value || '').trim());
      return (url.protocol === 'https:' || url.hostname === 'localhost') && url.pathname.length < 512 && !url.username && !url.password && !url.search && !url.hash ? url.href.replace(/\/$/, '') : '';
    } catch (_) { return ''; }
  }
  function configure(value) {
    var clean = validEndpoint(value);
    if (!clean) throw new Error('請輸入有效的 HTTPS 對話服務網址');
    localStorage.setItem(KEY, clean);
    return clean;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (_) {} }
  function cleanHistory(history) {
    return (Array.isArray(history) ? history : []).slice(-10).map(function (row) {
      return { role: row && row.who === 'npc' ? 'assistant' : 'user', text: String(row && row.text || '').slice(0, MAX_TEXT) };
    });
  }
  function cleanPackContext(packs) {
    return (Array.isArray(packs) ? packs : []).slice(0, 8).map(function (p) {
      var c = p && p.content || {};
      return {
        persona: c.persona ? { name: String(c.persona.name || '').slice(0, 80), voice: String(c.persona.voice || '').slice(0, 1200) } : null,
        glossary: (Array.isArray(c.glossary) ? c.glossary : []).slice(0, 80).map(function (x) { return { term: String(x.term || '').slice(0, 60), meaning: String(x.meaning || '').slice(0, 240) }; }),
        examples: (Array.isArray(c.examples) ? c.examples : []).slice(0, 30).map(function (x) { return { input: String(x.input || '').slice(0, 240), category: String(x.category || '').slice(0, 20), replyStyle: String(x.replyStyle || '').slice(0, 240) }; })
      };
    });
  }
  async function reply(payload) {
    var url = validEndpoint(endpoint());
    if (!url) throw new Error('未設定鈕釦對話服務');
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 18000);
    try {
      var response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: String(payload.text || '').slice(0, MAX_TEXT),
          history: cleanHistory(payload.history),
          npc: { name: String(payload.npc && payload.npc.name || '江湖人物').slice(0, 60), scene: String(payload.npc && payload.npc.scene || '').slice(0, 60), intro: String(payload.npc && payload.npc.intro || '').slice(0, 500) },
          localJudgement: { category: String(payload.judgement && payload.judgement.cat || 'neutral'), confidence: Math.max(0, Math.min(1, Number(payload.judgement && payload.judgement.confidence) || 0)), source: String(payload.judgement && payload.judgement.source || 'offline').slice(0, 30) },
          packs: cleanPackContext(root.WulinPackRuntime ? root.WulinPackRuntime.promptContext() : [])
        })
      });
      if (!response.ok) throw new Error('AI 服務回應 HTTP ' + response.status);
      var data = await response.json();
      if (!data || !data.reply || typeof data.reply !== 'string' || data.reply.length > 600) throw new Error('AI 回覆格式無效');
      var allowed = ['good', 'neutral', 'evil', 'off'];
      var category = allowed.indexOf(data.category) >= 0 ? data.category : null;
      var confidence = Number(data.confidence);
      return { reply: data.reply.trim(), category: category, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0, intent: String(data.intent || '').slice(0, 48), reason: String(data.reason || '').slice(0, 180), clarification: String(data.clarification || '').slice(0, 180) };
    } finally { clearTimeout(timer); }
  }
  root.NiukouBridge = { endpoint: endpoint, configure: configure, clear: clear, isConfigured: function () { return !!validEndpoint(endpoint()); }, reply: reply };
})(window);
