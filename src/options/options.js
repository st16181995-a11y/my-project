/**
 * 設定画面。
 *
 * 保存は「保存する」を押したときだけ。入力の途中で勝手に保存すると、
 * 書きかけの定型文が各タブへ流れて混乱するため。
 */
(function () {
  const { storage, sites } = globalThis.FA;

  const featuresEl = document.getElementById('features');
  const templatesEl = document.getElementById('templates');
  const targetsEl = document.getElementById('targets');
  const displayEl = document.getElementById('display');
  const statusEl = document.getElementById('status');

  const FEATURE_LABELS = {
    timestamps: ['出品日時を表示', '商品ページと検索結果に、正確な出品日時と経過日数を出します。'],
    templates: ['定型文を挿入', '画面端のパネルから、選んだ入力欄へ定型文を差し込みます。'],
    crossSearch: ['他サイトで探す', '同じ言葉で他サイトの検索を開くボタンを出します。売り切れ検索も含みます。'],
    copyText: ['商品情報をコピー', '商品名・説明文・URL をひと押しでコピーします。'],
  };

  let state = null;

  function setStatus(message, kind = 'ok') {
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
    if (message) setTimeout(() => { statusEl.textContent = ''; }, 4000);
  }

  function checkbox(checked, label, description, onChange) {
    const wrapper = document.createElement('label');
    wrapper.className = 'check';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));

    const body = document.createElement('span');
    body.className = 'body';
    body.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    if (description) body.appendChild(Object.assign(document.createElement('small'), { textContent: description }));

    wrapper.appendChild(input);
    wrapper.appendChild(body);
    return wrapper;
  }

  function renderFeatures() {
    featuresEl.innerHTML = '';
    for (const [key, [label, description]] of Object.entries(FEATURE_LABELS)) {
      featuresEl.appendChild(
        checkbox(state.features[key], label, description, (value) => { state.features[key] = value; })
      );
    }
  }

  function renderTemplates() {
    templatesEl.innerHTML = '';

    if (state.templates.length === 0) {
      templatesEl.appendChild(
        Object.assign(document.createElement('p'), {
          className: 'desc',
          textContent: '定型文がありません。「定型文を追加」から作成してください。',
        })
      );
      return;
    }

    state.templates.forEach((template, index) => {
      const item = document.createElement('div');
      item.className = 'tpl-item';

      const head = document.createElement('div');
      head.className = 'tpl-head';

      const label = document.createElement('input');
      label.type = 'text';
      label.value = template.label;
      label.placeholder = '名前（ボタンに出ます）';
      label.addEventListener('input', () => { template.label = label.value; });

      const category = document.createElement('input');
      category.type = 'text';
      category.value = template.category;
      category.placeholder = '分類';
      category.style.maxWidth = '160px';
      category.addEventListener('input', () => { template.category = category.value; });

      const up = Object.assign(document.createElement('button'), { type: 'button', className: 'small', textContent: '↑', title: '上へ' });
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        [state.templates[index - 1], state.templates[index]] = [state.templates[index], state.templates[index - 1]];
        renderTemplates();
      });

      const down = Object.assign(document.createElement('button'), { type: 'button', className: 'small', textContent: '↓', title: '下へ' });
      down.disabled = index === state.templates.length - 1;
      down.addEventListener('click', () => {
        [state.templates[index + 1], state.templates[index]] = [state.templates[index], state.templates[index + 1]];
        renderTemplates();
      });

      const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'small danger', textContent: '削除' });
      remove.addEventListener('click', () => {
        state.templates.splice(index, 1);
        renderTemplates();
      });

      head.append(label, category, up, down, remove);

      const body = document.createElement('textarea');
      body.value = template.body;
      body.placeholder = '本文';
      body.addEventListener('input', () => { template.body = body.value; });

      item.append(head, body);
      templatesEl.appendChild(item);
    });
  }

  function renderTargets() {
    targetsEl.innerHTML = '';
    const selected = new Set(state.crossSearchTargets);

    for (const target of sites.SEARCH_TARGETS) {
      const label = target.hint ? `${target.label}（${target.hint}）` : target.label;
      targetsEl.appendChild(
        checkbox(selected.size === 0 || selected.has(target.id), label, '', (value) => {
          const current = new Set(
            state.crossSearchTargets.length ? state.crossSearchTargets : sites.SEARCH_TARGETS.map((t) => t.id)
          );
          if (value) current.add(target.id);
          else current.delete(target.id);
          state.crossSearchTargets = current.size === sites.SEARCH_TARGETS.length ? [] : Array.from(current);
        })
      );
    }
  }

  function renderDisplay() {
    displayEl.innerHTML = '';
    displayEl.appendChild(
      checkbox(state.showRelative, '経過日数も並べて出す', '「出品 2026/08/12 14:05 (19日前)」のように表示します。', (value) => {
        state.showRelative = value;
      })
    );
    displayEl.appendChild(
      checkbox(state.panelSide === 'left', 'パネルを画面の左に出す', 'サイト側のボタンと重なるときに切り替えてください。', (value) => {
        state.panelSide = value ? 'left' : 'right';
      })
    );
  }

  function renderAll() {
    renderFeatures();
    renderTemplates();
    renderTargets();
    renderDisplay();
  }

  document.getElementById('add-template').addEventListener('click', () => {
    state.templates.push({
      id: `t_${Date.now()}`,
      category: 'コメント',
      label: `定型文 ${state.templates.length + 1}`,
      body: '',
    });
    renderTemplates();
    const areas = templatesEl.querySelectorAll('textarea');
    if (areas.length) areas[areas.length - 1].focus();
  });

  document.getElementById('restore-templates').addEventListener('click', () => {
    if (!confirm('いま編集中の定型文を、初期の内容で置き換えます。よろしいですか。')) return;
    state.templates = JSON.parse(JSON.stringify(storage.DEFAULT_TEMPLATES));
    renderTemplates();
    setStatus('初期の定型文に戻しました。保存を押すと確定します。');
  });

  document.getElementById('save').addEventListener('click', async () => {
    try {
      const saved = await storage.save(state);
      state = saved;
      renderAll();
      setStatus('保存しました。開いているタブにもすぐ反映されます。');
    } catch (err) {
      setStatus(`保存できませんでした: ${err && err.message}`, 'error');
    }
  });

  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'furimakit-settings.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const importFile = document.getElementById('import-file');
  document.getElementById('import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      state = storage.normalize(JSON.parse(text));
      renderAll();
      setStatus('読み込みました。内容を確認して「保存する」を押してください。');
    } catch (err) {
      setStatus('読み込めませんでした。書き出したファイルか確認してください。', 'error');
    } finally {
      importFile.value = '';
    }
  });

  storage.load().then((loaded) => {
    state = loaded;
    renderAll();
  });
})();
