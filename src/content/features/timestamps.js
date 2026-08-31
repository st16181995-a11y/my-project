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
  const MARK = 'fkTs'; // dataset フラグ。二重挿入よけ

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
    if (heading && !heading.parentNode.querySelector(`.${BADGE_CLASS}`)) {
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
      if (anchor.dataset[MARK]) continue;

      let itemId = null;
      try {
        itemId = sites.itemIdOf(new URL(anchor.href, location.href), site);
      } catch (_err) {
        continue;
      }
      if (!itemId) continue;

      const entry = index.get(itemId);
      anchor.dataset[MARK] = '1'; // 日時が無くても再走査しない
      if (!entry) continue;

      const node = badge(entry.created, entry.updated, settings.showRelative);
      if (!node) continue;

      // カードの中ではなく隣に置く。サイト側の再描画で消えても
      // 監視で貼り直すため、消えっぱなしにはならない。
      const parent = anchor.parentNode;
      if (!parent) continue;
      parent.insertBefore(node, anchor.nextSibling);
      added++;
    }

    if (added) log.debug(SCOPE, `一覧に ${added} 件の日時を追加`);
    return added;
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
  FA.features.timestamps = { run, badge, annotateCards };
})(typeof globalThis !== 'undefined' ? globalThis : this);
