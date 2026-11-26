/* Local data-only vocabulary cues. Suggestions enrich context; they never decide game outcomes. */
(function (root) {
  'use strict';
  function packs() {
    var runtime = root.WulinPackRuntime;
    return runtime && typeof runtime.all === 'function' ? runtime.all() : [];
  }
  function clean(value) {
    return String(value == null ? '' : value).normalize ? String(value == null ? '' : value).normalize('NFC') : String(value == null ? '' : value);
  }
  function entryRows() {
    var rows = [];
    packs().forEach(function (pack) {
      var content = pack && pack.content || {};
      (content.entries || []).forEach(function (entry) {
        rows.push({ entry: entry, source: pack.id });
      });
      (content.glossary || []).forEach(function (entry, index) {
        rows.push({ entry: Object.assign({ id: pack.id + '-glossary-' + index, aliases: [] }, entry), source: pack.id });
      });
    });
    return rows;
  }
  function match(text, limit) {
    var input = clean(text).slice(0, 1000);
    if (!input) return [];
    var hits = [];
    entryRows().forEach(function (row) {
      var entry = row.entry || {}, forms = [entry.term].concat(entry.aliases || []).filter(function (term) { return typeof term === 'string' && term.length >= 2; });
      var matched = forms.filter(function (term) { return input.indexOf(clean(term)) >= 0; });
      if (!matched.length) return;
      hits.push({ id: entry.id, term: entry.term, matched: matched.slice(0, 3), meaning: entry.meaning || '', register: entry.register || '', useWhen: (entry.useWhen || []).slice(0, 3), avoidWhen: (entry.avoidWhen || []).slice(0, 3), responseNeed: entry.responseNeed || '', source: row.source });
    });
    hits.sort(function (a, b) { return String(b.term || '').length - String(a.term || '').length; });
    var seen = Object.create(null), out = [];
    hits.forEach(function (hit) { if (!seen[hit.id] && out.length < (limit || 4)) { seen[hit.id] = true; out.push(hit); } });
    return out;
  }
  root.NiukouVocabulary = { version: '1.0.0', match: match, entries: entryRows };
})(typeof window !== 'undefined' ? window : globalThis);
