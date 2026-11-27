import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(path.join(root, 'core/niukou-choice.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'niukou-choice.js' });
const C = sandbox.NiukouChoice;

const options = [
  { index: 0, path: 'good', text: '出手相助，替他包紮傷口' },
  { index: 1, path: 'neutral', text: '在旁觀察，不作表示' },
  { index: 2, path: 'neutral', text: '轉身離開' },
  { index: 3, path: 'evil', text: '趁亂搶走他的包袱' },
  { index: 4, path: 'evil', text: '一劍殺了他' }
];
const judge = (t) => C.judge(t, { options });

test('暴力語句判為惡，且對應到惡的選項', () => {
  const j = judge('我拔劍殺了那名山賊');
  assert.equal(j.path, 'evil');
  assert.ok(j.confidence > 0.8);
  assert.equal(options[C.pickIndex(j)].path, 'evil');
});

test('救助語句判為善', () => {
  const j = judge('我扶起老人，替他包紮傷口');
  assert.equal(j.path, 'good');
  assert.ok(j.confidence >= 0.6);
  assert.equal(options[C.pickIndex(j)].path, 'good');
});

test('旁觀語句判為中立', () => {
  const j = judge('我先在旁邊觀察情況');
  assert.equal(j.path, 'neutral');
});

test('與事件無關的閒聊不給判定，也不對應任何選項', () => {
  const j = judge('今天天氣真好');
  assert.equal(j.path, 'off');
  assert.equal(j.relevant, false);
  assert.equal(C.pickIndex(j), -1);
});

test('否定語境：不救人不算善行', () => {
  const j = judge('我不救他');
  assert.notEqual(j.path, 'good');
  assert.equal(options[C.pickIndex(j)].path, j.path);
});

test('空字串與過短輸入一律拒絕', () => {
  ['', '　', '好', null, undefined].forEach((t) => {
    const j = C.judge(t, { options });
    assert.equal(j.relevant, false);
    assert.equal(C.pickIndex(j), -1);
  });
});

test('善惡線索同時出現時壓低信心', () => {
  const j = judge('先救他，再一劍殺了他');
  assert.ok(j.confidence <= 0.55);
});

test('對應到的選項必定落在判定路徑內', () => {
  ['我出聲提醒他小心', '把東西原封不動還給他', '偷偷摸走他的銀兩', '我想想再回答'].forEach((t) => {
    const j = judge(t);
    if (C.pickIndex(j) < 0) return;
    assert.equal(options[C.pickIndex(j)].path, j.path, t);
  });
});
