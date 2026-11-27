/* Small, auditable local MLP. It proposes labels only; game rules remain authoritative. */
(function (root) {
  'use strict';
  var CATS = ['good', 'neutral', 'evil', 'off'];
  var INPUTS = 512, HIDDEN = 20, RATE = 0.04, MOM = 0.6, L2 = 0.00008, MAXROWS = 360, EPOCHS = 40;
  var cacheKey = '', cacheModel = null, cacheRows = [];
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function features(text) {
    var T = root.NiukouText, src = String(text || '');
    if (T && T.normalize) src = T.normalize(src);
    var s = src.replace(/[\s，,。．.！!？?；;：:、「」『』（）()…—\-~～]/g, '').toLowerCase();
    var chars = Array.from(s), set = Object.create(null), out = [];
    function add(key) { set[hash(key) % INPUTS] = true; }
    for (var n = 2; n <= 3; n++) for (var i = 0; i <= chars.length - n; i++) add(chars.slice(i, i + n).join(''));
    if (T && T.words) { try { T.words(src).forEach(function (w) { add('w:' + w); }); } catch (e) { /* optional */ } }
    if (T && T.synonymTags) { try { T.synonymTags(src).forEach(function (g) { add('t:' + (g.id || g)); }); } catch (e) { /* optional */ } }
    if (root.NiukouEmotion && root.NiukouEmotion.analyze) { try { var em = root.NiukouEmotion.analyze(src); (em.emotions || []).slice(0, 3).forEach(function (x) { add('e:' + x.id); }); } catch (e) { /* optional */ } }
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
    return { w1: w1, b1: b1, w2: w2, b2: b2, v1: new Float32Array(INPUTS * HIDDEN), vb1: new Float32Array(HIDDEN), v2: new Float32Array(HIDDEN * CATS.length), vb2: new Float32Array(CATS.length) };
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
    for (var epoch = 0; epoch < EPOCHS; epoch++) {
      var lr = RATE * (1 - 0.5 * epoch / EPOCHS);
      for (var r = 0; r < rows.length; r++) {
        var row = rows[(r * 7 + epoch * 13) % rows.length], pass = forward(model, row.x), err = new Float32Array(CATS.length), dh = new Float32Array(HIDDEN), g = lr * row.weight;
        for (var c = 0; c < CATS.length; c++) err[c] = pass.p[c] - (c === row.y ? 1 : 0);
        for (var j = 0; j < HIDDEN; j++) for (var k = 0; k < CATS.length; k++) dh[j] += model.w2[j * CATS.length + k] * err[k];
        for (var o = 0; o < CATS.length; o++) {
          model.vb2[o] = MOM * model.vb2[o] - g * err[o]; model.b2[o] += model.vb2[o];
          for (var h = 0; h < HIDDEN; h++) { var i2 = h * CATS.length + o; model.v2[i2] = MOM * model.v2[i2] - g * (pass.h[h] * err[o] + L2 * model.w2[i2]); model.w2[i2] += model.v2[i2]; }
        }
        for (var u = 0; u < HIDDEN; u++) {
          var he = dh[u] * (1 - pass.h[u] * pass.h[u]);
          model.vb1[u] = MOM * model.vb1[u] - g * he; model.b1[u] += model.vb1[u];
          for (var f = 0; f < row.x.length; f++) { var i1 = row.x[f] * HIDDEN + u; model.v1[i1] = MOM * model.v1[i1] - g * (he + L2 * model.w1[i1]); model.w1[i1] += model.v1[i1]; }
        }
      }
    }
    return model;
  }
  /* kNN memory: weighted Jaccard vote over stored training rows; complements the MLP on rare phrasings. */
  function knn(rows, x, k) {
    var set = Object.create(null); x.forEach(function (i) { set[i] = true; });
    var scored = rows.map(function (r) {
      var inter = 0; r.x.forEach(function (i) { if (set[i]) inter++; });
      var uni = r.x.length + x.length - inter; return { y: r.y, w: r.weight, s: uni ? inter / uni : 0 };
    }).filter(function (r) { return r.s > 0.08; }).sort(function (a, b) { return b.s - a.s; }).slice(0, k || 5);
    var p = new Float32Array(CATS.length), sum = 0;
    scored.forEach(function (r) { p[r.y] += r.s * r.w; sum += r.s * r.w; });
    if (!sum) return null;
    for (var i = 0; i < p.length; i++) p[i] /= sum;
    return { p: p, strength: Math.min(1, sum / 1.2) };
  }
  function blend(model, rows, x) {
    var m = forward(model, x).p, kn = knn(rows, x, 5);
    if (!kn) return m;
    var w = 0.3 * kn.strength, out = new Float32Array(CATS.length);
    for (var i = 0; i < out.length; i++) out[i] = m[i] * (1 - w) + kn.p[i] * w;
    return out;
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
    var threshold = getThresholds(), manual = (Array.isArray(samples) ? samples : []).filter(function (s) { return s && s.src !== 'auto' && CATS.indexOf(s.c) >= 0 && typeof s.t === 'string'; }).slice(-300);
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
      var rows = training.slice(-MAXROWS).map(function (r) { return { x: features(r.text), y: r.y, weight: r.weight }; }).filter(function (r) { return r.x.length; });
      cacheRows = rows; cacheModel = train(createModel(signature), rows); cacheKey = signature;
    }
    var output = blend(cacheModel, cacheRows, features(text)), ranked = CATS.map(function (cat, i) { return { cat: cat, p: output[i] }; }).sort(function (a, b) { return b.p - a.p; });
    var marginValue = ranked[0].p - ranked[1].p;
    if (ranked[0].p < threshold.confidence || marginValue < threshold.margin) return { cat: ranked[0].cat, p: ranked[0].p, margin: marginValue, accepted: false, feedbackCount: manual.length };
    return { cat: ranked[0].cat, p: ranked[0].p, margin: marginValue, accepted: true, feedbackCount: manual.length };
  }
  /* k-fold cross-validation on labelled rows [{t,c}] using the same trainer (no gates). */
  function evaluate(rows, k) {
    var data = (rows || []).filter(function (r) { return r && CATS.indexOf(r.c) >= 0 && r.t; }).map(function (r) { return { x: features(r.t), y: CATS.indexOf(r.c), weight: 1 }; }).filter(function (r) { return r.x.length; });
    k = Math.max(2, Math.min(10, k || 5));
    if (data.length < k * 2) return null;
    var order = data.map(function (_, i) { return i; }).sort(function (a, b) { return (hash(String(a)) ^ 0x5bd1e995) - (hash(String(b)) ^ 0x5bd1e995); });
    var ok = 0, okMlp = 0, total = 0, per = CATS.map(function () { return { n: 0, ok: 0 }; });
    for (var f = 0; f < k; f++) {
      var test = [], tr = [];
      order.forEach(function (idx, pos) { (pos % k === f ? test : tr).push(data[idx]); });
      var model = train(createModel('cv' + f), tr);
      test.forEach(function (r) {
        var p = blend(model, tr, r.x), best = 0; for (var c = 1; c < p.length; c++) if (p[c] > p[best]) best = c;
        var pm = forward(model, r.x).p, bm = 0; for (var d = 1; d < pm.length; d++) if (pm[d] > pm[bm]) bm = d;
        total++; per[r.y].n++; if (best === r.y) { ok++; per[r.y].ok++; } if (bm === r.y) okMlp++;
      });
    }
    return { folds: k, n: total, accuracy: +(ok / total).toFixed(3), mlpOnly: +(okMlp / total).toFixed(3), perClass: CATS.map(function (c, i) { return { cat: c, n: per[i].n, accuracy: per[i].n ? +(per[i].ok / per[i].n).toFixed(3) : null }; }) };
  }
  function modelInfo() { return { version: '0.2.0', inputs: INPUTS, hidden: HIDDEN, classes: CATS.slice(), maxRows: MAXROWS, trained: cacheRows.length, ensemble: 'mlp+knn', optimizer: 'sgd-momentum-l2' }; }
  root.NiukouNeural = { version: '0.2.0', model: 'hashed-ngram-word-emotion-mlp+knn', classify: classify, evaluate: evaluate, modelInfo: modelInfo, _features: features };
})(typeof window !== 'undefined' ? window : globalThis);
