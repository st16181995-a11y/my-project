/**
 * 横断検索。
 *
 * いま見ているキーワード（検索ページ）か商品名（商品ページ）を、
 * 他サイトの検索へそのまま渡す。売り切れ・落札済みの検索を上に置くのは、
 * 相場を見るのが目的の大半だから。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const { log, sites, ui } = FA;

  const SCOPE = 'crossSearch';

  /** 検索キーワード。無ければ商品名を使う。 */
  function currentKeyword(site) {
    const fromUrl = sites.keywordOf(location.href, site);
    if (fromUrl) return fromUrl;
    const name = FA.pageData.itemName();
    return name ? name.slice(0, 60) : '';
  }

  function render(site, settings) {
    ui.setSection(SCOPE, '他サイトで探す', (container) => {
      const keyword = currentKeyword(site);

      const input = document.createElement('input');
      input.className = 'field';
      input.type = 'search';
      input.placeholder = '検索する言葉';
      input.value = keyword;
      container.appendChild(input);

      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginTop = '8px';
      container.appendChild(row);

      const draw = () => {
        row.innerHTML = '';
        const word = input.value.trim();

        if (!word) {
          row.appendChild(ui.el('p', {
            className: 'empty',
            textContent: '言葉を入れると、各サイトの検索を開くボタンが出ます。',
          }));
          return;
        }

        for (const link of sites.crossLinks(word, site ? site.id : null, settings.crossSearchTargets)) {
          const anchor = document.createElement('a');
          anchor.className = 'chip';
          anchor.href = link.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.appendChild(document.createTextNode(link.label));
          if (link.hint) anchor.appendChild(ui.el('span', { className: 'hint', textContent: link.hint }));
          row.appendChild(anchor);
        }
      };

      input.addEventListener('input', draw);
      draw();
    }, 30);
  }

  function run(site, settings) {
    if (!settings.features.crossSearch) {
      log.mark(SCOPE, 'skip', '設定で無効');
      ui.removeSection(SCOPE);
      return;
    }
    log.safe(SCOPE, () => render(site, settings));
    log.mark(SCOPE, 'ok', currentKeyword(site) ? 'キーワードあり' : 'キーワードなし');
  }

  FA.features = FA.features || {};
  FA.features.crossSearch = { run, currentKeyword };
})(typeof globalThis !== 'undefined' ? globalThis : this);
