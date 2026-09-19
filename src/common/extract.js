/**
 * ページに埋め込まれたデータから商品情報を取り出す。
 *
 * ここがこの拡張の壊れやすさを決める場所。
 * よくある作りは "props.pageProps.item.created" のような固定パス 1 本で、
 * サイト側が構造を 1 段変えただけで全滅する。
 *
 * 代わりに、
 *   1. 埋め込み JSON を片っ端から集める
 *   2. 木を歩いて「その商品 ID を持つノード」を探す（パスに依存しない）
 *   3. 見つからなければ精度を落とした手段へ順に降りる
 *   4. どの手段で取れたかを confidence として返し、低ければ表示しない
 * という段構えにする。誤った値を出すより、出さないほうがマシ。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});

  const WALK_NODE_BUDGET = 200000; // 巨大な埋め込みデータでページを固めないための上限
  const RAW_SCAN_LIMIT = 4 * 1024 * 1024;

  /** オブジェクト/配列の木を幅優先で歩く。visit が true を返したら打ち切る。 */
  function walk(node, visit, budget = WALK_NODE_BUDGET) {
    const queue = [node];
    const seen = new Set();
    let visited = 0;

    while (queue.length) {
      const current = queue.shift();
      if (current === null || typeof current !== 'object') continue;
      if (seen.has(current)) continue; // 循環参照よけ
      seen.add(current);
      if (++visited > budget) return { stopped: 'budget', visited };

      if (!Array.isArray(current) && visit(current)) return { stopped: 'found', visited };

      for (const key of Object.keys(current)) {
        const child = current[key];
        if (child !== null && typeof child === 'object') queue.push(child);
      }
    }
    return { stopped: 'end', visited };
  }

  const ID_KEYS = ['id', 'itemId', 'item_id', 'auctionId', 'auction_id', 'code'];
  const CREATED_KEYS = ['created', 'createdAt', 'created_at', 'createTime', 'startTime', 'start_time'];
  const UPDATED_KEYS = ['updated', 'updatedAt', 'updated_at', 'updateTime', 'modified'];
  const LIKE_KEYS = [
    'numLikes', 'num_likes', 'likeCount', 'like_count',
    'favoriteCount', 'favorite_count', 'watchListNum', 'watchlist_num', 'likes',
  ];
  const COMMENT_KEYS = ['numComments', 'num_comments', 'commentCount', 'comment_count', 'comments'];

  function firstKey(obj, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== null && value !== undefined && value !== '') return value;
      }
    }
    return undefined;
  }

  /**
   * 件数を数に正規化する。
   *
   * 各社で型がばらつく（数・文字列・コメント配列そのもの）ので、ここで吸収する。
   * 0 は「反応が無い」という意味のある値なので、絶対に falsy として捨てない。
   * これを取り違えると「いいね0の商品」が一件も出てこなくなる。
   */
  function countOf(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') {
      const trimmed = value.replace(/[,\s]/g, '');
      if (!/^\d+$/.test(trimmed)) return null;
      return Number(trimmed);
    }
    // { total: 3 } のような入れ子。1 段だけ覗く（深追いすると無関係な数を拾う）
    if (value && typeof value === 'object') {
      for (const key of ['count', 'total', 'num', 'length']) {
        if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) {
          return Math.floor(value[key]);
        }
      }
    }
    return null;
  }

  /** 商品ノードから いいね数・コメント数 を取り出す。取れなければ null。 */
  function reactionsOf(node) {
    if (!node || typeof node !== 'object') return { likes: null, comments: null };
    return {
      likes: countOf(firstKey(node, LIKE_KEYS)),
      comments: countOf(firstKey(node, COMMENT_KEYS)),
    };
  }

  function looksLikeItem(obj) {
    // 商品ノードらしさ: 名前か価格を持っている
    return (
      typeof obj.name === 'string' ||
      typeof obj.title === 'string' ||
      typeof obj.price === 'number' ||
      typeof obj.price === 'string'
    );
  }

  /** 指定 ID を持つノードを探す。ID が一致すれば別商品と取り違えない。 */
  function findItemNode(source, itemId) {
    if (!itemId) return null;
    const target = String(itemId).toLowerCase();
    let found = null;

    walk(source, (obj) => {
      const value = firstKey(obj, ID_KEYS);
      if (value === undefined) return false;
      if (String(value).toLowerCase() !== target) return false;
      if (firstKey(obj, CREATED_KEYS) === undefined) return false;
      found = obj;
      return true;
    });

    return found;
  }

  /** ID では引けなかったときに、商品らしいノードから拾う。 */
  function findAnyItemNode(source) {
    let found = null;
    walk(source, (obj) => {
      if (firstKey(obj, CREATED_KEYS) === undefined) return false;
      if (!looksLikeItem(obj)) return false;
      found = obj;
      return true;
    });
    return found;
  }

  /**
   * 埋め込み JSON 群から出品日時・更新日時を取り出す。
   * 返り値の confidence: 'high'（ID 一致） / 'medium'（商品らしいノード） / null（取れず）
   */
  /**
   * 埋め込み JSON 全体から「商品 ID -> 日時」の索引を作る。
   * 検索結果ページで、カード 1 枚ずつに出品日時を出すために使う。
   * リンク先の ID を鍵にするので、カードの CSS クラスが変わっても壊れない。
   */
  function indexItems(sources) {
    const index = new Map();
    const list = Array.isArray(sources) ? sources : [sources];

    for (const source of list) {
      if (!source || typeof source !== 'object') continue;
      walk(source, (obj) => {
        const id = firstKey(obj, ID_KEYS);
        if (id === undefined) return false;
        const created = firstKey(obj, CREATED_KEYS);
        if (created === undefined) return false;

        // 商品らしさを必須にする。{id, created} だけを持つ設定値や
        // 計測用のノードを商品と誤認すると、無関係な日時が出る。
        if (!looksLikeItem(obj)) return false;

        const key = String(id);
        const reactions = reactionsOf(obj);
        const entry = {
          created,
          updated: firstKey(obj, UPDATED_KEYS) ?? null,
          likes: reactions.likes,
          comments: reactions.comments,
          name: typeof obj.name === 'string' ? obj.name : typeof obj.title === 'string' ? obj.title : null,
        };

        const previous = index.get(key);
        if (!previous) {
          index.set(key, entry);
          return false;
        }

        // 同じ ID が複数箇所に分かれて置かれていることがある
        // （一覧用の軽いノードと、詳細用のノード）。上書きすると
        // 片方にしか無い項目が消えるので、欠けているところだけ埋める。
        for (const field of ['updated', 'likes', 'comments', 'name']) {
          if (previous[field] === null && entry[field] !== null) previous[field] = entry[field];
        }
        return false; // 全部集めるので打ち切らない
      });
    }
    return index;
  }

  function timestampsFrom(sources, itemId, { allowFallback = !itemId } = {}) {
    const list = Array.isArray(sources) ? sources : [sources];

    for (const source of list) {
      if (!source || typeof source !== 'object') continue;
      const node = findItemNode(source, itemId);
      if (node) {
        return {
          created: firstKey(node, CREATED_KEYS) ?? null,
          updated: firstKey(node, UPDATED_KEYS) ?? null,
          confidence: 'high',
          strategy: 'id-match',
        };
      }
    }

    // 商品 ID が分かっているのに一致ノードが無いなら、ここで諦める。
    // 「商品らしいノード」を拾うと、関連商品やおすすめ枠の日時を
    // その商品のものとして表示してしまう。黙って間違えるより出さない。
    if (!allowFallback) {
      return { created: null, updated: null, confidence: null, strategy: 'id-not-found' };
    }

    for (const source of list) {
      if (!source || typeof source !== 'object') continue;
      const node = findAnyItemNode(source);
      if (node) {
        return {
          created: firstKey(node, CREATED_KEYS) ?? null,
          updated: firstKey(node, UPDATED_KEYS) ?? null,
          confidence: 'medium',
          strategy: 'item-shape',
        };
      }
    }

    return { created: null, updated: null, confidence: null, strategy: 'none' };
  }

  /**
   * 生テキストから JSON オブジェクトを取り出す。
   * script タグの中身が JSON そのものではなく、JS 式に埋まっている場合の保険。
   */
  function jsonObjectsIn(text, { max = 40, maxLength = 2 * 1024 * 1024 } = {}) {
    const results = [];
    if (typeof text !== 'string' || text.length > RAW_SCAN_LIMIT) return results;

    let index = 0;
    while (index < text.length && results.length < max) {
      const start = text.indexOf('{"', index);
      if (start === -1) break;

      const end = matchingBrace(text, start, maxLength);
      if (end === -1) {
        index = start + 2;
        continue;
      }

      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (parsed && typeof parsed === 'object') results.push(parsed);
        index = end + 1; // 取り込めた範囲は読み飛ばす（総当たりにしない）
      } catch (_err) {
        index = start + 2;
      }
    }
    return results;
  }

  /** start の { に対応する } の位置。文字列とエスケープを考慮する。 */
  function matchingBrace(text, start, maxLength) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    const limit = Math.min(text.length, start + maxLength);

    for (let i = start; i < limit; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  FA.extract = {
    walk,
    indexItems,
    findItemNode,
    findAnyItemNode,
    timestampsFrom,
    countOf,
    reactionsOf,
    jsonObjectsIn,
    matchingBrace,
    _keys: { ID_KEYS, CREATED_KEYS, UPDATED_KEYS, LIKE_KEYS, COMMENT_KEYS },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FA.extract;
})(typeof globalThis !== 'undefined' ? globalThis : this);
