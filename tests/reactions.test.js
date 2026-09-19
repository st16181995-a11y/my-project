/**
 * 反応数の読み取りと、再出品候補の判定。
 *
 * この機能で一番怖い壊れ方は「いいね0」が falsy として捨てられることで、
 * 探している当の商品（反応が無いもの）だけが一覧から消える。
 * 見た目には動いているので気づきにくい。そこを重点的に押さえる。
 */
const test = require('node:test');
const assert = require('node:assert');

// マニフェストと同じ順で読む。共通モジュールが先、機能があと。
const format = require('../src/common/format.js');
const extract = require('../src/common/extract.js');
require('../src/content/features/reactions.js');
const reactions = globalThis.FA.features.reactions;

test('件数の型ゆれ（数・文字列・配列）を吸収する', () => {
  assert.strictEqual(extract.countOf(12), 12);
  assert.strictEqual(extract.countOf('12'), 12);
  assert.strictEqual(extract.countOf('1,234'), 1234);
  assert.strictEqual(extract.countOf([{}, {}, {}]), 3, 'コメントは配列そのもののことがある');
  assert.strictEqual(extract.countOf({ count: 7 }), 7);
  assert.strictEqual(extract.countOf(3.8), 3);
});

test('0 を捨てない（反応ゼロの商品こそ探している対象）', () => {
  assert.strictEqual(extract.countOf(0), 0);
  assert.strictEqual(extract.countOf('0'), 0);
  assert.strictEqual(extract.countOf([]), 0);
  assert.strictEqual(extract.countOf({ count: 0 }), 0);

  const node = { id: 'm1', name: 'A', created: 1700000000, numLikes: 0, comments: [] };
  assert.deepStrictEqual(extract.reactionsOf(node), { likes: 0, comments: 0 });
});

test('件数として読めない値は null にする（0 と混同しない）', () => {
  for (const bad of [null, undefined, '', 'たくさん', -1, NaN, true]) {
    assert.strictEqual(extract.countOf(bad), null, `${String(bad)} を数として扱っている`);
  }
});

test('各社のキー名の揺れを吸収する', () => {
  const cases = [
    [{ numLikes: 5, numComments: 2 }, 5, 2],
    [{ num_likes: 5, num_comments: 2 }, 5, 2],
    [{ likeCount: 5, commentCount: 2 }, 5, 2],
    [{ favorite_count: 5, comment_count: 2 }, 5, 2],
    [{ watchListNum: 5 }, 5, null],
  ];
  for (const [node, likes, comments] of cases) {
    assert.deepStrictEqual(extract.reactionsOf(node), { likes, comments }, JSON.stringify(node));
  }
});

test('反応数が無い商品は null のまま（0 件と言い切らない）', () => {
  assert.deepStrictEqual(extract.reactionsOf({ id: 'm1', name: 'A' }), { likes: null, comments: null });
  assert.deepStrictEqual(extract.reactionsOf(null), { likes: null, comments: null });
});

test('索引が反応数と商品名まで拾う', () => {
  const page = {
    results: [
      { id: 'm1', name: 'カメラ', created: 1700000000, numLikes: 0, numComments: 0 },
      { id: 'm2', name: 'レンズ', created: 1700000000, numLikes: 30, numComments: 4 },
    ],
  };
  const index = extract.indexItems(page);
  assert.strictEqual(index.get('m1').likes, 0);
  assert.strictEqual(index.get('m1').name, 'カメラ');
  assert.strictEqual(index.get('m2').likes, 30);
});

test('同じ商品が別の場所に分かれていても、欠けている項目を埋める', () => {
  // 一覧用の軽いノードと、詳細用のノードが両方置かれていることがある
  const page = {
    list: [{ id: 'm1', name: 'カメラ', created: 1700000000 }],
    detail: { id: 'm1', name: 'カメラ', created: 1700000000, numLikes: 0, numComments: 1 },
  };
  const entry = extract.indexItems(page).get('m1');
  assert.strictEqual(entry.likes, 0, '後から見つかった反応数で埋まっていない');
  assert.strictEqual(entry.comments, 1);
});

test('しきい値以下なら候補、超えていれば候補にしない', () => {
  const limits = { likes: 1, comments: 1 };
  assert.deepStrictEqual(reactions.evaluate({ likes: 0, comments: 0 }, limits), { known: true, low: true });
  assert.deepStrictEqual(reactions.evaluate({ likes: 1, comments: 1 }, limits), { known: true, low: true });
  assert.deepStrictEqual(reactions.evaluate({ likes: 2, comments: 0 }, limits), { known: true, low: false });
  assert.deepStrictEqual(reactions.evaluate({ likes: 0, comments: 2 }, limits), { known: true, low: false });
});

test('片方しか取れていない場合は、取れたほうだけで判定する', () => {
  const limits = { likes: 1, comments: 1 };
  assert.deepStrictEqual(reactions.evaluate({ likes: 0, comments: null }, limits), { known: true, low: true });
  assert.deepStrictEqual(reactions.evaluate({ likes: 9, comments: null }, limits), { known: true, low: false });
});

test('何も取れていない商品は候補にも非候補にもしない', () => {
  const limits = { likes: 1, comments: 1 };
  assert.deepStrictEqual(reactions.evaluate({ likes: null, comments: null }, limits), { known: false, low: false });
  assert.deepStrictEqual(reactions.evaluate(undefined, limits), { known: false, low: false });
});

test('しきい値 0 は「反応ゼロだけ」の指定として効く', () => {
  const limits = { likes: 0, comments: 0 };
  assert.strictEqual(reactions.evaluate({ likes: 0, comments: 0 }, limits).low, true);
  assert.strictEqual(reactions.evaluate({ likes: 1, comments: 0 }, limits).low, false);
});

test('表示文は取れた項目だけを並べる', () => {
  assert.strictEqual(reactions.label({ likes: 0, comments: 3 }), 'いいね0・コメント3');
  assert.strictEqual(reactions.label({ likes: 2, comments: null }), 'いいね2');
  assert.strictEqual(reactions.label({ likes: null, comments: null }), '');
});

test('経過日数が長いほど再出品の候補として上に来る（並べ替えの土台）', () => {
  const now = Date.UTC(2026, 8, 19);
  const old = Math.floor(Date.UTC(2026, 7, 1) / 1000);
  const recent = Math.floor(Date.UTC(2026, 8, 15) / 1000);
  assert.ok(format.daysSince(old, now) > format.daysSince(recent, now));
});
