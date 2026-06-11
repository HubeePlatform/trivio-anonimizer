'use strict';

const KEY_ENABLED    = 'trivio_enabled';
const KEY_SELECTORS  = 'trivio_selectors';
const HIDDEN_CLASS   = 'trivio-hidden';
const HIGHLIGHT_CLASS = 'trivio-highlight';
const PATTERN_ATTR   = 'data-trivio-auto';

// CPF: 000.000.000-00  |  CNPJ: 00.000.000/0000-00
const CPF_CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g;

const state = {
  enabled: false,
  selectors: [],
  pickerActive: false,
  highlighted: [],
  columnKey: null,
};

let observer      = null;
let mutationTimer = null;

// ── Init ─────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get([KEY_ENABLED, KEY_SELECTORS]);
  state.enabled   = data[KEY_ENABLED]   ?? false;
  state.selectors = data[KEY_SELECTORS] ?? [];

  applyHiding();
  if (state.enabled) applyPatternHiding();
  setupObserver();
  setupMessageListener();

  chrome.storage.onChanged.addListener(changes => {
    if (changes[KEY_ENABLED]) {
      state.enabled = changes[KEY_ENABLED].newValue;
      applyHiding();
      state.enabled ? applyPatternHiding() : clearPatternHiding();
    }
    if (changes[KEY_SELECTORS]) {
      state.selectors = changes[KEY_SELECTORS].newValue ?? [];
      applyHiding();
    }
  });
}

// ── Selector-based hiding ─────────────────────────────────────────

function applyHiding() {
  // Não toca nos elementos de CPF/CNPJ gerados automaticamente
  document.querySelectorAll(`.${HIDDEN_CLASS}:not([${PATTERN_ATTR}])`).forEach(el => {
    el.classList.remove(HIDDEN_CLASS);
    el.style.removeProperty('--trivio-blur');
  });

  if (!state.enabled || state.selectors.length === 0) return;

  for (const { selector, blur, disabled } of state.selectors) {
    if (disabled) continue;
    try {
      document.querySelectorAll(selector).forEach(el => {
        el.classList.add(HIDDEN_CLASS);
        if (blur != null) el.style.setProperty('--trivio-blur', `${blur}px`);
      });
    } catch (e) {
      console.warn('[Trivio] seletor inválido:', selector, e);
    }
  }
}

// ── CPF / CNPJ auto-hiding ────────────────────────────────────────
// Estratégia: em vez de modificar nós de texto (perigoso em SPAs/React),
// simplesmente adicionamos a classe de blur no elemento PAI do texto.

function applyPatternHiding() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName?.toLowerCase();
      if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag))
        return NodeFilter.FILTER_REJECT;
      if (p.closest('#trivio-picker-banner')) return NodeFilter.FILTER_REJECT;
      if (p.hasAttribute(PATTERN_ATTR)) return NodeFilter.FILTER_SKIP; // já oculto
      CPF_CNPJ_RE.lastIndex = 0;
      return CPF_CNPJ_RE.test(node.textContent)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el) continue;
    el.setAttribute(PATTERN_ATTR, 'cpf-cnpj');
    el.classList.add(HIDDEN_CLASS);
  }
}

function clearPatternHiding() {
  document.querySelectorAll(`[${PATTERN_ATTR}]`).forEach(el => {
    el.removeAttribute(PATTERN_ATTR);
    el.classList.remove(HIDDEN_CLASS);
  });
}

// ── MutationObserver ──────────────────────────────────────────────

function setupObserver() {
  observer = new MutationObserver(mutations => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      if (!state.enabled) return;
      applyHiding();
      // Re-aplica padrões apenas quando novos nós foram inseridos (ex: paginação)
      if (mutations.some(m => m.addedNodes.length > 0)) applyPatternHiding();
    }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Picker ────────────────────────────────────────────────────────

function startPicker() {
  if (state.pickerActive) return;
  state.pickerActive = true;
  document.body.classList.add('trivio-picker-active');
  showBanner();
  document.addEventListener('mouseover', onHover, true);
  document.addEventListener('mouseout',  onOut,   true);
  document.addEventListener('click',     onClick,  true);
  document.addEventListener('keydown',   onKeydown, true);
}

function stopPicker() {
  if (!state.pickerActive) return;
  state.pickerActive = false;
  document.body.classList.remove('trivio-picker-active');
  hideBanner();
  clearHighlights();
  state.columnKey = null;
  document.removeEventListener('mouseover', onHover, true);
  document.removeEventListener('mouseout',  onOut,   true);
  document.removeEventListener('click',     onClick,  true);
  document.removeEventListener('keydown',   onKeydown, true);
}

function clearHighlights() {
  state.highlighted.forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
  state.highlighted = [];
}

// ── Hover ─────────────────────────────────────────────────────────

function onHover(e) {
  const target = e.target;
  if (target.closest('#trivio-picker-banner')) return;

  const cell = findCell(target);
  if (cell) {
    const key = cellKey(cell);
    if (key === state.columnKey) return; // mesmo coluna — sem flicker
    state.columnKey = key;

    const cells = findColumnCells(cell);
    clearHighlights();
    cells.forEach(c => c.classList.add(HIGHLIGHT_CLASS));
    state.highlighted = cells;
    updateBannerHint(`📋 Coluna — ${cells.length} célula${cells.length !== 1 ? 's' : ''} — clique para ocultar`);
  } else {
    if (state.highlighted.length === 1 && state.highlighted[0] === target) return;
    state.columnKey = null;
    clearHighlights();
    state.highlighted = [target];
    target.classList.add(HIGHLIGHT_CLASS);
    updateBannerHint('📌 Elemento — clique para ocultar');
  }
}

function onOut(e) {
  if (!e.relatedTarget || e.relatedTarget.closest('#trivio-picker-banner')) {
    clearHighlights();
    state.columnKey = null;
    updateBannerHint('Passe o mouse sobre um elemento');
  }
}

// ── Click ─────────────────────────────────────────────────────────

function onClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.target;
  if (target.closest('#trivio-picker-banner')) return;

  clearHighlights();

  let selector, label, count;
  const cell = findCell(target);

  if (cell) {
    const cells = findColumnCells(cell);
    const result = buildColumnSelector(cell, cells);
    selector = result.selector;
    label    = result.label;
    count    = safeQueryAll(selector).length || cells.length;
  } else {
    selector = generateSelector(target);
    label    = describeElement(target) || selector;
    count    = safeQueryAll(selector).length;
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  state.selectors = [...state.selectors, { id, selector, label, count }];
  chrome.storage.local.set({ [KEY_SELECTORS]: state.selectors });

  if (state.enabled) applyHiding();
  showToast(`✓ ${count > 1 ? count + ' células ocultadas' : 'Elemento ocultado'}`);
  stopPicker();
}

function onKeydown(e) {
  if (e.key === 'Escape') stopPicker();
}

// ── Detecção de célula (td/th, ARIA, div-grid) ────────────────────

function findCell(target) {
  // 1. <td> / <th> nativo
  const nativeCell = target.closest('td, th');
  if (nativeCell) return nativeCell;

  // 2. ARIA grid
  const ariaCell = target.closest(
    '[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]'
  );
  if (ariaCell) return ariaCell;

  // 3. Detecção posicional: sobe até encontrar elemento cujo avô
  //    contém múltiplas "linhas" com igual número de filhos
  let el = target;
  for (let d = 0; d < 5 && el && el !== document.body; d++) {
    const parent = el.parentElement;
    if (!parent || parent === document.body) break;

    const siblings = Array.from(parent.children);
    if (siblings.length < 2) { el = parent; continue; }

    const grandParent = parent.parentElement;
    if (!grandParent || grandParent === document.body) { el = parent; continue; }

    const rows = Array.from(grandParent.children).filter(
      row => row !== parent && row.children.length === siblings.length
    );
    if (rows.length >= 1) return el; // achamos uma estrutura de grade

    el = parent;
  }
  return null;
}

function findColumnCells(cell) {
  // Tabela nativa
  if (cell.tagName === 'TD' || cell.tagName === 'TH') {
    const table = cell.closest('table');
    if (table) {
      const colIdx = Array.from(cell.parentElement.children).indexOf(cell) + 1;
      return safeQueryAll(`td:nth-child(${colIdx}), th:nth-child(${colIdx})`, table);
    }
  }

  // Genérico (div-grid, ARIA…)
  const parent = cell.parentElement;
  const grandParent = parent?.parentElement;
  if (!parent || !grandParent) return [cell];

  const colIdx = Array.from(parent.children).indexOf(cell);
  const rowLen  = parent.children.length;

  const cells = Array.from(grandParent.children)
    .filter(row => row.children.length === rowLen)
    .map(row => row.children[colIdx])
    .filter(Boolean);

  return cells.length >= 2 ? cells : [cell];
}

function cellKey(cell) {
  const parent = cell.parentElement;
  const gp = parent?.parentElement;
  const colIdx = Array.from(parent?.children || []).indexOf(cell);
  const id = gp?.id || gp?.className || gp?.tagName || 'x';
  return `${id}::${colIdx}`;
}

// ── Geração de seletor de coluna ──────────────────────────────────

function buildColumnSelector(cell, cells) {
  if (cell.tagName === 'TD' || cell.tagName === 'TH') {
    return buildNativeColumnSelector(cell);
  }

  // Tenta classes comuns entre todos os elementos da coluna
  const common = findCommonClasses(cells);
  if (common.length > 0) {
    const sel = common.map(c => `.${CSS.escape(c)}`).join('');
    const headerText = (cells[0]?.textContent || '').trim().slice(0, 40);
    return { selector: sel, label: headerText ? `Coluna: ${headerText}` : `Coluna (.${common[0]})` };
  }

  // Fallback: nth-child a partir do contêiner
  const parent = cell.parentElement;
  const gp = parent?.parentElement;
  const colIdx = Array.from(parent?.children || []).indexOf(cell) + 1;
  const containerSel = generateSelector(gp || parent);
  return { selector: `${containerSel} > * > *:nth-child(${colIdx})`, label: `Coluna ${colIdx}` };
}

function buildNativeColumnSelector(cell) {
  const table = cell.closest('table');
  const colIdx = Array.from(cell.parentElement.children).indexOf(cell) + 1;

  let tableSelector = '';
  if (table?.id) {
    tableSelector = `#${CSS.escape(table.id)}`;
  } else if (table) {
    const cls = [...table.classList].map(c => `.${CSS.escape(c)}`).join('');
    if (cls && safeQueryAll(`table${cls}`).length === 1) tableSelector = `table${cls}`;
    else if (cls && safeQueryAll(cls).length === 1) tableSelector = cls;
  }

  const selector = tableSelector
    ? `${tableSelector} td:nth-child(${colIdx}), ${tableSelector} th:nth-child(${colIdx})`
    : `td:nth-child(${colIdx}), th:nth-child(${colIdx})`;

  const headerEl = table?.querySelector(`th:nth-child(${colIdx})`);
  const headerText = headerEl ? describeElement(headerEl) : '';
  return { selector, label: headerText ? `Coluna: ${headerText}` : `Coluna ${colIdx}` };
}

function findCommonClasses(cells) {
  if (cells.length === 0) return [];
  const first = new Set([...cells[0].classList].filter(c => !c.startsWith('trivio-')));
  for (const cell of cells.slice(1)) {
    const cls = new Set([...cell.classList].filter(c => !c.startsWith('trivio-')));
    for (const c of first) if (!cls.has(c)) first.delete(c);
  }
  return [...first];
}

// ── Descrição legível de um elemento ─────────────────────────────

function describeElement(el) {
  // 1. Texto visível (ignora espaços e quebras)
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (text) return text;

  // 2. Imagem direta ou dentro do elemento
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (img) {
    const alt = (img.getAttribute('alt') || '').trim();
    if (alt) return `🖼 ${alt.slice(0, 50)}`;
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    const filename = src.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '').slice(0, 40);
    if (filename) return `🖼 ${filename}`;
    return '🖼 Imagem';
  }

  // 3. aria-label
  const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
  if (aria) return aria.slice(0, 60);

  // 4. Tag + primeiras classes (fallback legível)
  const tag = el.tagName.toLowerCase();
  const cls = [...el.classList].filter(c => !c.startsWith('trivio-')).slice(0, 2).join(' ');
  return cls ? `<${tag} .${cls}>` : `<${tag}>`;
}

// ── Geração de seletor de elemento ───────────────────────────────

function generateSelector(el) {
  if (!el?.tagName) return '*';
  if (el.id) { const s = `#${CSS.escape(el.id)}`; if (safeQueryAll(s).length >= 1) return s; }

  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList]
    .filter(c => !c.startsWith('trivio-'))
    .map(c => `.${CSS.escape(c)}`).join('');

  if (classes) {
    const wt = `${tag}${classes}`;
    if (safeQueryAll(wt).length <= 30) return wt;
    if (safeQueryAll(classes).length <= 30) return classes;
  }

  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-') && attr.value) {
      try {
        const s = `[${attr.name}="${CSS.escape(attr.value)}"]`;
        if (safeQueryAll(s).length <= 10) return s;
      } catch {}
    }
  }
  return buildPath(el);
}

function buildPath(el) {
  const parts = [];
  let cur = el;
  while (cur?.tagName && cur !== document.documentElement) {
    const parent = cur.parentElement;
    if (!parent) break;
    if (cur.id) { parts.unshift(`${cur.tagName.toLowerCase()}#${CSS.escape(cur.id)}`); break; }
    const idx = Array.from(parent.children).indexOf(cur) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
    cur = parent;
  }
  return parts.join(' > ');
}

function safeQueryAll(sel, root = document) {
  try { return [...root.querySelectorAll(sel)]; } catch { return []; }
}

// ── Banner & Toast ────────────────────────────────────────────────

function showBanner() {
  document.getElementById('trivio-picker-banner')?.remove();
  const banner = document.createElement('div');
  banner.id = 'trivio-picker-banner';
  banner.innerHTML = `
    <span id="trivio-banner-hint">Passe o mouse sobre um elemento</span>
    <button id="trivio-cancel-btn">✕ Cancelar (Esc)</button>
  `;
  document.body.prepend(banner);
  document.getElementById('trivio-cancel-btn').addEventListener('click', e => {
    e.stopPropagation();
    stopPicker();
  });
}

function hideBanner() { document.getElementById('trivio-picker-banner')?.remove(); }

function updateBannerHint(text) {
  const el = document.getElementById('trivio-banner-hint');
  if (el) el.textContent = text;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'trivio-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

// ── Messages ──────────────────────────────────────────────────────

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    switch (msg.action) {
      case 'toggle':
        state.enabled = msg.enabled;
        applyHiding();
        state.enabled ? applyPatternHiding() : clearPatternHiding();
        break;
      case 'startPicker':
        startPicker();
        break;
      case 'updateSelectors':
        state.selectors = msg.selectors;
        applyHiding();
        break;
      case 'highlightTemp':
        safeQueryAll(msg.selector).forEach(el => el.classList.add('trivio-temp-hl'));
        safeQueryAll(msg.selector)[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      case 'clearTempHighlight':
        document.querySelectorAll('.trivio-temp-hl').forEach(el => el.classList.remove('trivio-temp-hl'));
        break;
      case 'applyBlur': {
        const sel = state.selectors.find(s => s.id === msg.id);
        if (sel) { sel.blur = msg.blur; applyHiding(); }
        break;
      }
      case 'removeSelector':
        state.selectors = state.selectors.filter(s => s.id !== msg.id);
        chrome.storage.local.set({ [KEY_SELECTORS]: state.selectors });
        applyHiding();
        break;
      case 'clearAll':
        state.selectors = [];
        chrome.storage.local.set({ [KEY_SELECTORS]: [] });
        applyHiding();
        break;
    }
    respond({ ok: true });
    return true;
  });
}

init();
