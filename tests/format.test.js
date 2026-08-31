const test = require('node:test');
const assert = require('node:assert');
const format = require('../src/common/format.js');

test('秒・ミリ秒・ISO文字列のどれでも同じ時刻として読む', () => {
  const expected = '2025/08/24 10:46';
  assert.strictEqual(format.absolute(1756000000), expected);
  assert.strictEqual(format.absolute(1756000000000), expected);
  assert.strictEqual(format.absolute('1756000000'), expected);
  assert.strictEqual(format.absolute('2025-08-24T10:46:40+09:00'), expected);
});

test('ありえない値は表示しない（誤った日時を出すより出さない）', () => {
  for (const bad of [null, undefined, 0, 100, 4e12, '', '   ', 'あとで', {}, [], NaN, Infinity]) {
    assert.strictEqual(format.absolute(bad), '', `${String(bad)} を表示してしまった`);
  }
});

test('未来の時刻は時計ずれの範囲だけ許す', () => {
  const soon = Date.now() + 60 * 60 * 1000;
  const farFuture = Date.now() + 7 * 24 * 60 * 60 * 1000;
  assert.notStrictEqual(format.absolute(soon), '');
  assert.strictEqual(format.absolute(farFuture), '');
});

test('経過日数と相対表示', () => {
  const now = Date.UTC(2026, 7, 31, 0, 0, 0);
  const tenDaysAgo = now - 10 * 86400000;
  assert.strictEqual(format.daysSince(tenDaysAgo, now), 10);
  assert.strictEqual(format.relative(tenDaysAgo, now), '10日前');
  assert.strictEqual(format.relative(now - 30 * 1000, now), 'たった今');
  assert.strictEqual(format.relative(now - 90 * 60 * 1000, now), '1時間前');
  assert.strictEqual(format.daysSince('こわれた値', now), null);
});
