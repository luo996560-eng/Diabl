import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './support/game-harness.mjs';

const { sb, document, store } = await makeGame();
const errs = [];
sb.console = { log() {}, warn() {}, error: (...a) => errs.push(a.map(String).join(' ')) };

function startLife() {
  sb.newGame();
  document.getElementById('charName').value = '存檔俠';
  sb.finishNameAndTalent();
  if (typeof sb.skipFirstLifeMaster === 'function') sb.skipFirstLifeMaster();
}
function advanceToEvent(max = 120) {
  let guard = 0;
  const ok = () => sb.S && sb.S.currentEvent && ((sb.S.currentEvent.options || sb.S.currentEvent.opts || []).length > 0);
  while (guard++ < max && !ok()) {
    if (!sb.S) break;
    if (sb.S.deepDialoguePending) { sb.endDeepDialogue(true); continue; }
    if (sb.S.pendingResult) { sb.afterChoice(); continue; }
    if (sb.BATTLE) { sb.endBattle(true); continue; }
    sb.nextMonth();
  }
  return ok();
}

test('重新整理（重新讀檔）不會重抽事件', () => {
  startLife();
  assert.ok(advanceToEvent(), '應取得事件');
  const before = sb.S.currentEvent;
  const ids = JSON.stringify((before.options || []).map((o) => String(o.t || o.text || '')));
  sb.saveGame();
  const age = sb.S.age, month = sb.S.month;
  assert.equal(sb.loadGame(), true, '讀檔應成功');
  assert.equal(sb.S.age, age);
  assert.equal(sb.S.month, month);
  assert.equal(sb.S.currentEvent.id, before.id, '事件 id 應一致');
  const after = JSON.stringify((sb.S.currentEvent.options || []).map((o) => String(o.t || o.text || '')));
  assert.equal(after, ids, '選項文字應一致');
});

test('存檔欄位有記錄事件與月份', () => {
  const raw = JSON.parse(store.get('wuxiaSave'));
  assert.equal(typeof raw.eventId, 'string');
  assert.equal(raw.eventAge, sb.S.age);
  assert.equal(raw.eventMonth, sb.S.month);
});

test('舊版本存檔改為軟升級，不再直接刪除', () => {
  const raw = JSON.parse(store.get('wuxiaSave'));
  const old = Object.assign({}, raw, { version: Number(sb.SAVE_VERSION) - 1 });
  store.set('wuxiaSave', JSON.stringify(old));
  const ok = sb.loadGame();
  assert.equal(ok, true, '舊存檔應可載入');
  assert.equal(sb.S.playerName, '存檔俠');
  assert.ok(store.has('wuxiaSave'), '存檔不應被移除');
  const backups = Array.from(store.keys()).filter((k) => k.startsWith('wuxiaSave_bak_') || k.includes('_v'));
  assert.ok(backups.length >= 1, '應留下備份');
});

test('成就名稱不再重複', () => {
  const names = sb.ACHIEVEMENTS.map((a) => a.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(sb.ACHIEVEMENTS.length, 1000);
});

test('視窗允許縮放', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const meta = html.match(/<meta name="viewport"[^>]*>/)[0];
  assert.ok(!/user-scalable=no/.test(meta));
  assert.ok(!/maximum-scale=1/.test(meta));
});

test('不應有 console.error', () => {
  assert.deepEqual(errs, []);
});
