/* Small, auditable local MLP. It proposes labels only; game rules remain authoritative. */
(function (root) {
  'use strict';
  var CATS = ['good', 'neutral', 'evil', 'off'];
  var INPUTS = 256, HIDDEN = 14, RATE = 0.045;
  var cacheKey = '', cacheModel = null;
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function features(text) {
    var s = String(text || '').replace(/[\s，,。．.！!？?；;：:、「」『』（）()…—\-~～]/g, '').toLowerCase();
    var chars = Array.from(s), set = Object.create(null), out = [];
    for (var n = 2; n <= 3; n++) for (var i = 0; i <= chars.length - n; i++) set[hash(chars.slice(i, i + n).join('')) % INPUTS] = true;
    Object.keys(set).forEach(function (k) { out.push(Number(k)); });
    if (!out.length && chars.length) out.push(hash(chars.join('')) % INPUTS);
    return out;
  }
  function seedRandom(seed) {
    var x = seed >>> 0 || 1;
    return function () { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  }
  function createModel(signature) {
    var rand = seedRandom(hash(signature));
    var w1 = new Float32Array(INPUTS * HIDDEN), b1 = new Float32Array(HIDDEN);
    var w2 = new Float32Array(HIDDEN * CATS.length), b2 = new Float32Array(CATS.length);
    for (var i = 0; i < w1.length; i++) w1[i] = (rand() - 0.5) * 0.12;
    for (var j = 0; j < w2.length; j++) w2[j] = (rand() - 0.5) * 0.12;
    return { w1: w1, b1: b1, w2: w2, b2: b2 };
  }
  function forward(model, x) {
    var h = new Float32Array(HIDDEN), logits = new Float32Array(CATS.length), max = -Infinity, sum = 0;
    for (var j = 0; j < HIDDEN; j++) {
      var z = model.b1[j];
      for (var i = 0; i < x.length; i++) z += model.w1[x[i] * HIDDEN + j];
      h[j] = Math.tanh(z);
    }
    for (var c = 0; c < CATS.length; c++) {
      var v = model.b2[c];
      for (var k = 0; k < HIDDEN; k++) v += h[k] * model.w2[k * CATS.length + c];
      logits[c] = v; if (v > max) max = v;
    }
    for (var q = 0; q < CATS.length; q++) { logits[q] = Math.exp(logits[q] - max); sum += logits[q]; }
    for (var p = 0; p < CATS.length; p++) logits[p] /= sum || 1;
    return { h: h, p: logits };
  }
  function train(model, rows) {
    for (var epoch = 0; epoch < 18; epoch++) {
      for (var r = 0; r < rows.length; r++) {
        var row = rows[(r + epoch * 7) % rows.length], pass = forward(model, row.x), err = new Float32Array(CATS.length), dh = new Float32Array(HIDDEN);
        for (var c = 0; c < CATS.length; c++) err[c] = pass.p[c] - (c === row.y ? 1 : 0);
        for (var j = 0; j < HIDDEN; j++) for (var k = 0; k < CATS.length; k++) dh[j] += model.w2[j * CATS.length + k] * err[k];
        for (var o = 0; o < CATS.length; o++) {
          model.b2[o] -= RATE * row.weight * err[o];
          for (var h = 0; h < HIDDEN; h++) model.w2[h * CATS.length + o] -= RATE * row.weight * pass.h[h] * err[o];
        }
        for (var u = 0; u < HIDDEN; u++) {
          var hiddenError = dh[u] * (1 - pass.h[u] * pass.h[u]);
          model.b1[u] -= RATE * row.weight * hiddenError;
          for (var f = 0; f < row.x.length; f++) model.w1[row.x[f] * HIDDEN + u] -= RATE * row.weight * hiddenError;
        }
      }
    }
    return model;
  }
  function dataExamples() {
    var runtime = root.WulinPackRuntime, rows = [];
    if (!runtime || !runtime.all) return rows;
    runtime.all().forEach(function (pack) {
      var examples = pack && pack.content && pack.content.examples;
      if (!Array.isArray(examples)) return;
      examples.forEach(function (ex) { var y = CATS.indexOf(ex && ex.category); if (y >= 0 && ex.input) rows.push({ text: ex.input, y: y, weight: 0.65, human: false }); });
    });
    return rows;
  }
  function getThresholds() {
    var minimum = 12, confidence = 0.78, margin = 0.18;
    var runtime = root.WulinPackRuntime, p = runtime && runtime.get && runtime.get('niukou-judgement-zh-hant');
    var policy = p && p.content && p.content.policy;
    if (policy) {
      if (Number.isInteger(policy.neuralRequiresHumanExamples)) minimum = Math.max(12, Math.min(200, policy.neuralRequiresHumanExamples));
      if (typeof policy.neuralMinimumConfidence === 'number') confidence = Math.max(0.78, Math.min(0.98, policy.neuralMinimumConfidence));
      if (typeof policy.neuralMinimumMargin === 'number') margin = Math.max(0.18, Math.min(0.5, policy.neuralMinimumMargin));
    }
    return { minimum: minimum, confidence: confidence, margin: margin };
  }
  function classify(text, samples) {
    var threshold = getThresholds(), manual = (Array.isArray(samples) ? samples : []).filter(function (s) { return s && s.src !== 'auto' && CATS.indexOf(s.c) >= 0 && typeof s.t === 'string'; }).slice(-160);
    var labels = Object.create(null); manual.forEach(function (s) { labels[s.c] = true; });
    var manualClasses = Object.keys(labels).length;
    if (manual.length < threshold.minimum || manualClasses < 2) return null;
    var training = dataExamples();
    var lastText = Object.create(null);
    manual.forEach(function (s) { lastText[String(s.t).replace(/\s/g, '')] = s; });
    training = training.filter(function (r) { return !lastText[String(r.text).replace(/\s/g, '')]; });
    manual.forEach(function (s) { training.push({ text: s.t, y: CATS.indexOf(s.c), weight: s.src === 'correct' ? 1.8 : 1.35, human: true }); });
    var distinct = Object.create(null);
    training.forEach(function (r) { distinct[r.y] = true; });
    if (Object.keys(distinct).length < 2) return null;
    var signature = training.map(function (r) { return CATS[r.y] + ':' + r.text + ':' + r.weight; }).join('|');
    if (signature !== cacheKey) {
      var rows = training.slice(-200).map(function (r) { return { x: features(r.text), y: r.y, weight: r.weight }; }).filter(function (r) { return r.x.length; });
      cacheModel = train(createModel(signature), rows); cacheKey = signature;
    }
    var output = forward(cacheModel, features(text)).p, ranked = CATS.map(function (cat, i) { return { cat: cat, p: output[i] }; }).sort(function (a, b) { return b.p - a.p; });
    var marginValue = ranked[0].p - ranked[1].p;
    if (ranked[0].p < threshold.confidence || marginValue < threshold.margin) return { cat: ranked[0].cat, p: ranked[0].p, margin: marginValue, accepted: false, feedbackCount: manual.length };
    return { cat: ranked[0].cat, p: ranked[0].p, margin: marginValue, accepted: true, feedbackCount: manual.length };
  }
  root.NiukouNeural = { version: '0.1.0', model: 'hashed-char-ngram-mlp', classify: classify, _features: features };
})(typeof window !== 'undefined' ? window : globalThis);
