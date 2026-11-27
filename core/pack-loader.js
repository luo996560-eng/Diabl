/* WulinPackRuntime: data-only, same-origin extension packs. Never eval pack content. */
(function (root) {
  'use strict';
  var CORE_VERSION = '1.0.0';
  var state = { status: 'loading', packs: [], errors: [], ready: null };
  function semver(value) {
    var match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map(Number) : null;
  }
  function atLeast(current, required) {
    var a = semver(current), b = semver(required);
    if (!a || !b) return false;
    for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return true;
  }
  function safeId(value) { return /^[a-z0-9][a-z0-9._-]{1,63}$/.test(String(value || '')); }
  function safePath(value) {
    return typeof value === 'string' && value.length < 256 && !value.startsWith('/') &&
      !value.includes('..') && !/[:\\?#]/.test(value);
  }
  function validText(value, max) { return typeof value === 'string' && value.length <= max; }
  function stringList(value, maxItems, maxText) {
    return Array.isArray(value) && value.length <= maxItems && value.every(function (x) { return validText(x, maxText); });
  }
  function validCueRows(rows, maxItems) {
    return Array.isArray(rows) && rows.length <= maxItems && rows.every(function (row) {
      return row && validText(row.id, 48) && validText(row.label, 80) && stringList(row.terms, 40, 48) && validText(row.note || '', 240);
    });
  }
  function listOf(value, maxItems) { return Array.isArray(value) && value.length <= maxItems; }
  function validateExtended(c) {
    var i, row;
    if (c.contrastCues !== undefined && !stringList(c.contrastCues, 24, 16)) return '情緒轉折線索格式錯誤';
    if (c.categories && c.categories.some(function (cat) { return (cat.dominance !== undefined && (typeof cat.dominance !== 'number' || cat.dominance < -1 || cat.dominance > 1)) || (cat.emoticons !== undefined && !stringList(cat.emoticons, 16, 16)); })) return '情緒支配度或顏文字格式錯誤';
    if (c.module === 'script') {
      var p = c.provenance;
      if (!p || ['original-game-content', 'third-party-open-source'].indexOf(p.kind) < 0 || !validText(p.source, 240) || !validText(p.license, 120)) return '字形對照來源聲明不正確';
      if (!validText(c.s2t, 24000) || c.s2t.length % 2 !== 0 || !validText(c.simplifiedOnly, 12000)) return '字形對照表格式錯誤';
      if (!listOf(c.ambiguous || [], 40) || (c.ambiguous || []).some(function (a) { return !a || !validText(a.ch, 2) || !validText(a.default, 2) || !listOf(a.rules, 6) || a.rules.some(function (r) { return !r || !validText(r.to, 2) || !stringList(r.near, 30, 4); }); })) return '字形歧義規則格式錯誤';
    }
    if (c.module === 'synonyms') {
      if (!c.provenance || ['original-game-content', 'third-party-open-source'].indexOf(c.provenance.kind) < 0) return '近義詞來源聲明不正確';
      if (!listOf(c.groups, 120) || c.groups.some(function (g) { return !g || !validText(g.id, 48) || !validText(g.label, 40) || !stringList(g.members, 40, 24); })) return '近義詞群格式錯誤';
    }
    if (c.module === 'dialogue') {
      if (!listOf(c.acts, 40) || c.acts.some(function (a) { return !a || !validText(a.id, 48) || !validText(a.label, 40) || !stringList(a.cues, 40, 24) || !stringList(a.followUps || [], 12, 120); })) return '對話行為格式錯誤';
      if (!listOf(c.topics, 40) || c.topics.some(function (t) { return !t || !validText(t.id, 48) || !validText(t.label, 40) || !stringList(t.terms, 40, 24) || !stringList(t.followUps || [], 12, 120); })) return '對話話題格式錯誤';
      if (!listOf(c.empathy, 40) || c.empathy.some(function (e) { return !e || !validText(e.emotion, 48) || !stringList(e.validate, 12, 120) || !stringList(e.ask || [], 8, 120); })) return '共感用語格式錯誤';
      if (!listOf(c.tones, 12) || c.tones.some(function (t) { return !t || !validText(t.id, 24) || !stringList(t.pre || [], 6, 24) || !stringList(t.post || [], 6, 24); })) return '語氣設定格式錯誤';
    }
    if (c.module === 'style') {
      if (!listOf(c.registers, 12) || c.registers.some(function (r) {
        var swapsOk = function (x) { return x === undefined || (listOf(x, 40) && x.every(function (pair) { return Array.isArray(pair) && pair.length === 2 && validText(pair[0], 16) && validText(pair[1], 16); })); };
        return !r || !validText(r.id, 24) || !validText(r.label, 40) || !stringList(r.cues || [], 40, 16) || !stringList(r.particles || [], 12, 8) || !swapsOk(r.toClassical) || !swapsOk(r.toPlain);
      })) return '語氣風格資料格式錯誤';
    }
    return '';
  }
  function validatePack(pack, entry) {
    if (!pack || pack.schemaVersion !== 1 || pack.id !== entry.id || pack.version !== entry.version || pack.type !== 'data') return '套件標頭或版本不符';
    if (!pack.content || typeof pack.content !== 'object' || Array.isArray(pack.content)) return '套件內容格式錯誤';
    if (pack.content.locale && !validText(pack.content.locale, 24)) return '語系欄位不正確';
    if (pack.content.persona && (!validText(pack.content.persona.name, 80) || !validText(pack.content.persona.voice, 1200))) return '人物設定超出格式限制';
    if (pack.content.glossary && (!Array.isArray(pack.content.glossary) || pack.content.glossary.length > 120)) return '詞彙表超出格式限制';
    if ((pack.content.glossary || []).some(function (row) { return !row || !validText(row.term, 60) || !validText(row.meaning, 240); })) return '詞彙表項目不正確';
    if (pack.content.module === 'lexicon') {
      if (!pack.content.provenance || pack.content.provenance.kind !== 'original-game-content' || !validText(pack.content.provenance.source, 120) || !validText(pack.content.provenance.license, 180)) return '詞彙來源聲明不正確';
      if (!Array.isArray(pack.content.entries) || pack.content.entries.length > 120) return '詞彙模組超出格式限制';
      if (pack.content.entries.some(function (row) { return !row || !validText(row.id, 48) || !validText(row.term, 48) || !stringList(row.aliases || [], 12, 48) || !validText(row.meaning, 240) || !validText(row.register || '', 64) || !stringList(row.useWhen || [], 12, 100) || !stringList(row.avoidWhen || [], 12, 100) || !validText(row.responseNeed || '', 240); })) return '詞彙模組欄位不正確';
    }
    if (pack.content.examples && (!Array.isArray(pack.content.examples) || pack.content.examples.length > 80)) return '範例數量超出格式限制';
    if ((pack.content.examples || []).some(function (row) { return !row || !validText(row.input, 240) || !validText(row.category, 20) || !validText(row.replyStyle, 240) || (row.phenomenon !== undefined && !validText(row.phenomenon, 48)); })) return '對話範例格式錯誤';
    if (pack.content.module && ['language', 'emotion', 'judgement', 'response', 'lexicon', 'script', 'synonyms', 'dialogue', 'style'].indexOf(pack.content.module) < 0) return '未知的鈕釦模組類型';
    var extended = validateExtended(pack.content);
    if (extended) return extended;
    if (pack.content.cues && !validCueRows(pack.content.cues, 80)) return '語言線索模組格式錯誤';
    if (pack.content.categories && (!Array.isArray(pack.content.categories) || pack.content.categories.length > 24 || pack.content.categories.some(function (row) {
      return !row || !validText(row.id, 40) || !validText(row.label, 80) || !Array.isArray(row.cues) || row.cues.length > 60 || row.cues.some(function (cue) { return !cue || !validText(cue.term, 48) || typeof cue.weight !== 'number' || cue.weight < 0 || cue.weight > 2; }) || !validText(row.responseNeed, 240);
    }))) return '情緒分類模組格式錯誤';
    if (pack.content.negationCues && !stringList(pack.content.negationCues, 40, 32)) return '情緒否定線索格式錯誤';
    if (pack.content.intensityCues && (!Array.isArray(pack.content.intensityCues) || pack.content.intensityCues.length > 24 || pack.content.intensityCues.some(function (row) { return !row || !validText(row.term, 32) || typeof row.factor !== 'number' || row.factor < 0 || row.factor > 2; }))) return '情緒強度線索格式錯誤';
    if (pack.content.policy && ['dialogue', 'style'].indexOf(pack.content.module) >= 0) {
      var lp = pack.content.policy;
      if (lp.proposalOnly !== true || (lp.gameStateAuthority !== undefined && lp.gameStateAuthority !== 'game-rules-only')) return '擴充模組安全邊界不正確';
    } else if (pack.content.policy) {
      var policy = pack.content.policy;
      if (policy.proposalOnly !== true || policy.gameStateAuthority !== 'game-rules-only' || typeof policy.clarifyBelowConfidence !== 'number' || policy.clarifyBelowConfidence < 0 || policy.clarifyBelowConfidence > 1 || !stringList(policy.protectedIntents, 24, 48) || !stringList(policy.priority, 16, 120) || !stringList(pack.content.principles, 24, 280)) return '判定守則格式或安全邊界不正確';
      if (policy.neuralMinimumConfidence !== undefined && (typeof policy.neuralMinimumConfidence !== 'number' || policy.neuralMinimumConfidence < 0.5 || policy.neuralMinimumConfidence > 1)) return '神經網路信心門檻不安全';
    }
    if (pack.content.strategies && (!Array.isArray(pack.content.strategies) || pack.content.strategies.length > 32 || pack.content.strategies.some(function (row) {
      return !row || !validText(row.id, 48) || !stringList(row.when, 16, 48) || !stringList(row.steps, 8, 240) || !stringList(row.avoid, 8, 160);
    }))) return '對答策略模組格式錯誤';
    if (pack.content.voiceRules && !stringList(pack.content.voiceRules, 24, 240)) return '對答語氣規則格式錯誤';
    return '';
  }
  async function sha256Hex(buffer) {
    if (!root.crypto || !root.crypto.subtle) throw new Error('瀏覽器不支援套件完整性驗證');
    var digest = await root.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  async function loadOne(entry, baseUrl) {
    if (!entry || !safeId(entry.id) || !semver(entry.version) || !safePath(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error('擴充包索引資料不安全');
    var url = new URL(entry.path, baseUrl);
    if (url.origin !== root.location.origin) throw new Error('擴充包必須與遊戲同源');
    var response = await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
    if (!response.ok) throw new Error('下載失敗（HTTP ' + response.status + '）');
    var buffer = await response.arrayBuffer();
    if (buffer.byteLength > 512 * 1024) throw new Error('擴充包超過 512 KB');
    if ((await sha256Hex(buffer)) !== entry.sha256.toLowerCase()) throw new Error('SHA-256 驗證失敗');
    var pack = JSON.parse(new TextDecoder().decode(buffer));
    var problem = validatePack(pack, entry);
    if (problem) throw new Error(problem);
    return pack;
  }
  function dependencyProblem(entry, loadedVersions) {
    if (entry.dependencies === undefined) return '';
    if (!Array.isArray(entry.dependencies) || entry.dependencies.length > 12) return '相依套件清單格式不正確';
    for (var i = 0; i < entry.dependencies.length; i++) {
      var dep = entry.dependencies[i];
      if (!dep || !safeId(dep.id) || !semver(dep.version)) return '相依套件規格不正確';
      if (loadedVersions[dep.id] !== dep.version) return '缺少相依套件或版本不符：' + dep.id + ' ' + dep.version;
    }
    return '';
  }
  async function load() {
    try {
      var manifestUrl = new URL('../packs/manifest.json', root.document.currentScript && root.document.currentScript.src || root.location.href);
      var response = await fetch(manifestUrl.href, { cache: 'no-cache', credentials: 'same-origin' });
      if (!response.ok) throw new Error('擴充包目錄載入失敗（HTTP ' + response.status + '）');
      var manifest = await response.json();
      if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.packs) || manifest.packs.length > 40) throw new Error('擴充包目錄格式不正確');
      if (manifest.minCoreVersion && !atLeast(CORE_VERSION, manifest.minCoreVersion)) throw new Error('擴充包需要較新的遊戲核心');
      var baseUrl = new URL('../packs/', manifestUrl);
      var ids = Object.create(null), loadedVersions = Object.create(null);
      for (var i = 0; i < manifest.packs.length; i++) {
        var entry = manifest.packs[i];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { state.errors.push('索引項目格式不正確'); continue; }
        if (ids[entry.id]) { state.errors.push(String(entry.id) + '：重複 ID'); continue; }
        ids[entry.id] = true;
        var depProblem = dependencyProblem(entry, loadedVersions);
        if (depProblem) { state.errors.push(String(entry.id || '未知套件') + '：' + depProblem); continue; }
        try {
          var pack = await loadOne(entry, baseUrl);
          state.packs.push(pack);
          loadedVersions[pack.id] = pack.version;
        } catch (error) { state.errors.push(String(entry.id || '未知套件') + '：' + error.message); }
      }
      state.status = state.errors.length ? (state.packs.length ? 'partial' : 'offline') : 'ready';
    } catch (error) {
      state.status = 'offline';
      state.errors.push(error.message || '擴充包暫不可用');
    }
    return api;
  }
  var api = {
    coreVersion: CORE_VERSION,
    get status() { return state.status; },
    get errors() { return state.errors.slice(); },
    get packs() { return state.packs.map(function (p) { return { id: p.id, version: p.version, type: p.type }; }); },
    ready: null,
    get: function (id) { return state.packs.find(function (p) { return p.id === id; }) || null; },
    all: function () { return state.packs.slice(); },
    promptContext: function () {
      return state.packs.map(function (p) { return p.content; });
    }
  };
  state.ready = api.ready = load();
  root.WulinPackRuntime = api;
})(window);
