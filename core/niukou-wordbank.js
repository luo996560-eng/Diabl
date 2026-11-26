/* User-triggered single-term lookup. Remote text remains an unreviewed, local-only candidate. */
(function (root) {
  'use strict';
  var STORAGE_KEY = 'wuxiaNiukouWordbankV1';
  var API = 'https://zh.wiktionary.org/w/api.php';
  var LICENSE = {
    name: 'CC BY-SA 4.0 / GNU FDL (Wiktionary content; verify source page notices)',
    url: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
    version: '4.0'
  };
  function safeText(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
  }
  function normalizeTerm(value) {
    var term = safeText(value, 48);
    if (term.normalize) term = term.normalize('NFC');
    return term.replace(/\s+/g, ' ').trim();
  }
  function read() {
    try {
      var value = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter(function (item) { return item && item.schemaVersion === 1 && typeof item.id === 'string' && typeof item.term === 'string' && item.source && item.source.host === 'zh.wiktionary.org' && item.status === 'unreviewed-candidate' && item.activeInJudgement === false; }).slice(-60).map(function (item) {
        var term = normalizeTerm(item.term), excerpt = safeText(item.excerpt, 1800);
        return { schemaVersion: 1, id: item.id.slice(0, 96), term: term, excerpt: excerpt, source: { host: 'zh.wiktionary.org', title: term, url: safePageUrl(item.source.url, term), historyUrl: safePageUrl(item.source.historyUrl, term), license: LICENSE.name, licenseUrl: LICENSE.url }, status: 'unreviewed-candidate', activeInJudgement: false, savedAt: safeText(item.savedAt || '', 40) };
      }).filter(function (item) { return item.term && item.excerpt; });
    } catch (error) { return []; }
  }
  function safePageUrl(value, title) {
    try {
      var url = new URL(value || '/wiki/' + encodeURIComponent(title), 'https://zh.wiktionary.org');
      if (url.origin !== 'https://zh.wiktionary.org') return 'https://zh.wiktionary.org/wiki/' + encodeURIComponent(title);
      return url.href;
    } catch (error) { return 'https://zh.wiktionary.org/wiki/' + encodeURIComponent(title); }
  }
  async function search(termValue) {
    var term = normalizeTerm(termValue);
    if (!term || term.length > 32 || /[\s<>\u0000-\u001f]/.test(term)) throw new Error('請輸入 1 至 32 個字的單一詞語，不接受句子或空白分隔內容。');
    var params = new URLSearchParams({ action: 'query', prop: 'extracts|info', explaintext: '1', exsectionformat: 'plain', inprop: 'url', titles: term, redirects: '1', format: 'json', origin: '*' });
    var response = await root.fetch(API + '?' + params.toString(), { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('詞典服務回應 HTTP ' + response.status + '。');
    var raw = await response.text();
    if (raw.length > 256 * 1024) throw new Error('遠端回應超過安全大小限制。');
    var data;
    try { data = JSON.parse(raw); } catch (error) { throw new Error('詞典回應格式無法辨識。'); }
    var pages = data && data.query && data.query.pages || {}, page = Object.keys(pages).map(function (key) { return pages[key]; })[0];
    if (!page || page.missing !== undefined) throw new Error('找不到「' + term + '」的詞條。');
    var title = normalizeTerm(page.title || term), extract = safeText(page.extract || '', 1800);
    if (!extract) throw new Error('找到詞條，但沒有可供預覽的純文字摘錄。');
    var pageUrl = safePageUrl(page.fullurl, title);
    return {
      schemaVersion: 1,
      id: 'wiktionary:' + String(page.pageid || title),
      term: title,
      excerpt: extract,
      source: { host: 'zh.wiktionary.org', title: title, url: pageUrl, historyUrl: 'https://zh.wiktionary.org/w/index.php?title=' + encodeURIComponent(title) + '&action=history', license: LICENSE.name, licenseUrl: LICENSE.url },
      status: 'unreviewed-candidate',
      activeInJudgement: false,
      searchedAt: new Date().toISOString()
    };
  }
  function saveCandidate(candidate) {
    if (!candidate || candidate.schemaVersion !== 1 || !candidate.source || candidate.source.host !== 'zh.wiktionary.org') throw new Error('候選詞格式不安全。');
    var term = normalizeTerm(candidate.term), excerpt = safeText(candidate.excerpt, 1800);
    if (!term || !excerpt) throw new Error('候選詞內容不完整。');
    var items = read(), id = String(candidate.id || 'wiktionary:' + term).slice(0, 96);
    if (items.some(function (item) { return item.id === id; })) return { added: false, items: items };
    items.push({ schemaVersion: 1, id: id, term: term, excerpt: excerpt, source: { host: 'zh.wiktionary.org', title: term, url: safePageUrl(candidate.source.url, term), historyUrl: safePageUrl(candidate.source.historyUrl, term), license: LICENSE.name, licenseUrl: LICENSE.url }, status: 'unreviewed-candidate', activeInJudgement: false, savedAt: new Date().toISOString() });
    items = items.slice(-60);
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return { added: true, items: items };
  }
  function remove(id) {
    var items = read().filter(function (item) { return item.id !== id; });
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
  }
  function exportCandidates() {
    return { schemaVersion: 1, type: 'niukou-local-review-candidates', locale: 'zh-Hant', generatedAt: new Date().toISOString(), notice: 'Unreviewed candidates only; these entries are not active in judgement. Review each source, license, meaning and wording before publishing.', entries: read() };
  }
  root.NiukouWordbank = { version: '1.0.0', search: search, saveCandidate: saveCandidate, remove: remove, list: read, exportCandidates: exportCandidates };
})(typeof window !== 'undefined' ? window : globalThis);
