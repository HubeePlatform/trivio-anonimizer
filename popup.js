'use strict';

const KEY_ENABLED = 'trivio_enabled';
const KEY_SELECTORS = 'trivio_selectors';

let state = { enabled: false, selectors: [] };
let blurTimer = null;

// ── Init ─────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get([KEY_ENABLED, KEY_SELECTORS]);
  state.enabled = data[KEY_ENABLED] ?? false;
  state.selectors = data[KEY_SELECTORS] ?? [];
  renderUI();
  setupListeners();
}

// ── Render ────────────────────────────────────────────────────────

function renderUI() {
  const toggle = document.getElementById('toggle-enabled');
  const statusEl = document.getElementById('status-text');
  const list = document.getElementById('selectors-list');

  toggle.checked = state.enabled;
  statusEl.textContent = state.enabled ? '✓ Modo anonimato ativo' : 'Desativado';
  statusEl.className = `status${state.enabled ? ' active' : ''}`;

  if (state.selectors.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum elemento selecionado</div>';
    return;
  }

  list.innerHTML = state.selectors.map(({ id, label, selector, count, blur = 7, disabled = false }) => `
    <div class="selector-item${disabled ? ' is-disabled' : ''}" data-id="${id}">
      <div class="selector-header">
        <div class="selector-info">
          <div class="selector-label" title="${esc(label)}">${esc(trunc(label, 34))}</div>
          <div class="selector-code" title="${esc(selector)}">${esc(trunc(selector, 34))}${count > 1 ? ` <span style="color:#cba6f7">(${count})</span>` : ''}</div>
        </div>
        <button class="btn-toggle${disabled ? '' : ' active'}" data-id="${id}"
                title="${disabled ? 'Ativar ocultação' : 'Desativar ocultação'}">
          ${disabled ? '○' : '●'}
        </button>
        <button class="btn-remove" data-id="${id}" title="Remover">✕</button>
      </div>
      <div class="blur-row">
        <span class="blur-label">Blur</span>
        <input type="range" class="blur-slider" min="2" max="30" step="1"
               value="${blur}" data-id="${id}">
        <span class="blur-value" data-id="${id}">${blur}px</span>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => removeSelector(btn.dataset.id));
  });

  list.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleSelector(btn.dataset.id));
  });

  // Hover no item → destaca o elemento na página
  list.querySelectorAll('.selector-item').forEach(item => {
    const sel = state.selectors.find(s => s.id === item.dataset.id);
    if (!sel) return;
    item.addEventListener('mouseenter', () =>
      sendToContent({ action: 'highlightTemp', selector: sel.selector }));
    item.addEventListener('mouseleave', () =>
      sendToContent({ action: 'clearTempHighlight' }));
  });

  list.querySelectorAll('.blur-slider').forEach(slider => {
    slider.addEventListener('input', e => {
      const id = e.target.dataset.id;
      const val = parseInt(e.target.value);

      // Atualiza display imediatamente
      const valueEl = list.querySelector(`.blur-value[data-id="${id}"]`);
      if (valueEl) valueEl.textContent = `${val}px`;

      // Atualiza estado em memória
      const sel = state.selectors.find(s => s.id === id);
      if (sel) sel.blur = val;

      // Preview ao vivo na página (debounced 80ms)
      clearTimeout(blurTimer);
      blurTimer = setTimeout(async () => {
        await chrome.storage.local.set({ [KEY_SELECTORS]: state.selectors });
        sendToContent({ action: 'applyBlur', id, blur: val });
      }, 80);
    });
  });
}

// ── Listeners ─────────────────────────────────────────────────────

function setupListeners() {
  document.getElementById('toggle-enabled').addEventListener('change', async e => {
    state.enabled = e.target.checked;
    await chrome.storage.local.set({ [KEY_ENABLED]: state.enabled });
    sendToContent({ action: 'toggle', enabled: state.enabled });
    renderUI();
  });

  document.getElementById('btn-picker').addEventListener('click', async () => {
    const sent = await sendToContent({ action: 'startPicker' });
    if (!sent) {
      showError('Abra a página app.triv.io primeiro.');
      return;
    }
    window.close();
  });

  document.getElementById('btn-enable-all').addEventListener('click', async () => {
    if (state.selectors.length === 0) return;
    state.selectors.forEach(s => { s.disabled = false; });
    await chrome.storage.local.set({ [KEY_SELECTORS]: state.selectors });
    sendToContent({ action: 'updateSelectors', selectors: state.selectors });
    renderUI();
  });

  document.getElementById('btn-disable-all').addEventListener('click', async () => {
    if (state.selectors.length === 0) return;
    state.selectors.forEach(s => { s.disabled = true; });
    await chrome.storage.local.set({ [KEY_SELECTORS]: state.selectors });
    sendToContent({ action: 'updateSelectors', selectors: state.selectors });
    renderUI();
  });

  // Limpar todos com confirmação de 2 cliques
  let clearTimer = null;
  document.getElementById('btn-clear-all').addEventListener('click', async () => {
    if (state.selectors.length === 0) return;
    const btn = document.getElementById('btn-clear-all');
    if (btn.dataset.confirming === '1') {
      clearTimeout(clearTimer);
      btn.dataset.confirming = '0';
      btn.textContent = 'Limpar';
      btn.classList.remove('confirming');
      state.selectors = [];
      await chrome.storage.local.set({ [KEY_SELECTORS]: [] });
      sendToContent({ action: 'clearAll' });
      renderUI();
    } else {
      btn.dataset.confirming = '1';
      btn.textContent = 'Confirmar?';
      btn.classList.add('confirming');
      clearTimer = setTimeout(() => {
        btn.dataset.confirming = '0';
        btn.textContent = 'Limpar';
        btn.classList.remove('confirming');
      }, 3000);
    }
  });
}

async function toggleSelector(id) {
  const sel = state.selectors.find(s => s.id === id);
  if (!sel) return;
  sel.disabled = !sel.disabled;
  await chrome.storage.local.set({ [KEY_SELECTORS]: state.selectors });
  sendToContent({ action: 'updateSelectors', selectors: state.selectors });
  renderUI();
}

async function removeSelector(id) {
  state.selectors = state.selectors.filter(s => s.id !== id);
  await chrome.storage.local.set({ [KEY_SELECTORS]: state.selectors });
  sendToContent({ action: 'removeSelector', id });
  renderUI();
}

// ── Helpers ───────────────────────────────────────────────────────

async function sendToContent(msg) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return false;
    await chrome.tabs.sendMessage(tab.id, msg);
    return true;
  } catch {
    return false;
  }
}

function showError(msg) {
  const btn = document.getElementById('btn-picker');
  const orig = btn.innerHTML;
  btn.textContent = msg;
  btn.disabled = true;
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 3000);
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function trunc(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

init();
