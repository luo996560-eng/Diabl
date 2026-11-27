import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './support/game-harness.mjs';

// 以真實的 index.html 啟動遊戲，確認主要流程不會拋錯。
const { sb, document } = await makeGame();
const errs = [];
sb.console = { log() {}, warn() {}, error: (...a) => errs.push(a.map(String).join(' ')) };

test('遊戲可啟動並開始新的一生', () => {
  sb.newGame();
  document.getElementById('charName').value = '測試俠';
  sb.finishNameAndTalent();
  if (typeof sb.skipFirstLifeMaster === 'function') sb.skipFirstLifeMaster();
  assert.ok(sb.S, '狀態應存在');
  assert.equal(sb.S.age, 10);
});

test('事件畫面提供鈕釦自由回應，且無關語句不會推進時間', () => {
  let guard = 0;
  const hasOpts = () => sb.S && sb.S.currentEvent && ((sb.S.currentEvent.options || sb.S.currentEvent.opts || []).length > 1);
  while (guard++ < 200 && !hasOpts()) {
    if (!sb.S) break;
    if (sb.S.deepDialoguePending) { sb.endDeepDialogue(true); continue; }
    if (sb.S.pendingResult) { sb.afterChoice(); continue; }
    if (sb.BATTLE) { sb.endBattle(true); continue; }
    sb.nextMonth();
  }
  assert.ok(hasOpts(), '應取得一個有多個選項的事件');
  sb.renderEvent();
  assert.match(document.getElementById('event').innerHTML, /鈕釦自由回應/);
  sb.toggleFreeChoice();
  assert.match(document.getElementById('event').innerHTML, /nkFreeText/);
  const month = sb.S.month;
  document.getElementById('nkFreeText').value = '今天天氣真好，我想唱歌';
  sb.submitFreeChoice();
  assert.equal(sb.S.pendingResult, null, '無關語句不得產生結果');
  assert.equal(sb.S.month, month, '無關語句不得推進月份');
});

test('有效行動會套用既有抉擇並顯示判定', () => {
  document.getElementById('nkFreeText').value = '我出手扶起他，替他包紮傷口';
  sb.submitFreeChoice();
  assert.ok(sb.S.pendingResult, '應產生結果');
  sb.renderEvent();
  const html = document.getElementById('event').innerHTML;
  assert.match(html, /鈕釦判定/);
  assert.match(html, /對應抉擇/);
  sb.afterChoice();
  assert.equal(sb.S.pendingResult, null);
});

test('連續 600 個月隨機遊玩不出錯，且狀態數值合法', () => {
  const pool = ['我拔劍殺了那個惡徒', '我扶起老人替他包紮', '先觀察一下再說', '帶他去鎮上請大夫', '趁亂搶走他的包袱', '今天天氣真好', '把東西原封不動還給他'];
  for (let i = 0; i < 600; i++) {
    const S = sb.S;
    if (!S || S.gameOver) break;
    if (S.deepDialoguePending) { sb.endDeepDialogue(true); continue; }
    if (sb.BATTLE) { sb.endBattle(true); continue; }
    if (sb.MASTER_TASK) { sb.exitMasterTask(); continue; }
    if (S.masterEncounterPending) { sb.declineMaster(); continue; }
    if (S.destinyEncounterPending) { sb.declineDestinyBond(); continue; }
    if (S.destinyFollowPending) { sb.resolveDestinyFollowUp(false); continue; }
    if (S.pendingResult) { sb.afterChoice(); continue; }
    const ev = S.currentEvent, oa = ev && (ev.options || ev.opts || []);
    if (!oa || !oa.length) { sb.nextMonth(); continue; }
    if (i % 3 === 0) {
      sb.FREE_CHOICE_OPEN = true;
      document.getElementById('nkFreeText').value = pool[i % pool.length];
      sb.submitFreeChoice();
    } else {
      sb.choose(Math.floor(Math.random() * oa.length));
    }
    sb.FREE_CHOICE_OPEN = false;
    sb.FREE_CHOICE_TEXT = '';
  }
  const S = sb.S;
  assert.ok(S.age > 10, '年齡應有推進');
  ['martial', 'inner', 'wisdom', 'fortune', 'money', 'fame', 'righteous', 'demonic'].forEach((k) => {
    assert.ok(Number.isFinite(S[k]), k + ' 應為有限數值');
    assert.ok(S[k] >= 0, k + ' 不應為負');
  });
  assert.deepEqual(errs, [], '不應有 console.error');
});
