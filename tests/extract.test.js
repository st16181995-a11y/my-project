const test = require('node:test');
const assert = require('node:assert');
const extract = require('../src/common/extract.js');

test('固定パスに頼らず、深い位置の商品ノードを見つける', () => {
  const page = { a: { b: { c: { d: { item: { id: 'm1', name: '本命', created: 1755000000, updated: 1756000000 } } } } } };
  const found = extract.timestampsFrom(page, 'm1');
  assert.strictEqual(found.created, 1755000000);
  assert.strictEqual(found.updated, 1756000000);
  assert.strictEqual(found.confidence, 'high');
});

test('商品IDが一致しなければ、他の商品の日時で埋めない', () => {
  const page = { list: [{ id: 'm999', name: 'おすすめ', price: 100, created: 1600000000 }] };
  const found = extract.timestampsFrom(page, 'm1');
  assert.strictEqual(found.created, null);
  assert.strictEqual(found.confidence, null);
  assert.strictEqual(found.strategy, 'id-not-found');
});

test('商品IDが分からない場面でだけ、商品らしいノードへ落ちる', () => {
  const page = { list: [{ id: 'm999', name: 'なにか', price: 100, created: 1600000000 }] };
  const found = extract.timestampsFrom(page, null);
  assert.strictEqual(found.created, 1600000000);
  assert.strictEqual(found.confidence, 'medium');
});

test('循環参照があっても止まらない', () => {
  const node = { id: 'x', name: 'A', created: 1700000000 };
  node.self = node;
  node.children = [node];
  assert.strictEqual(extract.timestampsFrom(node, 'x').created, 1700000000);
});

test('索引は商品らしいノードだけを拾い、囮に釣られない', () => {
  const page = {
    tracking: { id: 'm1', created: 999 },
    results: [
      { id: 'm1', name: 'A', created: 1700000000, updated: 1700100000 },
      { id: 'm2', price: 500, title: 'B', created: 1710000000 },
      { id: 'm3', name: '日時なし' },
    ],
  };
  const index = extract.indexItems(page);
  assert.strictEqual(index.size, 2);
  assert.deepStrictEqual(index.get('m1'), { created: 1700000000, updated: 1700100000 });
  assert.strictEqual(index.get('m3'), undefined);
});

test('キー名の揺れ（created / createdAt / created_at）を吸収する', () => {
  for (const key of ['created', 'createdAt', 'created_at', 'startTime']) {
    const page = { item: { id: 'z', name: 'A', [key]: 1700000000 } };
    assert.strictEqual(extract.timestampsFrom(page, 'z').created, 1700000000, `${key} を読めない`);
  }
});

test('素のJSONでないスクリプトからもオブジェクトを取り出す', () => {
  const raw = 'window.__d=({"item":{"id":"m55","name":"X","created":1700000000}});foo({"壊れた":';
  const objects = extract.jsonObjectsIn(raw);
  assert.strictEqual(objects.length, 1);
  assert.strictEqual(extract.timestampsFrom(objects, 'm55').created, 1700000000);
});

test('文字列内の波括弧に惑わされない', () => {
  const raw = '{"name":"値引き{応相談}","id":"m7","created":1700000000}';
  const objects = extract.jsonObjectsIn(raw);
  assert.strictEqual(objects.length, 1);
  assert.strictEqual(objects[0].name, '値引き{応相談}');
});

test('走査量に上限があり、巨大データで固まらない', () => {
  let deep = { name: 'leaf', id: 'target', created: 1700000000 };
  for (let i = 0; i < 50000; i++) deep = { next: deep };
  const started = Date.now();
  extract.timestampsFrom(deep, 'target');
  assert.ok(Date.now() - started < 5000, '走査に時間がかかりすぎている');
});
