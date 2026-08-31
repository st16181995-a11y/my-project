const test = require('node:test');
const assert = require('node:assert');
const storage = require('../src/common/storage.js');

test('壊れた設定は項目ごとに既定値へ寄せる', () => {
  const result = storage.normalize({
    features: { timestamps: 'はい', templates: false },
    templates: 'こわれている',
    crossSearchTargets: 42,
    panelSide: '上',
    showRelative: 'yes',
  });
  assert.strictEqual(result.features.timestamps, true, '不正な値は既定へ');
  assert.strictEqual(result.features.templates, false, '正しい値は残す');
  assert.strictEqual(result.templates.length, storage.DEFAULT_TEMPLATES.length);
  assert.deepStrictEqual(result.crossSearchTargets, []);
  assert.strictEqual(result.panelSide, 'right');
  assert.strictEqual(result.showRelative, true);
});

test('null や配列など、何を渡しても使える設定が返る', () => {
  for (const bad of [null, undefined, 0, 'x', [], true]) {
    const result = storage.normalize(bad);
    assert.strictEqual(typeof result.features.timestamps, 'boolean');
    assert.ok(Array.isArray(result.templates));
  }
});

test('定型文の欠けた項目を補い、壊れた項目は捨てる', () => {
  const result = storage.normalize({ templates: [{ body: '本文だけ' }, null, { label: '本文なし' }, 'ごみ'] });
  assert.strictEqual(result.templates.length, 1);
  assert.strictEqual(result.templates[0].body, '本文だけ');
  assert.ok(result.templates[0].id);
  assert.strictEqual(result.templates[0].category, 'その他');
});

test('定型文を全部消した状態は利用者の意思として尊重する', () => {
  assert.deepStrictEqual(storage.normalize({ templates: [] }).templates, []);
});

test('差し込み変数を置き換える', () => {
  const body = '{商品名} を {価格} 円で。{日付} 発送。';
  const out = storage.render(body, { 商品名: 'カメラ', 価格: '3000', 日付: '2026/08/31' });
  assert.strictEqual(out, 'カメラ を 3000 円で。2026/08/31 発送。');
});

test('値が取れない変数は書いたまま残す（消えたことに気づかず送信させない）', () => {
  assert.strictEqual(storage.render('{商品名} と {価格}', { 商品名: 'A' }), 'A と {価格}');
  assert.strictEqual(storage.render('{商品名}', {}), '{商品名}');
  assert.strictEqual(storage.render('{商品名}', { 商品名: '' }), '{商品名}');
  assert.strictEqual(storage.render('{未知の変数}', { 未知の変数: 'x' }), '{未知の変数}');
});

test('本文でない値を渡しても落ちない', () => {
  for (const bad of [null, undefined, 42, {}]) {
    assert.strictEqual(storage.render(bad, {}), '');
  }
});

test('chrome が無い環境では保存が記憶に退避する', async () => {
  const saved = await storage.save({ panelSide: 'left', features: { timestamps: false } });
  assert.strictEqual(saved.panelSide, 'left');
  const loaded = await storage.load();
  assert.strictEqual(loaded.panelSide, 'left');
  assert.strictEqual(loaded.features.timestamps, false);
});
