/**
 * 出品日時・更新日時の表示。
 *
 * 各サイトは「3日前」のような相対表示しか出さないので、正確な日時を補う。
 * 出品からの経過日数は再出品の判断に直結するため、日数も併記する。
 *
 * 値が取れなかったときは、それが分かるように「取得できません」と出す。
 * 黙って消えるとサイト側の変更に気づけない。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const { log, format, extract, sites, ui } = FA;

  const SCOPE = 'timestamps';
  const BADGE_CLASS = 'fk-badge';
  const MARK = 'fkTs'; // 日時を付け終えた印
  const MISS = 'fkTsMiss'; // 日時が取れなかった印。データが後から届いたら再挑戦する

  function badge(created, updated, showRelative) {
    const createdText = format.absolute(created);
    if (!createdText) return null;

    const days = format.daysSince(created);
    const parts = [`出品 ${createdText}`];
    if (showRelative && days !== null) parts.push(`(${days}日前)`);

    const updatedText = format.absolute(updated);
    if (updatedText && updatedText !== createdText) parts.push(`／更新 ${updatedText}`);

    const span = document.createElement('span');
    span.className = BADGE_CLASS;
    span.textContent = parts.join(' ');
    span.dataset[MARK] = '1';
    return span;
  }

  /** 商品ページ: 見出しの直後に出す。h1 はクラス名より遥かに変わりにくい。 */
  function annotateItemPage(site, settings) {
    const itemId = sites.itemIdOf(location.href, site);
    if (!itemId) return null;

    const found = extract.timestampsFrom(FA.pageData.get().sources, itemId);

    if (!found.created) {
      log.mark(SCOPE, 'error', `商品 ${itemId} の日時を取得できませんでした（${found.strategy}）`);
      return { itemId, found };
    }

    const heading = document.querySelector('main h1') || document.querySelector('h1');
    if (heading) {
      // 以前の商品のバッジが残っていることがある（サイト側が入れ物を再利用するため）。
      // 消してから貼り直さないと、前の商品の日時を表示し続けてしまう。
      for (const stale of heading.parentNode.querySelectorAll(`.${BADGE_CLASS}`)) stale.remove();
      const node = badge(found.created, found.updated, settings.showRelative);
      if (node) heading.parentNode.insertBefore(node, heading.nextSibling);
    }

    log.mark(SCOPE, 'ok', `商品 ${itemId}（${found.strategy}）`);
    return { itemId, found };
  }

  /**
   * 検索結果・一覧: カードごとに出す。
   * リンクの href から商品 ID を取るので、カードの見た目が変わっても追随する。
   */
  function annotateCards(site, settings) {
    const { index } = FA.pageData.get();
    if (!index || index.size === 0) return 0;

    const anchors = document.querySelectorAll('a[href*="/item/"], a[href*="/auction/"], a[href*="/shops/product/"]');
    let added = 0;

    for (const anchor of anchors) {
      if (anchor.dataset[MISS]) continue;

      if (anchor.dataset[MARK]) {
        const next = anchor.nextSibling;
        const stillThere = next && next.classList && next.classList.contains(BADGE_CLASS);
        if (stillThere) continue;
        // サイト側の再描画で消されていた。印を外して貼り直す。
        delete anchor.dataset[MARK];
      }

      let itemId = null;
      try {
        itemId = sites.itemIdOf(new URL(anchor.href, location.href), site);
      } catch (_err) {
        anchor.dataset[MISS] = '1';
        continue;
      }
      if (!itemId) {
        anchor.dataset[MISS] = '1'; // 商品リンクではない。毎回 URL を解析し直さない。
        continue;
      }

      const entry = index.get(itemId);
      if (!entry) {
        // まだデータが届いていないだけかもしれないので、諦めた印だけ付ける
        anchor.dataset[MISS] = '1';
        continue;
      }

      const node = badge(entry.created, entry.updated, settings.showRelative);
      if (!node) {
        anchor.dataset[MISS] = '1';
        continue;
      }
      anchor.dataset[MARK] = '1';
      delete anchor.dataset[MISS];

      // カードの中ではなく隣に置く。React が管理する子要素の並びに
      // 割り込むと、サイト側の再描画で例外を起こすことがあるため。
      const parent = anchor.parentNode;
      if (!parent) continue;
      parent.insertBefore(node, anchor.nextSibling);
      added++;
    }

    if (added) log.debug(SCOPE, `一覧に ${added} 件の日時を追加`);
    return added;
  }

  /** 画面遷移時に、前の商品の表示を残さない。 */
  function clear() {
    for (const node of document.querySelectorAll(`.${BADGE_CLASS}`)) node.remove();
    for (const element of document.querySelectorAll('[data-fk-ts], [data-fk-ts-miss]')) {
      delete element.dataset[MARK];
      delete element.dataset[MISS];
    }
  }

  /** 埋め込みデータが増えたときに、取れなかったぶんへ再挑戦する。 */
  function retryMisses(site, settings) {
    for (const element of document.querySelectorAll('[data-fk-ts-miss]')) delete element.dataset[MISS];
    annotateItemPage(site, settings);
  }

  function renderPanel(state) {
    ui.setSection(SCOPE, '出品日時', (container) => {
      if (!state || !state.found || !state.found.created) {
        const message = state && state.itemId
          ? 'このページの出品日時を取得できませんでした。サイト側の作りが変わった可能性があります。設定画面の「診断」で詳細を確認できます。'
          : '商品ページを開くと、出品日時と更新日時をここに表示します。';
        container.appendChild(ui.el('p', { className: 'empty', textContent: message }));
        return;
      }

      const { created, updated, confidence } = state.found;
      const list = document.createElement('dl');
      list.className = 'kv';

      const addRow = (label, value) => {
        if (!value) return;
        const row = document.createElement('div');
        row.appendChild(ui.el('dt', { textContent: label }));
        row.appendChild(ui.el('dd', { textContent: value }));
        list.appendChild(row);
      };

      addRow('出品日時', format.absolute(created));
      addRow('更新日時', format.absolute(updated));
      const days = format.daysSince(created);
      if (days !== null) addRow('経過', `${days}日`);
      container.appendChild(list);

      if (confidence === 'medium') {
        container.appendChild(ui.el('p', {
          className: 'note',
          textContent: '※ 商品IDと突き合わせられなかったため、参考値です。',
        }));
      }
    }, 10);
  }

  function run(site, settings) {
    if (!settings.features.timestamps) {
      log.mark(SCOPE, 'skip', '設定で無効');
      ui.removeSection(SCOPE);
      return;
    }

    const state = log.safe(SCOPE, () => annotateItemPage(site, settings), null);
    log.safe(SCOPE, () => annotateCards(site, settings), 0);
    log.safe(SCOPE, () => renderPanel(state), null);
  }

  FA.features = FA.features || {};
  FA.features.timestamps = { run, badge, annotateCards, clear, retryMisses };
})(typeof globalThis !== 'undefined' ? globalThis : this);
