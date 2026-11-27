/* NiukouWebSearch: privacy-first multi-source vocabulary lookup.
 * - Sends ONLY one short Chinese term per request (no sentences, no game memory, no identifiers, no cookies).
 * - Allow-listed hosts only: zh.wiktionary.org, zh.wikipedia.org, www.wikidata.org (all support CORS, no API key).
 * - Rate-limited, size-capped, timed out, cached, with a per-host circuit breaker.
 * - Results are untrusted text: they become local drafts the player reviews; they never decide outcomes. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', CACHE_KEY = 'wuxiaNiukouWebCacheV1', TTL = 7 * 24 * 3600 * 1000, MAX_CACHE = 40;
  var MAX_BYTES = 256 * 1024, TIMEOUT = 8000, MIN_GAP = 1200, BREAK_AFTER = 3, BREAK_MS = 10 * 60 * 1000;
  var HOSTS = { 'zh.wiktionary.org': 'wiktionary', 'zh.wikipedia.org': 'wikipedia', 'www.wikidata.org': 'wikidata' };
  var LICENSE = {
    wiktionary: { name: 'CC BY-SA 4.0 / GNU FDL（維基詞典內容；請核對來源頁授權）', url: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights' },
    wikipedia: { name: 'CC BY-SA 4.0（維基百科內容）', url: 'https://zh.wikipedia.org/wiki/Wikipedia:%E7%89%88%E6%AC%8A%E4%BF%A1%E6%81%AF' },
    wikidata: { name: 'CC0 1.0（維基數據結構化資料）', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }
  };
  var env = { fetch: null, now: function () { return Date.now(); }, sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); } };
  var hostState = Object.create(null);
  var memCache = Object.create(null);

  function clip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n); }
  function norm(t) { return root.NiukouText ? root.NiukouText.normalize(t) : String(t || '').trim(); }
  function getFetch() { return env.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null); }

  /* Only a short, plain Chinese term may leave the device. */
  function isSafeTerm(term, ctx) {
    var t = norm(clip(term, 48));
    if (t.length < 2 || t.length > 16) return { ok: false, reason: '詞語需為 2 至 16 個字' };
    if (!/^[\u4e00-\u9fff·]+$/.test(t)) return { ok: false, reason: '只接受中文詞語（不含數字、符號、網址或空白）' };
    var names = (ctx && ctx.exclude || []).map(function (x) { return String(x); });
    if (names.some(function (n) { return n && (t === n || t.indexOf(n) >= 0 && n.length >= 2); })) return { ok: false, reason: '像是人名或存檔內的名稱，不會送出' };
    if (root.NiukouText && root.NiukouText.stopwords && root.NiukouText.stopwords[t]) return { ok: false, reason: '常用詞，不必查詢' };
    return { ok: true, term: t };
  }

  function hostOf(url) { try { var u = new URL(url); return u.protocol === 'https:' ? u.hostname : ''; } catch (e) { return ''; } }
  async function throttle(host) {
    var st = hostState[host] || (hostState[host] = { last: 0, fails: 0, until: 0 });
    var now = env.now();
    if (st.until > now) throw new Error('來源暫停中（連續失敗，稍後再試）');
    var wait = st.last + MIN_GAP - now;
    if (wait > 0) await env.sleep(wait);
    st.last = env.now();
  }
  function noteResult(host, ok) {
    var st = hostState[host] || (hostState[host] = { last: 0, fails: 0, until: 0 });
    if (ok) st.fails = 0; else { st.fails++; if (st.fails >= BREAK_AFTER) { st.until = env.now() + BREAK_MS; st.fails = 0; } }
  }
  async function getJson(url) {
    var host = hostOf(url);
    if (!HOSTS[host]) throw new Error('來源不在允許清單');
    var f = getFetch(); if (!f) throw new Error('此環境不支援網路查詢');
    await throttle(host);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : null;
    try {
      var res = await f(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var raw = await res.text();
      if (raw.length > MAX_BYTES) throw new Error('回應過大');
      var data = JSON.parse(raw);
      noteResult(host, true); return data;
    } catch (e) { noteResult(host, false); throw new Error(e && e.name === 'AbortError' ? '逾時' : String(e && e.message || e).slice(0, 80)); }
    finally { if (timer) clearTimeout(timer); }
  }
  function q(base, params) {
    var p = new URLSearchParams(params); p.set('format', 'json'); p.set('origin', '*'); return base + '?' + p.toString();
  }
  function page(url, host, title) { return 'https://' + host + '/wiki/' + encodeURIComponent(title); }

  var SOURCES = {
    wiktionary: async function (term) {
      var data = await getJson(q('https://zh.wiktionary.org/w/api.php', { action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'plain', titles: term, redirects: '1' }));
      var pages = data && data.query && data.query.pages || {}, pg = Object.keys(pages).map(function (k) { return pages[k]; })[0];
      if (!pg || pg.missing !== undefined || !pg.extract) return { source: 'wiktionary', ok: false, error: '查無詞條' };
      var title = norm(clip(pg.title || term, 48));
      return { source: 'wiktionary', ok: true, title: title, extract: clip(pg.extract, 1800), url: page('', 'zh.wiktionary.org', title), license: LICENSE.wiktionary.name, licenseUrl: LICENSE.wiktionary.url };
    },
    wikipedia: async function (term) {
      var data = await getJson(q('https://zh.wikipedia.org/w/api.php', { action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exchars: '500', titles: term, redirects: '1', variant: 'zh-tw' }));
      var pages = data && data.query && data.query.pages || {}, pg = Object.keys(pages).map(function (k) { return pages[k]; })[0];
      if (!pg || pg.missing !== undefined || !pg.extract) return { source: 'wikipedia', ok: false, error: '查無條目' };
      if (/可以指|可能指|消歧義|多個意思|may refer to/.test(pg.extract.slice(0, 120))) return { source: 'wikipedia', ok: false, error: '消歧義頁，不採用' };
      var title = norm(clip(pg.title || term, 48));
      return { source: 'wikipedia', ok: true, title: title, extract: clip(pg.extract, 600), url: page('', 'zh.wikipedia.org', title), license: LICENSE.wikipedia.name, licenseUrl: LICENSE.wikipedia.url };
    },
    wikidata: async function (term) {
      var data = await getJson(q('https://www.wikidata.org/w/api.php', { action: 'wbsearchentities', search: term, language: 'zh-hant', uselang: 'zh-hant', type: 'item', limit: '3' }));
      var hits = (data && data.search || []).filter(function (h) { var label = norm(clip(h.label || (h.display && h.display.label && h.display.label.value) || '', 48)); return label === term || norm(clip(h.match && h.match.text || '', 48)) === term; });
      if (!hits.length) return { source: 'wikidata', ok: false, error: '無相符項目' };
      var h = hits[0], id = /^Q\d+$/.test(h.id || '') ? h.id : '', aliases = [];
      if (id) {
        try {
          var e = await getJson(q('https://www.wikidata.org/w/api.php', { action: 'wbgetentities', ids: id, props: 'aliases', languages: 'zh-hant|zh-tw|zh' }));
          var ent = e && e.entities && e.entities[id], al = ent && ent.aliases || {};
          Object.keys(al).forEach(function (lang) { (al[lang] || []).forEach(function (a) { if (a && a.value && aliases.length < 8) aliases.push(norm(clip(a.value, 24))); }); });
        } catch (err) { /* aliases are optional */ }
      }
      var desc = clip(h.description || (h.display && h.display.description && h.display.description.value) || '', 120);
      return { source: 'wikidata', ok: true, title: norm(clip(h.label || term, 48)), description: norm(desc), aliases: aliases, url: id ? 'https://www.wikidata.org/wiki/' + id : '', license: LICENSE.wikidata.name, licenseUrl: LICENSE.wikidata.url };
    }
  };

  /* ---- cache ---- */
  function readCache() {
    try { var v = JSON.parse(root.localStorage.getItem(CACHE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function writeCache(c) {
    var keys = Object.keys(c);
    if (keys.length > MAX_CACHE) keys.sort(function (a, b) { return c[a].at - c[b].at; }).slice(0, keys.length - MAX_CACHE).forEach(function (k) { delete c[k]; });
    try { root.localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ }
  }
  async function lookup(termInput, opts) {
    opts = opts || {};
    var safe = isSafeTerm(termInput, opts); if (!safe.ok) throw new Error(safe.reason);
    var term = safe.term, now = env.now(), cache = readCache();
    if (!opts.force && cache[term] && now - cache[term].at < TTL) return { term: term, results: cache[term].results, errors: [], fromCache: true };
    var wanted = (opts.sources && opts.sources.length ? opts.sources : ['wiktionary', 'wikipedia', 'wikidata']).filter(function (s) { return SOURCES[s]; });
    var settled = await Promise.all(wanted.map(function (name) { return SOURCES[name](term).catch(function (e) { return { source: name, ok: false, error: String(e && e.message || e).slice(0, 80), network: true }; }); }));
    var errors = settled.filter(function (r) { return !r.ok; }).map(function (r) { return r.source + '：' + r.error; });
    var allNet = settled.length && settled.every(function (r) { return !r.ok && r.network; });
    if (!allNet) { cache[term] = { at: now, results: settled }; writeCache(cache); }
    return { term: term, results: settled, errors: errors, fromCache: false, offline: !!allNet };
  }
  function clearCache() { try { root.localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ } }
  function status() {
    var s = {}; Object.keys(HOSTS).forEach(function (h) { var st = hostState[h]; s[HOSTS[h]] = { paused: !!(st && st.until > env.now()), fails: st ? st.fails : 0 }; });
    return { version: VERSION, hosts: s, cached: Object.keys(readCache()).length };
  }
  function configure(o) { if (o && o.fetch) env.fetch = o.fetch; if (o && o.now) env.now = o.now; if (o && o.sleep) env.sleep = o.sleep; hostState = Object.create(null); }

  root.NiukouWebSearch = { version: VERSION, isSafeTerm: isSafeTerm, lookup: lookup, status: status, clearCache: clearCache, configure: configure, sources: Object.keys(SOURCES), licenses: LICENSE, hosts: Object.keys(HOSTS) };
})(typeof window !== 'undefined' ? window : globalThis);
