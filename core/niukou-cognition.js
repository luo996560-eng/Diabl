/* Pack-driven interpretation layer. Enriches analysis; it never writes game state. */
(function (root) {
  'use strict';
  function contents() {
    var runtime = root.WulinPackRuntime;
    return runtime && typeof runtime.all === 'function' ? runtime.all().map(function (p) { return p && p.content || {}; }) : [];
  }
  function byModule(name) { return contents().filter(function (c) { return c.module === name; }); }
  function negatedBefore(text, at, cues) {
    var left = text.slice(Math.max(0, at - 10), at).split(/[，,。！？!?；;]/).pop() || '';
    if (/不過|不然|不但|不僅|不管|不得不/.test(left)) return false;
    return cues.some(function (word) { return word && left.endsWith(word); });
  }
  function scoreEmotions(text, pack) {
    var content = pack || {}, negators = content.negationCues || ['不', '沒', '無', '未'];
    var intensityCues = content.intensityCues || [], found = [];
    (content.categories || []).forEach(function (category) {
      var score = 0, hits = [];
      (category.cues || []).forEach(function (cue) {
        var from = 0, at;
        while ((at = text.indexOf(cue.term, from)) >= 0) {
          from = at + cue.term.length;
          if (negatedBefore(text, at, negators)) continue;
          var weight = cue.weight || 0.5;
          intensityCues.forEach(function (mod) {
            var left = text.slice(Math.max(0, at - mod.term.length - 2), at);
            if (left.endsWith(mod.term)) weight *= mod.factor;
          });
          score += weight; hits.push(cue.term);
        }
      });
      if (score > 0) found.push({ id: category.id, label: category.label, score: Math.min(1, score / 1.5), valence: category.valence, arousal: category.arousal, cues: hits.slice(0, 4), responseNeed: category.responseNeed });
    });
    found.sort(function (a, b) { return b.score - a.score; });
    return found.slice(0, 3);
  }
  function matchLanguage(text) {
    var found = [];
    byModule('language').forEach(function (module) {
      (module.cues || []).forEach(function (cue) {
        var hits = (cue.terms || []).filter(function (term) { return text.indexOf(term) >= 0; });
        if (hits.length) found.push({ id: cue.id, label: cue.label, cues: hits.slice(0, 3), note: cue.note || '' });
      });
    });
    return found.slice(0, 6);
  }
  var REFERENCE_TERMS = ['前面提到的', '剛才說的', '那件事', '那個人', '那位', '那封信', '那把劍', '他們', '她們', '他', '她', '它'];
  var CONTEXT_ENTITIES = ['掌門', '師父', '師兄', '師姐', '師弟', '師妹', '長老', '前輩', '妹妹', '兄長', '鏢師', '鏢隊', '密函', '解藥', '劍譜', '令牌', '仇人', '恩人'];
  function inspectReferences(text, history) {
    var references = REFERENCE_TERMS.filter(function (term) { return text.indexOf(term) >= 0; });
    if (!references.length) return null;
    var turns = Array.isArray(history) ? history.slice(-8) : [], candidates = [], sourceText = '';
    for (var i = turns.length - 1; i >= 0; i--) {
      var message = turns[i], body = typeof message === 'string' ? message : message && typeof message.text === 'string' ? message.text : '';
      if (!body) continue;
      var found = CONTEXT_ENTITIES.filter(function (entity) { return body.indexOf(entity) >= 0; });
      if (found.length) { candidates = found; sourceText = body.slice(0, 120); break; }
    }
    candidates = candidates.filter(function (entity, index) { return candidates.indexOf(entity) === index; });
    return { references: references.slice(0, 3), candidate: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length !== 1, needsClarification: candidates.length !== 1, historyEvidence: sourceText };
  }
  function responsePlan(parsed, emotions, language, context) {
    var keys = [parsed && parsed.intent || 'uncertain'];
    emotions.forEach(function (e) { keys.push(e.id); });
    language.forEach(function (e) { keys.push(e.id); });
    if (context) keys.push(context.needsClarification ? 'ambiguous-reference' : 'reference-resolution');
    var candidates = [];
    byModule('response').forEach(function (module) {
      (module.strategies || []).forEach(function (strategy) {
        var matches = (strategy.when || []).filter(function (w) { return keys.indexOf(w) >= 0; });
        if (matches.length) candidates.push({ id: strategy.id, matched: matches, steps: strategy.steps.slice(0, 4), avoid: strategy.avoid.slice(0, 4) });
      });
    });
    return candidates.slice(0, 2);
  }
  function enrich(parsed, rawText, history) {
    var out = Object.assign({}, parsed || {}), text = String(rawText == null ? out.raw || '' : rawText);
    var emotionPacks = byModule('emotion'), emotions = [];
    emotionPacks.forEach(function (pack) { emotions = emotions.concat(scoreEmotions(text, pack)); });
    emotions.sort(function (a, b) { return b.score - a.score; });
    emotions = emotions.slice(0, 3);
    var language = matchLanguage(text), context = inspectReferences(text, history), plans = responsePlan(out, emotions, language, context);
    var vocabulary = root.NiukouVocabulary && typeof root.NiukouVocabulary.match === 'function' ? root.NiukouVocabulary.match(text, 4) : [];
    var prior = Array.isArray(out.emotions) ? out.emotions.slice() : [];
    emotions.forEach(function (emotion) { if (prior.indexOf(emotion.label) < 0) prior.push(emotion.label); });
    out.emotions = prior;
    out.cognition = {
      language: language,
      emotions: emotions,
      vocabulary: vocabulary,
      context: context,
      responsePlan: plans,
      modules: contents().map(function (c) { return c.module; }).filter(Boolean),
      isProposalOnly: true
    };
    return out;
  }
  function attach(engine) {
    if (!engine || typeof engine.parse !== 'function' || engine.__cognitionAttached) return engine;
    var original = engine.parse;
    engine.parse = function (text, history, legacy) { return enrich(original.call(engine, text, history, legacy), text, history); };
    engine.__cognitionAttached = true;
    return engine;
  }
  root.NiukouCognition = { version: '0.2.0', enrich: enrich, attach: attach, inspect: function (text, parsed, history) { return enrich(parsed || {}, text, history).cognition; } };
})(typeof window !== 'undefined' ? window : globalThis);
