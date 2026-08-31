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

  function firstKey(obj, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== null && value !== undefined && value !== '') return value;
      }
    }
    return undefined;
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
    findItemNode,
    findAnyItemNode,
    timestampsFrom,
    jsonObjectsIn,
    matchingBrace,
    _keys: { ID_KEYS, CREATED_KEYS, UPDATED_KEYS },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FA.extract;
})(typeof globalThis !== 'undefined' ? globalThis : this);
