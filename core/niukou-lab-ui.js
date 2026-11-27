/* Niukou lab panels for the practice ground. Rendering and click handlers only; all learning logic lives in core modules.
 * Relies on game globals at call time: escapeEventHTML, renderEvent, toast, confirmBox, nbFeedback, DD_CAT_LABEL. */
(function (root) {
  'use strict';
  function esc(v) { return root.escapeEventHTML ? root.escapeEventHTML(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function say(m) { if (typeof root.toast === 'function') root.toast(m); }
  function redraw() { if (typeof root.renderEvent === 'function') root.renderEvent(); }
  var BTN = 'class="ghost" style="width:auto;margin:3px;padding:4px 10px;font-size:12px;min-height:32px"';
  var busy = false, notice = '';
  function link(url, text) { return /^https:\/\//.test(url || '') ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>' : esc(text); }

  function versions() {
    var names = ['Guide', 'Text', 'Emotion', 'Empathy', 'Dialogue', 'VocabIntegration', 'VocabUsage', 'Imitation', 'Learning', 'WebSearch', 'Neural', 'Cognition'];
    var labels = { Guide: '問答', Text: '語言詞彙', Emotion: '情感', Empathy: '共感', Dialogue: '對話', VocabIntegration: '詞彙整合', VocabUsage: '詞彙運用', Imitation: '模仿', Learning: '自主學習', WebSearch: '網路詞彙', Neural: '神經網絡', Cognition: '認知總成' };
    return names.map(function (n) { var m = root['Niukou' + n]; return labels[n] + (m ? ' v' + esc(m.version) : '（未載入）'); }).join('・');
  }

  function section(title, body, open) { return '<details class="info-card" style="margin:12px 0;line-height:1.7"' + (open ? ' open' : '') + '><summary style="cursor:pointer"><b>' + title + '</b></summary>' + body + '</details>'; }

  function learningPanel() {
    var L = root.NiukouLearning, V = root.NiukouVocabIntegration; if (!L || !V) return '';
    var sm = L.summary(), set = L.settings(), h = '';
    h += '<p style="font-size:12px;color:var(--muted);margin:6px 0">預設關閉。開啟後，鈕釦只會在你說話時遇到「什麼是○○」「「○○」是什麼意思」這類不認識的詞，才在背景查詢該單一詞語（中文維基詞典、維基百科、維基數據）。不會送出你的句子、姓名或存檔；每天最多 ' + sm.dailyCap + ' 次，今天已用 ' + sm.today + ' 次；查到的內容先成為草稿，須由你審核才會採用，且不參與判定。</p>';
    h += '<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" ' + (set.autoWeb ? 'checked' : '') + ' onchange="nkLabAuto(this.checked)"> 允許鈕釦自主查詢陌生詞語</label>';
    h += '<div style="font-size:12px;margin:4px 0">來源：' + ['wiktionary', 'wikipedia', 'wikidata'].map(function (k) { var n = { wiktionary: '維基詞典', wikipedia: '維基百科', wikidata: '維基數據' }[k]; return '<label style="margin-right:10px"><input type="checkbox" ' + (set.sources[k] ? 'checked' : '') + ' onchange="nkLabSource(\'' + k + '\',this.checked)"> ' + n + '</label>'; }).join('') + '</div>';
    if (notice) h += '<div role="status" style="font-size:12px;color:var(--gold);margin:4px 0">' + esc(notice) + '</div>';
    if (busy) h += '<div style="font-size:12px;color:var(--muted)">查詢中…</div>';
    var q = L.queue();
    h += '<div style="margin-top:8px"><b style="font-size:13px">好奇清單（' + q.length + '）</b>';
    q.slice(0, 6).forEach(function (it, i) { h += '<div style="padding:4px 0;border-top:1px dashed var(--line);font-size:12px">「' + esc(it.term) + '」×' + it.count + '<button type="button" ' + BTN + ' onclick="nkLabLookup(' + i + ')">現在查詢</button><button type="button" ' + BTN + ' onclick="nkLabSkip(' + i + ')">略過</button></div>'; });
    if (!q.length) h += '<div style="font-size:12px;color:var(--muted)">目前沒有待查詞語。你也可以直接加入：</div>';
    h += '<input id="nkQueueTerm" class="dd-input" type="text" maxlength="16" autocomplete="off" placeholder="例如：以柔克剛" onkeydown="if(event.key===\'Enter\'&&!event.isComposing)nkLabAdd()"><button type="button" ' + BTN + ' onclick="nkLabAdd()">加入好奇清單</button></div>';
    var dr = V.drafts();
    h += '<div style="margin-top:8px"><b style="font-size:13px">待審草稿（' + dr.length + '）</b>';
    dr.slice(0, 5).forEach(function (d, i) {
      h += '<div style="padding:6px;margin:4px 0;border:1px solid var(--line);border-radius:8px;font-size:12px"><b>' + esc(d.term) + '</b>（' + esc(d.register || '') + '・可信度 ' + Math.round((d.confidence || 0) * 100) + '%）<div style="margin:3px 0">' + esc(d.meaning) + '</div><div style="color:var(--muted)">來源：' + (d.sources || []).map(function (s) { return link(s.url, s.source) + '（' + link(s.licenseUrl, s.license || '授權未標示') + '）'; }).join('、') + '</div><button type="button" ' + BTN + ' onclick="nkLabApprove(' + i + ')">採用</button><button type="button" ' + BTN + ' onclick="nkLabReject(' + i + ')">捨棄</button></div>';
    });
    h += '</div>';
    if (sm.log.length) {
      h += '<div style="margin-top:8px"><b style="font-size:13px">查詢紀錄（你可隨時檢查）</b>';
      sm.log.forEach(function (r) { h += '<div style="font-size:11px;color:var(--muted)">' + new Date(r.at).toLocaleString() + '・「' + esc(r.term) + '」・' + (r.auto ? '自主' : '手動') + '・' + (r.cached ? '快取' : r.ok ? '已查詢' : '失敗') + '・' + esc(r.sources.join('/')) + '</div>'; });
      h += '</div>';
    }
    h += '<div style="margin-top:6px"><button type="button" ' + BTN + ' onclick="nkLabClearWeb()">清除快取與紀錄</button></div>';
    return section('自主上網學習詞彙', h, sm.autoWeb || dr.length > 0);
  }

  function lexiconPanel() {
    var V = root.NiukouVocabIntegration; if (!V) return '';
    var st = V.stats(), es = V.entries(), h = '';
    h += '<div style="font-size:12px;color:var(--muted)">內建詞庫 ' + st.pack + ' 條・你採用 ' + st.approved + ' 條・你教的 ' + st.taught + ' 條。這些詞只幫鈕釦理解上下文，不改變判定與遊戲數值。</div>';
    es.slice(-6).reverse().forEach(function (e, ri) { var idx = es.length - 1 - ri; h += '<div style="padding:4px 0;border-top:1px dashed var(--line);font-size:12px"><b>' + esc(e.term) + '</b>：' + esc(e.meaning) + '<button type="button" ' + BTN + ' onclick="nkLabRemoveWord(' + idx + ')">移除</button></div>'; });
    h += '<div style="margin-top:6px"><input id="nkTeachTerm" class="dd-input" type="text" maxlength="16" placeholder="詞語" style="margin-bottom:4px"><input id="nkTeachMeaning" class="dd-input" type="text" maxlength="120" placeholder="這個詞的意思" onkeydown="if(event.key===\'Enter\'&&!event.isComposing)nkLabTeach()"><button type="button" ' + BTN + ' onclick="nkLabTeach()">教鈕釦這個詞</button><button type="button" ' + BTN + ' onclick="nkLabExportLexicon()">匯出我的詞庫 JSON</button></div>';
    var due = root.NiukouLearning ? root.NiukouLearning.dueReviews() : [];
    if (due.length) { h += '<div style="margin-top:6px;font-size:12px"><b>該複習了</b>'; due.forEach(function (d, i) { h += '<div>「' + esc(d.term) + '」：' + esc(d.meaning) + '<button type="button" ' + BTN + ' onclick="nkLabReview(' + i + ',true)">還記得</button><button type="button" ' + BTN + ' onclick="nkLabReview(' + i + ',false)">忘了</button></div>'; }); h += '</div>'; }
    return section('我的詞庫與教學', h, false);
  }

  function questionsPanel() {
    var L = root.NiukouLearning; if (!L) return '';
    var qs = L.questions(2), h = '', lab = root.DD_CAT_LABEL || {};
    if (!qs.length) h += '<div style="font-size:12px;color:var(--muted)">目前沒有拿不準的句子。鈕釦把握不高的判讀會出現在這裡，請你直接告訴它答案。</div>';
    qs.forEach(function (q, i) {
      h += '<div style="padding:6px 0;border-top:1px dashed var(--line);font-size:13px">「' + esc(q.t) + '」<div style="font-size:12px;color:var(--muted)">鈕釦原本判為「' + esc(lab[q.c] || q.c) + '」，只有 ' + Math.round(q.p * 100) + '% 把握。這句應該是？</div>';
      ['good', 'neutral', 'evil', 'off'].forEach(function (c) { h += '<button type="button" ' + BTN + ' onclick="nkLabAnswer(' + i + ',\'' + c + '\')">' + esc(lab[c] || c) + '</button>'; });
      h += '</div>';
    });
    var cal = L.calibration().filter(function (b) { return b.n > 0; });
    if (cal.length) h += '<div style="font-size:11px;color:var(--muted);margin-top:6px">把握度校準：' + cal.map(function (b) { return b.range + ' 實際 ' + Math.round(b.accuracy * 100) + '%（' + b.n + '）'; }).join('・') + '</div>';
    return section('鈕釦的疑問（主動學習）', h, qs.length > 0);
  }

  function imitationPanel() {
    var I = root.NiukouImitation; if (!I) return '';
    var s = I.summary(), h = '';
    if (!s.ready) h += '<div style="font-size:12px;color:var(--muted)">已觀察 ' + s.n + ' 句，再多說幾句，鈕釦才會抓到你的說話風格。</div>';
    else {
      h += '<div style="font-size:12px">你的風格：<b>' + esc(s.label) + '</b>・平均 ' + s.avgLength + ' 字' + (s.favorites.length ? '・常用：' + s.favorites.map(esc).join('、') : '') + '</div>';
      var demo = I.mirror('你說得有道理，我們先把這件事談清楚。');
      h += '<div style="font-size:12px;margin-top:4px">鈕釦只會用這種風格調整自己的措辭，示範：「' + esc(demo.text) + '」</div>';
    }
    h += '<div style="font-size:11px;color:var(--muted);margin-top:4px">只記錄風格統計，不保存你的原句，也不會模仿他人或冒充任何人。</div><button type="button" ' + BTN + ' onclick="nkLabResetStyle()">重設風格觀察</button>';
    return section('模仿（說話風格）', h, false);
  }

  function modulesPanel() {
    var rt = root.WulinPackRuntime, n = rt && rt.all ? rt.all().length : 0;
    var h = '<div style="font-size:12px;color:var(--muted);line-height:1.8">' + versions() + '<br>資料包 ' + n + ' 個（狀態：' + esc(rt ? rt.status : '未啟用') + '）。全部以本機規則與小型模型運作，不使用大型語言模型。</div>';
    var N = root.NiukouNeural; if (N && N.modelInfo) { var mi = N.modelInfo(); h += '<div style="font-size:12px;color:var(--muted)">神經網絡：' + mi.inputs + ' 維特徵・' + mi.hidden + ' 隱藏單元・' + esc(mi.ensemble) + '・需至少 12 條你的人工回饋才會參與提案。</div>'; }
    return section('鈕釦模組總覽', h, false);
  }

  /* ---- ask Niukou: game help, definitions, small utilities ---- */
  var asked = null, askBusy = false;
  function stateSnapshot() {
    var S = root.S; if (!S || typeof S.age !== 'number') return null;
    var n = function (v) { return typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : undefined; };
    var o = { '年齡': n(S.age), '月份': typeof S.month === 'number' ? S.month + 1 : undefined, '武力': n(S.martial), '內力': n(S.inner), '悟性': n(S.wisdom), '福緣': n(S.fortune), '靜': n(S.calm), '血量': n(S.hp), '血量上限': n(S.maxHp), '銀兩': n(S.money), '名聲': n(S.fame), '俠氣': n(S.righteous), '魔性': n(S.demonic), '壓力': n(S.stress) };
    if (S.partner) o['伴侶'] = '有';
    Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete o[k]; });
    return o;
  }
  function prepareGuide() { if (root.NiukouGuide && root.WIKI_DATA) root.NiukouGuide.setSources({ wiki: root.WIKI_DATA }); }
  function askPanel() {
    var G = root.NiukouGuide; if (!G) return '';
    var h = '<p style="font-size:12px;color:var(--muted);margin:6px 0">可以問遊戲怎麼玩、鈕釦的功能、詞語的意思、簡單算數與日期，也可以說說心情。鈕釦不確定時會直說，不會亂答。讀取你的屬性只是唯讀快照。</p>';
    h += '<input id="nkAsk" class="dd-input" type="text" maxlength="100" enterkeyhint="send" autocomplete="off" placeholder="例如：壓力滿了會怎樣？／什麼是以柔克剛／(12+8)*3" onkeydown="if(event.key===\'Enter\'&&!event.isComposing)nkLabAsk()"><button type="button" class="main" style="margin-top:6px" onclick="nkLabAsk()">問鈕釦</button>';
    h += '<div style="margin-top:6px">' + ['怎麼存檔', '深度對話是什麼', '我現在該注意什麼', '鈕釦會連網嗎'].map(function (q) { return '<button type="button" ' + BTN + ' onclick="nkLabAsk(\'' + q + '\')">' + q + '</button>'; }).join('') + '</div>';
    if (askBusy) h += '<div style="font-size:12px;color:var(--muted);margin-top:6px">查詢中…</div>';
    if (asked) {
      var r = asked.r;
      h += '<div class="note-card" style="margin-top:8px;padding:10px;border:1px solid var(--line-dk);border-radius:10px"><div style="font-size:12px;color:var(--muted)">你問：' + esc(asked.q) + '</div><div style="margin-top:4px;white-space:pre-wrap;line-height:1.7">' + esc(r.text) + '</div>';
      if (r.items && r.items.length > 1) { h += '<div style="font-size:12px;color:var(--muted);margin-top:6px">相關：</div>'; r.items.slice(1).forEach(function (it) { h += '<div style="font-size:12px;margin-top:3px"><b>' + esc(it.q) + '</b>（' + esc(it.cat) + '）<div style="white-space:pre-wrap">' + esc(it.a) + '</div></div>'; }); }
      if (r.needsWeb) h += '<button type="button" ' + BTN + ' onclick="nkLabAskWeb()">上網查「' + esc(r.needsWeb) + '」（只送這個詞）</button>';
      if (r.items && r.items.length) h += '<div style="margin-top:6px;font-size:12px">這個回答有幫助嗎？<button type="button" ' + BTN + ' onclick="nkLabAskFb(true)">有</button><button type="button" ' + BTN + ' onclick="nkLabAskFb(false)">沒有</button></div>';
      if (r.domain === 'unknown' && r.followUps) h += '<div style="margin-top:6px">' + r.followUps.map(function (q) { return '<button type="button" ' + BTN + ' onclick="nkLabAsk(\'' + q + '\')">' + q + '</button>'; }).join('') + '</div>';
      h += '</div>';
    }
    var un = G.unanswered();
    if (un.length) h += '<div style="font-size:11px;color:var(--muted);margin-top:6px">未解答的問題 ' + un.length + ' 則（只存在本機）<button type="button" ' + BTN + ' onclick="nkLabExportUnanswered()">匯出</button></div>';
    return section('問鈕釦（遊戲疑惑・詞語・小工具）', h, true);
  }

  function panel() { try { prepareGuide(); return askPanel() + modulesPanel() + learningPanel() + questionsPanel() + lexiconPanel() + imitationPanel(); } catch (e) { return ''; } }

  /* result details for the lab's "why" list */
  function whyLines(p, text) {
    var out = [], emo = p && p.cognition && p.cognition.emotion;
    try {
      if (emo && emo.vad) out.push('情感座標：愉悅度 ' + emo.vad.valence.toFixed(2) + '・激動度 ' + emo.vad.arousal.toFixed(2) + (emo.mixed ? '・心情複雜' : '') + (emo.sarcasm && emo.sarcasm.score >= 0.5 ? '・話中帶刺' : ''));
      if (root.NiukouEmotion && root.NiukouEmpathy && text) {
        var a = root.NiukouEmotion.analyze(text, []), pl = root.NiukouEmpathy.plan(a, { persona: 'gentle' });
        if (pl.stance !== 'none') out.push('共感：' + root.NiukouEmpathy.reflect(a) + '（方式：' + pl.stance + '）');
      }
      if (p && p.cognition && p.cognition.acts && p.cognition.acts.length) out.push('對話行為：' + p.cognition.acts.join('、'));
      if (p && p.cognition && p.cognition.topics && p.cognition.topics.length) out.push('話題：' + p.cognition.topics.join('、'));
      if (p && p.cognition && p.cognition.normalized) out.push('已先轉成繁體再理解');
    } catch (e) { /* optional */ }
    return out.map(esc);
  }

  /* ---- handlers ---- */
  function exclude() { var n = []; try { if (root.S && root.S.playerName) n.push(root.S.playerName); (root.DEEP_DIALOGUE_NPCS || []).forEach(function (x) { if (x && x.name) n.push(x.name); }); } catch (e) { /* ignore */ } return n; }
  root.nkLabAuto = function (on) { root.NiukouLearning.setSettings({ autoWeb: !!on }); notice = on ? '已開啟：只會查詢你對話中出現的陌生單一詞語，每天有上限。' : '已關閉：鈕釦不會自行連網。'; redraw(); };
  root.nkLabSource = function (k, on) { var s = {}; s[k] = !!on; root.NiukouLearning.setSettings({ sources: s }); redraw(); };
  root.nkLabAdd = function () { var el = document.getElementById('nkQueueTerm'), r = root.NiukouLearning.addTerm(el ? el.value : '', { exclude: exclude() }); notice = r.ok ? '已加入「' + r.term + '」。' : r.reason; redraw(); };
  root.nkLabSkip = function (i) { var it = root.NiukouLearning.queue()[i]; if (it) root.NiukouLearning.skip(it.term); redraw(); };
  root.nkLabLookup = async function (i) {
    var it = root.NiukouLearning.queue()[i]; if (!it || busy) return;
    busy = true; notice = ''; redraw();
    var r = await root.NiukouLearning.lookupTerm(it.term, { exclude: exclude(), force: true });
    busy = false; notice = r.ok ? '「' + it.term + '」已產生草稿，請審核。' : (r.reason || '查詢失敗'); redraw();
  };
  root.nkLabApprove = function (i) { var d = root.NiukouVocabIntegration.drafts()[i]; if (!d) return; var r = root.NiukouLearning.approveDraft(d.term); notice = r.ok ? '已採用「' + d.term + '」，只用來理解上下文。' : '無法採用'; redraw(); };
  root.nkLabReject = function (i) { var d = root.NiukouVocabIntegration.drafts()[i]; if (d) root.NiukouLearning.rejectDraft(d.term); redraw(); };
  root.nkLabRemoveWord = function (i) { var e = root.NiukouVocabIntegration.entries()[i]; if (e) root.NiukouVocabIntegration.remove(e.term); redraw(); };
  root.nkLabTeach = function () { var a = document.getElementById('nkTeachTerm'), b = document.getElementById('nkTeachMeaning'), r = root.NiukouLearning.teach(a ? a.value : '', b ? b.value : ''); notice = r.ok ? '鈕釦記下了。' : '請填寫詞語（2 字以上）與意思'; redraw(); };
  root.nkLabReview = function (i, ok) { var d = root.NiukouLearning.dueReviews()[i]; if (d) root.NiukouLearning.markReview(d.term, ok); redraw(); };
  root.nkLabAnswer = function (i, cat) { var q = root.NiukouLearning.questions(2)[i]; if (!q) return; if (typeof root.nbFeedback === 'function') root.nbFeedback(q.t, q.c, cat, 'practice'); root.NiukouLearning.recordOutcome(q.p, q.c === cat); root.NiukouLearning.answered(q.t); notice = '謝謝，鈕釦記下了。'; redraw(); };
  root.nkLabResetStyle = function () { root.NiukouImitation.reset(); redraw(); };
  root.nkLabClearWeb = function () { root.NiukouWebSearch && root.NiukouWebSearch.clearCache(); root.NiukouLearning.clearAll(); notice = '已清除查詢快取與學習紀錄（詞庫與草稿保留）。'; redraw(); };
  root.nkLabExportLexicon = function () {
    try { var data = root.NiukouVocabIntegration.exportLocal(), blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'niukou-my-lexicon.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); } catch (e) { say('匯出失敗'); }
  };

  root.nkLabAsk = function (preset) {
    var el = document.getElementById('nkAsk'), q = typeof preset === 'string' ? preset : (el ? el.value.trim() : '');
    if (!q) { say('先輸入想問的事'); return; }
    prepareGuide(); asked = { q: q, r: root.NiukouGuide.ask(q, { state: stateSnapshot() }) }; redraw();
    var again = document.getElementById('nkAsk'); if (again && typeof preset !== 'string') again.value = '';
  };
  root.nkLabAskFb = function (ok) { if (!asked || !asked.r.items || !asked.r.items[0]) return; root.NiukouGuide.feedback(asked.r.items[0].id, !!ok, asked.q); say(ok ? '謝謝，鈕釦記下了' : '已記下，這題會列入未解答清單'); redraw(); };
  root.nkLabAskWeb = async function () {
    if (!asked || !asked.r.needsWeb || askBusy) return; var term = asked.r.needsWeb; askBusy = true; redraw();
    var r = await root.NiukouLearning.lookupTerm(term, { exclude: exclude(), force: true }); askBusy = false;
    asked = { q: asked.q, r: { domain: 'definition', items: [], text: r.ok ? '查到「' + term + '」了：' + r.draft.meaning + '\n這是待審草稿，已放在下方「自主上網學習詞彙」，你採用後才會進入詞庫。' : '沒有查到可用的解釋：' + (r.reason || '') } }; redraw();
  };
  root.nkLabExportUnanswered = function () {
    try { var blob = new Blob([JSON.stringify(root.NiukouGuide.exportUnanswered(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'niukou-unanswered.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); } catch (e) { say('匯出失敗'); }
  };
  root.NiukouLabUI = { version: '1.0.0', panel: panel, stateSnapshot: stateSnapshot, whyLines: whyLines, exclude: exclude };
})(typeof window !== 'undefined' ? window : globalThis);
