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
  function validatePack(pack, entry) {
    if (!pack || pack.schemaVersion !== 1 || pack.id !== entry.id || pack.version !== entry.version || pack.type !== 'data') return '套件標頭或版本不符';
    if (!pack.content || typeof pack.content !== 'object' || Array.isArray(pack.content)) return '套件內容格式錯誤';
    if (pack.content.locale && !validText(pack.content.locale, 24)) return '語系欄位不正確';
    if (pack.content.persona && (!validText(pack.content.persona.name, 80) || !validText(pack.content.persona.voice, 1200))) return '人物設定超出格式限制';
    if (pack.content.glossary && (!Array.isArray(pack.content.glossary) || pack.content.glossary.length > 120)) return '詞彙表超出格式限制';
    if ((pack.content.glossary || []).some(function (row) { return !row || !validText(row.term, 60) || !validText(row.meaning, 240); })) return '詞彙表項目不正確';
    if (pack.content.examples && (!Array.isArray(pack.content.examples) || pack.content.examples.length > 80)) return '範例數量超出格式限制';
    if ((pack.content.examples || []).some(function (row) { return !row || !validText(row.input, 240) || !validText(row.category, 20) || !validText(row.replyStyle, 240) || (row.phenomenon !== undefined && !validText(row.phenomenon, 48)); })) return '對話範例格式錯誤';
    if (pack.content.module && ['language', 'emotion', 'judgement', 'response'].indexOf(pack.content.module) < 0) return '未知的鈕釦模組類型';
    if (pack.content.cues && !validCueRows(pack.content.cues, 80)) return '語言線索模組格式錯誤';
    if (pack.content.categories && (!Array.isArray(pack.content.categories) || pack.content.categories.length > 24 || pack.content.categories.some(function (row) {
      return !row || !validText(row.id, 40) || !validText(row.label, 80) || !Array.isArray(row.cues) || row.cues.length > 60 || row.cues.some(function (cue) { return !cue || !validText(cue.term, 48) || typeof cue.weight !== 'number' || cue.weight < 0 || cue.weight > 2; }) || !validText(row.responseNeed, 240);
    }))) return '情緒分類模組格式錯誤';
    if (pack.content.negationCues && !stringList(pack.content.negationCues, 40, 32)) return '情緒否定線索格式錯誤';
    if (pack.content.intensityCues && (!Array.isArray(pack.content.intensityCues) || pack.content.intensityCues.length > 24 || pack.content.intensityCues.some(function (row) { return !row || !validText(row.term, 32) || typeof row.factor !== 'number' || row.factor < 0 || row.factor > 2; }))) return '情緒強度線索格式錯誤';
    if (pack.content.policy) {
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
