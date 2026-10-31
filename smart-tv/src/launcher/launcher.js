const COLS = 5;
const STORE_COLS = 6;
const grid = document.getElementById('grid');
const overlay = document.getElementById('overlay');
const storeEl = document.getElementById('store');
const storeGrid = document.getElementById('store-grid');
const powerButtons = [...document.querySelectorAll('#power button')];
const recent = JSON.parse(localStorage.getItem('recent') || '[]');

let apps = [];
let catalog = [];
let index = Number(localStorage.getItem('lastIndex') || 0);
let zone = 'grid'; // 'grid' | 'power' | 'store' | 'settings'
let powerIndex = 0;
let storeIndex = 0;
let confirmRemove = null; // { id, until }
let appOpen = false;
let playing = [];

const homeRows = { first: 0 };
const storeRows = { first: 0 };

// Rolagem por fileira (como nas TVs): mantém a fileira em foco visível.
function keepRowVisible(wrap, gridEl, idx, cols, rows) {
  const item = gridEl.children[idx];
  if (!item) return;
  const gap = parseFloat(getComputedStyle(gridEl).rowGap) || 0;
  const step = item.offsetHeight + gap;
  const style = getComputedStyle(wrap);
  const avail = wrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const visible = Math.max(1, Math.floor((avail + gap) / step));
  const row = Math.floor(idx / cols);
  if (row < rows.first) rows.first = row;
  if (row >= rows.first + visible) rows.first = row - visible + 1;
  gridEl.style.transform = `translateY(${-rows.first * step}px)`;
}

const visiblePower = () => powerButtons.filter((b) => !b.hidden);

function paintArt(el, app) {
  el.style.background = app.color;
  el.style.color = app.fg || '#fff';
  if (app.icon) {
    el.style.backgroundImage = `url("${app.icon}")`;
    el.textContent = '';
  } else {
    el.textContent = app.glyph || app.name[0];
  }
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------- Tela inicial ----------

function render() {
  grid.innerHTML = '';
  apps.forEach((app, i) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    const art = document.createElement('div');
    art.className = 'tile-art';
    paintArt(art, app);
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = app.name;
    const dot = document.createElement('div');
    dot.className = 'dot';
    tile.append(art, label, dot);
    tile.addEventListener('mouseenter', () => { zone = 'grid'; index = i; update(); });
    tile.addEventListener('click', () => open());
    grid.append(tile);
  });
  update();
}

function update() {
  index = Math.max(0, Math.min(index, apps.length - 1));
  grid.querySelectorAll('.tile').forEach((t, i) => {
    t.classList.toggle('focused', zone === 'grid' && i === index);
    t.classList.toggle('playing', playing.includes(apps[i].id));
  });
  const power = visiblePower();
  powerButtons.forEach((b) => b.classList.toggle('focused', zone === 'power' && b === power[powerIndex]));
  keepRowVisible(document.getElementById('grid-wrap'), grid, index, COLS, homeRows);

  const app = apps[index];
  if (!app) return;
  document.documentElement.style.setProperty('--accent', app.accent || app.color);
  paintArt(document.getElementById('hero-icon'), app);
  document.getElementById('hero-title').textContent = app.name;
  document.getElementById('hero-subtitle').textContent = app.subtitle || '';
  const chips = document.getElementById('hero-chips');
  chips.innerHTML = '';
  const labels = [];
  if (playing.includes(app.id)) labels.push('Tocando');
  else if (recent.includes(app.id)) labels.push('Usado recentemente');
  if (app.type === 'flatpak') labels.push('App nativo');
  labels.push('OK para abrir');
  for (const text of labels) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = text;
    chips.append(chip);
  }
}

function open() {
  const app = apps[index];
  if (!app || appOpen) return;
  if (!app.system) {
    appOpen = true;
    const pos = recent.indexOf(app.id);
    if (pos >= 0) recent.splice(pos, 1);
    recent.unshift(app.id);
    localStorage.setItem('recent', JSON.stringify(recent.slice(0, 5)));
  }
  localStorage.setItem('lastIndex', String(index));
  window.tv.launch(app.id);
}

async function reloadApps() {
  apps = await window.tv.apps();
  render();
}

// ---------- Loja ----------

function badgeFor(item) {
  if (confirmRemove?.id === item.id && confirmRemove.until > Date.now()) return ['OK de novo para remover', 'confirm'];
  if (item.status === 'installing') return ['Instalando…', 'busy'];
  if (item.status === 'removing') return ['Removendo…', 'busy'];
  if (item.status === 'error') return ['Erro — OK para tentar de novo', 'err'];
  if (item.installed) return ['Instalado ✓', 'ok'];
  return [item.type === 'flatpak' ? 'Instalar (nativo)' : 'Instalar', ''];
}

function renderStore() {
  storeGrid.innerHTML = '';
  catalog.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'store-item';
    const art = document.createElement('div');
    art.className = 'tile-art';
    paintArt(art, item);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${item.category} · ${item.subtitle || ''}`;
    const [text, cls] = badgeFor(item);
    const badge = document.createElement('span');
    badge.className = `badge ${cls}`;
    badge.textContent = text;
    el.append(art, name, meta, badge);
    el.addEventListener('mouseenter', () => { storeIndex = i; updateStore(); });
    el.addEventListener('click', () => { storeIndex = i; storeAction(); });
    storeGrid.append(el);
  });
  updateStore();
}

function updateStore() {
  storeIndex = Math.max(0, Math.min(storeIndex, catalog.length - 1));
  storeGrid.querySelectorAll('.store-item').forEach((el, i) => el.classList.toggle('focused', i === storeIndex));
  keepRowVisible(document.getElementById('store-wrap'), storeGrid, storeIndex, STORE_COLS, storeRows);
}

async function openStore() {
  catalog = await window.tv.catalog();
  zone = 'store';
  storeEl.hidden = false;
  renderStore();
}

function closeStore() {
  storeEl.hidden = true;
  zone = 'grid';
  confirmRemove = null;
  update();
}

function storeAction() {
  const item = catalog[storeIndex];
  if (!item || item.status === 'installing' || item.status === 'removing') return;
  if (!item.installed) {
    window.tv.install(item.id);
    toast(`Instalando ${item.name}…`);
  } else if (confirmRemove?.id === item.id && confirmRemove.until > Date.now()) {
    confirmRemove = null;
    window.tv.uninstall(item.id);
    toast(`${item.name} removido`);
  } else {
    confirmRemove = { id: item.id, until: Date.now() + 3000 };
    renderStore();
    setTimeout(() => { if (zone === 'store') renderStore(); }, 3100);
  }
}

// ---------- Configurações (Wi-Fi) ----------

const settingsEl = document.getElementById('settings');
const wifiPass = document.getElementById('wifi-pass');
const wifiInput = document.getElementById('wifi-input');
const wifiMsg = document.getElementById('wifi-msg');
let wifi = [];       // [{ ssid, signal, secure, connected }], item 0 = "procurar"
let wifiIndex = 0;
let wifiTarget = null;

function signalBars(n) { return n > 75 ? '▂▄▆█' : n > 50 ? '▂▄▆' : n > 25 ? '▂▄' : '▂'; }

function renderWifi() {
  const box = document.getElementById('wifi-list');
  box.innerHTML = '';
  const items = [{ label: '↻ Procurar redes' }, ...wifi.map((n) => ({
    label: `${n.connected ? '✓ ' : ''}${n.ssid}`, sig: `${n.secure ? '🔒 ' : ''}${signalBars(n.signal)}`,
  }))];
  wifiIndex = Math.max(0, Math.min(wifiIndex, items.length - 1));
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = `wifi${i === wifiIndex ? ' focused' : ''}`;
    const name = document.createElement('span');
    name.textContent = item.label;
    const sig = document.createElement('span');
    sig.className = 'sig';
    sig.textContent = item.sig || '';
    row.append(name, sig);
    box.append(row);
  });
  box.children[wifiIndex]?.scrollIntoView({ block: 'nearest' });
}

async function scanWifi() {
  wifiMsg.textContent = 'Procurando redes…';
  const result = await window.tv.wifiList();
  if (result.error) {
    wifi = [];
    wifiMsg.textContent = 'Wi-Fi indisponível neste aparelho (use cabo de rede).';
  } else {
    wifi = result;
    wifiMsg.textContent = wifi.length ? '' : 'Nenhuma rede encontrada.';
  }
  renderWifi();
}

async function connectTo(net, password) {
  wifiMsg.textContent = `Conectando em ${net.ssid}…`;
  const res = await window.tv.wifiConnect(net.ssid, password);
  wifiMsg.textContent = res.ok ? `Conectado em ${net.ssid}` : `Não conectou: ${res.error}`;
  if (res.ok) { renderInfo(); scanWifi(); }
}

async function renderInfo() {
  const info = await window.tv.info();
  const rows = [
    `Nome: ${info.deviceName}`,
    ...(info.addresses.length ? info.addresses : ['Sem rede']),
    `Controle pelo iPhone: ${info.remoteUrl || '—'}`,
    `AirPlay: ${info.airplay ? 'ativo' : 'não instalado'}`,
    `Spotify Connect: ${info.spotifyConnect ? 'ativo' : 'não instalado'}`,
    `Versão ${info.version}${info.live ? ' · rodando do pendrive' : ''}`,
  ];
  const ul = document.getElementById('sys-info');
  ul.innerHTML = '';
  for (const text of rows) {
    const li = document.createElement('li');
    li.textContent = text;
    ul.append(li);
  }
}

function openSettings() {
  zone = 'settings';
  settingsEl.hidden = false;
  wifiPass.hidden = true;
  wifiIndex = 0;
  renderWifi();
  renderInfo();
  scanWifi();
}

function closeSettings() {
  settingsEl.hidden = true;
  wifiTarget = null;
  zone = 'grid';
  update();
}

function settingsKey(e) {
  const key = e.key;
  if (wifiTarget) {
    // Digitando a senha: só Enter e Esc são nossos, o resto vai para o campo.
    if (key === 'Enter') {
      const net = wifiTarget;
      wifiTarget = null;
      wifiPass.hidden = true;
      connectTo(net, wifiInput.value);
      wifiInput.value = '';
    } else if (key === 'Escape') {
      wifiTarget = null;
      wifiPass.hidden = true;
      wifiInput.value = '';
    } else return;
    e.preventDefault();
    return;
  }
  if (key === 'ArrowUp') wifiIndex -= 1;
  else if (key === 'ArrowDown') wifiIndex += 1;
  else if (key === 'Enter' || key === ' ') {
    if (wifiIndex === 0) return scanWifi();
    const net = wifi[wifiIndex - 1];
    if (!net || net.connected) return;
    if (net.secure) {
      wifiTarget = net;
      document.getElementById('wifi-ssid').textContent = net.ssid;
      wifiPass.hidden = false;
      wifiInput.focus();
    } else connectTo(net, '');
  } else if (['Escape', 'Backspace', 'BrowserBack'].includes(key)) return closeSettings();
  else return;
  e.preventDefault();
  renderWifi();
}

// ---------- Teclado / controle ----------

function closeOverlay() { overlay.hidden = true; }

document.addEventListener('keydown', (e) => {
  if (appOpen) return;
  const key = e.key;
  const isBack = ['Escape', 'Backspace', 'BrowserBack'].includes(key);
  const isOk = key === 'Enter' || key === ' ';

  if (zone === 'settings') return settingsKey(e);
  if (!overlay.hidden) {
    if (isOk || isBack) closeOverlay();
  } else if (zone === 'store') {
    if (key === 'ArrowLeft') storeIndex -= 1;
    else if (key === 'ArrowRight') storeIndex += 1;
    else if (key === 'ArrowDown') storeIndex = Math.min(catalog.length - 1, storeIndex + STORE_COLS);
    else if (key === 'ArrowUp') storeIndex = Math.max(0, storeIndex - STORE_COLS);
    else if (isOk) storeAction();
    else if (isBack) return closeStore();
    else return;
    updateStore();
  } else if (zone === 'power') {
    const power = visiblePower();
    if (key === 'ArrowLeft') powerIndex = Math.max(0, powerIndex - 1);
    else if (key === 'ArrowRight') powerIndex = Math.min(power.length - 1, powerIndex + 1);
    else if (key === 'ArrowDown' || isBack) zone = 'grid';
    else if (isOk) window.tv.power(power[powerIndex].dataset.action);
    else return;
    update();
  } else {
    if (key === 'ArrowLeft') index -= 1;
    else if (key === 'ArrowRight') index += 1;
    else if (key === 'ArrowDown') index = Math.min(apps.length - 1, index + COLS);
    else if (key === 'ArrowUp') { if (index < COLS) zone = 'power'; else index -= COLS; }
    else if (isOk) return open();
    else return;
    update();
  }
  e.preventDefault();
  document.body.classList.remove('mouse');
});

powerButtons.forEach((b) => {
  b.addEventListener('mouseenter', () => { zone = 'power'; powerIndex = visiblePower().indexOf(b); update(); });
  b.addEventListener('click', () => window.tv.power(b.dataset.action));
});

document.addEventListener('mousemove', () => document.body.classList.add('mouse'));
overlay.addEventListener('click', closeOverlay);

// ---------- Eventos do sistema ----------

window.tv.onAppState((state) => {
  appOpen = Boolean(state.current);
  playing = state.background || [];
  update();
});

window.tv.onAppsChanged(async () => {
  await reloadApps();
  if (zone === 'store') {
    catalog = await window.tv.catalog();
    renderStore();
  }
});

window.tv.onShowStore(openStore);
window.tv.onShowSettings(openSettings);

window.tv.onShowAirPlay((info) => {
  document.getElementById('airplay-name').textContent = info.deviceName;
  document.getElementById('airplay-off').hidden = info.airplay;
  overlay.hidden = false;
});

window.tv.onRemoteBack(() => {
  if (!overlay.hidden) closeOverlay();
  else if (zone === 'settings') { if (!wifiTarget) closeSettings(); }
  else if (zone === 'store') closeStore();
  else if (zone === 'power') { zone = 'grid'; update(); }
});

window.tv.info().then((info) => {
  if (info.remoteUrl) {
    document.getElementById('remote-hint').textContent = `Controle pelo iPhone: ${info.remoteUrl}`;
  }
  document.querySelector('[data-action="windows"]').hidden = !info.windows;
});

function tick() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
setInterval(tick, 10000);
tick();

reloadApps();
