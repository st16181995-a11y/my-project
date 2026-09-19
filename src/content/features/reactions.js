/**
 * いいね数・コメント数の表示と、反応の薄い商品の抽出。
 *
 * 再出品するかどうかの判断は「出してから何日たったか」と
 * 「その間にどれだけ反応があったか」の 2 つで決まる。
 * 経過日数は timestamps 側で出しているので、ここは反応のほうを受け持つ。
 *
 * 数を出すだけでなく、「いいね◯以下 かつ コメント◯以下」に当てはまる商品を
 * パネルに一覧する。一覧ページを目で追って数える手間がここで消える。
 *
 * 出品の取り下げ・再出品・コメント送信は行わない。当てはまった商品を
 * 見つけて並べるところまでで、操作するのは人。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const { log, format, extract, sites, ui } = FA;

  const SCOPE = 'reactions';
  const BADGE_CLASS = 'fk-react';
  const LOW_CLASS = 'fk-react--low';
  const TS_BADGE_CLASS = 'fk-badge'; // timestamps 側のバッジ。並び順を壊さないために見る
  const MARK = 'fkRc';
  const MISS = 'fkRcMiss';
  const MAX_ROWS = 40; // パネルに出す上限。多すぎると選べない

  /** 反応が「分かっている範囲で」しきい値以下か。判定材料が無ければ known: false。 */
  function evaluate(entry, limits) {
    if (!entry) return { known: false, low: false };
    const checks = [];
    if (typeof entry.likes === 'number') checks.push(entry.likes <= limits.likes);
    if (typeof entry.comments === 'number') checks.push(entry.comments <= limits.comments);
    if (checks.length === 0) return { known: false, low: false };
    return { known: true, low: checks.every(Boolean) };
  }

  function label(entry) {
    const parts = [];
    if (typeof entry.likes === 'number') parts.push(`いいね${entry.likes}`);
    if (typeof entry.comments === 'number') parts.push(`コメント${entry.comments}`);
    return parts.join('・');
  }

  /** この商品の反応。商品ノードを優先し、無ければ索引から引く。 */
  function forItem(itemId) {
    const data = FA.pageData.get();
    if (!itemId) return null;

    if (data.itemNode) {
      const found = extract.reactionsOf(data.itemNode);
      if (found.likes !== null || found.comments !== null) return found;
    }
    const entry = data.index.get(String(itemId));
    if (entry) return { likes: entry.likes, comments: entry.comments };
    return null;
  }

  function badge(entry, limits) {
    const text = label(entry);
    if (!text) return null;

    const { low } = evaluate(entry, limits);
    const span = document.createElement('span');
    span.className = low ? `${BADGE_CLASS} ${LOW_CLASS}` : BADGE_CLASS;
    span.textContent = low ? `${text}（低反応）` : text;
    span.dataset[MARK] = '1';
    return span;
  }

  /**
   * このリンクに付けた自前のバッジを、隣から順に辿る。
   *
   * 「親の中に .fk-react があるか」で見ると、1 枚のカードに画像とタイトルで
   * リンクが 2 つある場合に、隣のリンクのバッジを自分のものと誤認する。
   */
  function ownBadges(anchor) {
    const list = [];
    let node = anchor.nextSibling;
    while (node && node.classList
      && (node.classList.contains(TS_BADGE_CLASS) || node.classList.contains(BADGE_CLASS))) {
      list.push(node);
      node = node.nextSibling;
    }
    return list;
  }

  /**
   * 一覧のカードごとに反応数を出す。
   *
   * 差し込む位置は timestamps のバッジの「後ろ」。先頭に割り込むと、
   * 向こうが「自分のバッジが消された」と判断して貼り直し、二重に増える。
   */
  function annotateCards(site, settings) {
    const { index } = FA.pageData.get();
    if (!index || index.size === 0) return 0;

    const anchors = document.querySelectorAll('a[href*="/item/"], a[href*="/auction/"], a[href*="/shops/product/"]');
    let added = 0;

    for (const anchor of anchors) {
      if (anchor.dataset[MISS]) continue;

      if (anchor.dataset[MARK]) {
        if (ownBadges(anchor).some((node) => node.classList.contains(BADGE_CLASS))) continue;
        delete anchor.dataset[MARK]; // サイト側の再描画で消えていた。貼り直す。
      }

      let itemId = null;
      try {
        itemId = sites.itemIdOf(new URL(anchor.href, location.href), site);
      } catch (_err) {
        anchor.dataset[MISS] = '1';
        continue;
      }
      if (!itemId) {
        anchor.dataset[MISS] = '1';
        continue;
      }

      const entry = index.get(itemId);
      const node = entry ? badge(entry, settings.reactionLimits) : null;
      if (!node) {
        anchor.dataset[MISS] = '1'; // まだ届いていないだけかもしれない。再挑戦で外す。
        continue;
      }

      const parent = anchor.parentNode;
      if (!parent) continue;

      anchor.dataset[MARK] = '1';
      delete anchor.dataset[MISS];

      const existing = ownBadges(anchor);
      const last = existing[existing.length - 1];
      parent.insertBefore(node, last ? last.nextSibling : anchor.nextSibling);
      added++;
    }

    if (added) log.debug(SCOPE, `一覧に ${added} 件の反応数を追加`);
    return added;
  }

  /**
   * いま画面に出ている商品から、低反応のものを拾う。
   * 同じ商品が画像とタイトルで 2 回出てくるので、商品 ID で 1 つにまとめる。
   */
  function candidates(site, settings) {
    const { index } = FA.pageData.get();
    const limits = settings.reactionLimits;
    const found = new Map();
    const seen = new Set(); // 1 枚のカードに画像とタイトルでリンクが 2 つある
    let known = 0;
    let unknownLikes = 0;
    let unknownComments = 0;

    if (!index || index.size === 0) return { rows: [], known, unknownLikes, unknownComments };

    for (const anchor of document.querySelectorAll('a[href*="/item/"], a[href*="/auction/"], a[href*="/shops/product/"]')) {
      let itemId = null;
      try {
        itemId = sites.itemIdOf(new URL(anchor.href, location.href), site);
      } catch (_err) {
        continue;
      }
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);

      const entry = index.get(itemId);
      const verdict = evaluate(entry, limits);
      if (!verdict.known) continue;

      known++;
      if (typeof entry.likes !== 'number') unknownLikes++;
      if (typeof entry.comments !== 'number') unknownComments++;
      if (!verdict.low) continue;

      let href = anchor.href;
      try {
        href = new URL(anchor.href, location.href).href;
      } catch (_err) {
        /* そのまま使う */
      }

      found.set(itemId, {
        itemId,
        href,
        name: entry.name || (anchor.textContent || '').trim().slice(0, 60) || itemId,
        likes: entry.likes,
        comments: entry.comments,
        days: format.daysSince(entry.created),
      });
    }

    // 古いものから。出してから日が経っているほど、再出品の効き目が大きい。
    const rows = Array.from(found.values()).sort((a, b) => {
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return b.days - a.days;
    });

    return { rows, known, unknownLikes, unknownComments };
  }

  function renderPanel(site, settings) {
    ui.setSection(SCOPE, '反応と再出品候補', (container) => {
      const limits = settings.reactionLimits;
      const data = FA.pageData.get();

      // 商品ページ: この商品の反応
      if (data.itemId) {
        const mine = forItem(data.itemId);
        if (mine && (mine.likes !== null || mine.comments !== null)) {
          const list = document.createElement('dl');
          list.className = 'kv';
          const addRow = (name, value) => {
            if (value === null || value === undefined) return;
            const row = document.createElement('div');
            row.appendChild(ui.el('dt', { textContent: name }));
            row.appendChild(ui.el('dd', { textContent: String(value) }));
            list.appendChild(row);
          };
          addRow('いいね', mine.likes);
          addRow('コメント', mine.comments);
          container.appendChild(list);

          const verdict = evaluate(mine, limits);
          if (verdict.low) {
            container.appendChild(ui.el('p', {
              className: 'note',
              textContent: `いいね${limits.likes}以下・コメント${limits.comments}以下に当てはまります。再出品の候補です。`,
            }));
          }
        } else {
          container.appendChild(ui.el('p', {
            className: 'empty',
            textContent: 'この商品のいいね数・コメント数を、ページの埋め込みデータから取得できませんでした。',
          }));
        }
      }

      // 一覧: しきい値に当てはまる商品
      const { rows, known, unknownLikes, unknownComments } = log.safe(
        SCOPE,
        () => candidates(site, settings),
        { rows: [], known: 0, unknownLikes: 0, unknownComments: 0 }
      );

      container.appendChild(ui.el('p', {
        className: 'cat',
        textContent: `いいね${limits.likes}以下・コメント${limits.comments}以下`,
      }));

      if (known === 0) {
        container.appendChild(ui.el('p', {
          className: 'empty',
          textContent: data.itemId
            ? '一覧ページ（出品した商品・検索結果）を開くと、当てはまる商品をここに並べます。'
            : 'この画面からは、いいね数・コメント数を取得できませんでした。',
        }));
        return;
      }

      if (rows.length === 0) {
        container.appendChild(ui.el('p', {
          className: 'empty',
          textContent: `この画面の ${known} 件には、当てはまる商品はありません。`,
        }));
        return;
      }

      const shown = rows.slice(0, MAX_ROWS);
      for (const row of shown) {
        const anchor = document.createElement('a');
        anchor.className = 'tpl-link';
        anchor.href = row.href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.appendChild(ui.el('span', { className: 'name', textContent: row.name }));
        const meta = [label(row)];
        if (row.days !== null) meta.push(`出品から${row.days}日`);
        anchor.appendChild(ui.el('span', { className: 'preview', textContent: meta.join(' / ') }));
        container.appendChild(anchor);
      }

      const summary = ui.el('p', {
        className: 'note',
        textContent: `この画面の ${known} 件のうち ${rows.length} 件が該当`
          + (rows.length > shown.length ? `（上位 ${shown.length} 件を表示）` : ''),
      });
      container.appendChild(summary);

      if (unknownLikes || unknownComments) {
        const missing = [];
        if (unknownLikes) missing.push('いいね数');
        if (unknownComments) missing.push('コメント数');
        container.appendChild(ui.el('p', {
          className: 'note',
          textContent: `※ 一部の商品は${missing.join('と')}を取得できなかったため、取得できた条件だけで判定しています。`,
        }));
      }

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'chip';
      copyButton.textContent = '一覧をコピー';
      copyButton.addEventListener('click', async () => {
        const text = rows
          .map((row) => `${row.name}\t${label(row)}\t${row.days === null ? '' : `${row.days}日`}\t${row.href}`)
          .join('\n');
        const ok = await ui.copy(text);
        ui.toast(ok ? `${rows.length}件をコピーしました` : 'コピーできませんでした');
      });
      container.appendChild(copyButton);
    }, 15);
  }

  function clear() {
    for (const node of document.querySelectorAll(`.${BADGE_CLASS}`)) node.remove();
    for (const element of document.querySelectorAll('[data-fk-rc], [data-fk-rc-miss]')) {
      delete element.dataset[MARK];
      delete element.dataset[MISS];
    }
  }

  /** 埋め込みデータが増えたら、取れなかったぶんへ再挑戦する。 */
  function retryMisses() {
    for (const element of document.querySelectorAll('[data-fk-rc-miss]')) delete element.dataset[MISS];
  }

  function run(site, settings) {
    if (!settings.features.reactions) {
      log.mark(SCOPE, 'skip', '設定で無効');
      ui.removeSection(SCOPE);
      return;
    }

    const added = log.safe(SCOPE, () => annotateCards(site, settings), 0);
    log.safe(SCOPE, () => renderPanel(site, settings));

    const data = FA.pageData.get();
    const mine = data.itemId ? log.safe(SCOPE, () => forItem(data.itemId), null) : null;
    if (data.itemId && !mine) log.mark(SCOPE, 'error', `商品 ${data.itemId} の反応数を取得できませんでした`);
    else log.mark(SCOPE, 'ok', data.itemId ? '商品ページ' : `一覧 ${added} 件`);
  }

  FA.features = FA.features || {};
  FA.features.reactions = { run, evaluate, label, forItem, badge, annotateCards, candidates, clear, retryMisses };
})(typeof globalThis !== 'undefined' ? globalThis : this);
