/**
 * 画面に出す部品。
 *
 * 方針が 2 つある。
 *
 * 1. 自前の UI は Shadow DOM の中に閉じる。サイト側の CSS で崩されず、
 *    こちらの CSS でサイト側を壊すこともない。この手の拡張が「表示が変」
 *    と言われる原因の多くはここ。
 * 2. 操作の入口はページ内の特定要素に挿し込まず、画面端の固定パネルに置く。
 *    サイトが作り替えられてもボタンが消えない。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const log = FA.log;

  const HOST_ID = 'furimakit-root';

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }

    .launcher {
      position: fixed; top: 30vh; z-index: 2147483000;
      display: flex; align-items: center; gap: 6px;
      padding: 10px 8px; border: 0; cursor: pointer;
      background: #16a34a; color: #fff;
      font-size: 12px; font-weight: 700; line-height: 1.2; letter-spacing: .04em;
      writing-mode: vertical-rl;
      border-radius: 8px 0 0 8px; box-shadow: 0 2px 10px rgba(0,0,0,.2);
    }
    .launcher:hover { background: #15803d; }
    .launcher[data-side="left"] { border-radius: 0 8px 8px 0; }

    .panel {
      position: fixed; top: 0; bottom: 0; width: 340px; max-width: 92vw;
      z-index: 2147483001; display: flex; flex-direction: column;
      background: #fff; color: #111827;
      box-shadow: 0 0 24px rgba(0,0,0,.22);
      transition: transform .18s ease;
    }
    .panel[hidden] { display: none; }

    .panel-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; background: #16a34a; color: #fff; flex: none;
    }
    .panel-head h1 { margin: 0; font-size: 14px; font-weight: 700; }
    .panel-head button {
      border: 0; background: transparent; color: #fff; cursor: pointer;
      font-size: 18px; line-height: 1; padding: 4px 6px; border-radius: 4px;
    }
    .panel-head button:hover { background: rgba(255,255,255,.18); }

    .panel-body { overflow-y: auto; padding: 4px 0 24px; flex: 1; }

    .section { border-bottom: 1px solid #e5e7eb; padding: 12px 14px; }
    .section:last-child { border-bottom: 0; }
    .section h2 {
      margin: 0 0 8px; font-size: 11px; font-weight: 700;
      color: #6b7280; letter-spacing: .06em;
    }
    .section .empty { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6; }

    .row { display: flex; flex-wrap: wrap; gap: 6px; }

    .chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 999px;
      background: #fff; color: #111827; font-size: 12px; cursor: pointer;
      text-decoration: none; max-width: 100%;
    }
    .chip:hover { background: #f3f4f6; border-color: #9ca3af; }
    .chip .hint { color: #6b7280; font-size: 10px; }

    .tpl { display: flex; gap: 6px; align-items: stretch; margin-bottom: 6px; }
    .tpl button {
      flex: 1; text-align: left; padding: 8px 10px; cursor: pointer;
      border: 1px solid #d1d5db; border-radius: 6px; background: #fff;
      font-size: 12px; color: #111827; overflow: hidden;
    }
    .tpl button:hover { background: #f0fdf4; border-color: #16a34a; }
    .tpl .name { display: block; font-weight: 600; margin-bottom: 2px; }
    .tpl .preview {
      display: block; color: #6b7280; font-size: 11px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tpl .copy { flex: none; width: 38px; font-size: 11px; text-align: center; padding: 0; }

    .cat { margin: 0 0 4px; font-size: 11px; color: #374151; font-weight: 700; }

    .kv { margin: 0; font-size: 12px; line-height: 1.8; }
    .kv div { display: flex; justify-content: space-between; gap: 8px; }
    .kv dt { color: #6b7280; }
    .kv dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }

    .note { margin: 6px 0 0; font-size: 11px; color: #9ca3af; line-height: 1.6; }

    .field { width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; }

    .toast {
      position: fixed; bottom: 24px; z-index: 2147483002;
      padding: 10px 16px; border-radius: 8px;
      background: #111827; color: #fff; font-size: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
      opacity: 0; transform: translateY(8px); transition: opacity .15s, transform .15s;
    }
    .toast[data-show="1"] { opacity: 1; transform: translateY(0); }
  `;

  let hostEl = null;
  let shadow = null;
  let panelEl = null;
  let bodyEl = null;
  let toastEl = null;
  let toastTimer = null;
  let side = 'right';
  const sections = new Map();

  function ensureHost() {
    if (hostEl && hostEl.isConnected) return shadow;

    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    // ページのレイアウト計算に影響させない
    hostEl.style.cssText = 'all:initial;position:static;';
    shadow = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);

    const launcher = document.createElement('button');
    launcher.className = 'launcher';
    launcher.type = 'button';
    launcher.textContent = 'フリマキット';
    launcher.addEventListener('click', () => togglePanel());
    shadow.appendChild(launcher);

    panelEl = document.createElement('div');
    panelEl.className = 'panel';
    panelEl.hidden = true;
    panelEl.innerHTML =
      '<div class="panel-head"><h1>フリマキット</h1><button type="button" aria-label="閉じる">×</button></div>' +
      '<div class="panel-body"></div>';
    panelEl.querySelector('.panel-head button').addEventListener('click', () => togglePanel(false));
    shadow.appendChild(panelEl);

    bodyEl = panelEl.querySelector('.panel-body');

    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    shadow.appendChild(toastEl);

    applySide(side);
    (document.body || document.documentElement).appendChild(hostEl);
    return shadow;
  }

  function applySide(value) {
    side = value === 'left' ? 'left' : 'right';
    if (!shadow) return;
    const launcher = shadow.querySelector('.launcher');
    launcher.dataset.side = side;
    launcher.style[side] = '0';
    launcher.style[side === 'right' ? 'left' : 'right'] = 'auto';
    panelEl.style[side] = '0';
    panelEl.style[side === 'right' ? 'left' : 'right'] = 'auto';
    toastEl.style[side] = '24px';
  }

  function togglePanel(force) {
    ensureHost();
    const next = force === undefined ? panelEl.hidden : force;
    panelEl.hidden = !next;
  }

  function toast(message) {
    ensureHost();
    toastEl.textContent = message;
    toastEl.dataset.show = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.dataset.show = '0';
    }, 2200);
  }

  /**
   * パネルに区画を登録する。同じ id で呼び直すと中身を差し替える。
   * order が小さいものが上。
   */
  function setSection(id, title, build, order = 100) {
    ensureHost();

    let entry = sections.get(id);
    if (!entry) {
      const el = document.createElement('section');
      el.className = 'section';
      el.dataset.sectionId = id;
      entry = { el, order };
      sections.set(id, entry);
    }
    entry.order = order;
    entry.el.innerHTML = '';

    const heading = document.createElement('h2');
    heading.textContent = title;
    entry.el.appendChild(heading);

    const content = document.createElement('div');
    entry.el.appendChild(content);
    build(content);

    // order 順に並べ直す
    const ordered = Array.from(sections.values()).sort((a, b) => a.order - b.order);
    for (const item of ordered) bodyEl.appendChild(item.el);
  }

  function removeSection(id) {
    const entry = sections.get(id);
    if (entry && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    sections.delete(id);
  }

  // --- 入力欄への差し込み -------------------------------------------------

  let lastFocused = null;

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA') return !el.disabled && !el.readOnly;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return !el.disabled && !el.readOnly && ['text', 'search', 'url', 'email', 'tel', ''].includes(type);
    }
    return false;
  }

  function trackFocus() {
    const remember = (event) => {
      const target = event.target;
      if (isEditable(target)) lastFocused = target;
    };
    document.addEventListener('focusin', remember, true);
    document.addEventListener('click', remember, true);
  }

  function focusedField() {
    const active = document.activeElement;
    if (isEditable(active)) return active;
    if (lastFocused && lastFocused.isConnected && isEditable(lastFocused)) return lastFocused;
    return null;
  }

  /**
   * カーソル位置に文字列を差し込む。
   *
   * React で作られた画面では el.value = ... としても内部状態が更新されず、
   * 見た目だけ入って送信すると消える。プロトタイプ側の setter を使い、
   * input イベントを発火させて React に変更を届ける。
   */
  function insertText(el, text) {
    if (!el || typeof text !== 'string') return false;

    if (el.isContentEditable) {
      el.focus();
      const ok = document.execCommand && document.execCommand('insertText', false, text);
      if (!ok) el.textContent += text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    const tag = el.tagName.toUpperCase();
    if (tag !== 'TEXTAREA' && tag !== 'INPUT') return false;

    const value = el.value || '';
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : value.length;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : value.length;
    const next = value.slice(0, start) + text + value.slice(end);

    const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, next);
    else el.value = next;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    el.focus();
    const caret = start + text.length;
    if (typeof el.setSelectionRange === 'function') {
      try {
        el.setSelectionRange(caret, caret);
      } catch (_err) {
        /* number 型 input などは範囲指定を受け付けない */
      }
    }
    return true;
  }

  async function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_err) {
      /* 権限やフォーカスの問題。下の手段へ落ちる */
    }

    try {
      const scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.setAttribute('aria-hidden', 'true');
      scratch.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
      document.body.appendChild(scratch);
      scratch.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(scratch);
      return !!ok;
    } catch (err) {
      if (log) log.warn('ui', 'コピーに失敗しました', err && err.message);
      return false;
    }
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const child of children || []) {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  FA.ui = {
    ensureHost, togglePanel, toast, setSection, removeSection, applySide,
    trackFocus, focusedField, isEditable, insertText, copy, el,
    get shadow() { return shadow; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
