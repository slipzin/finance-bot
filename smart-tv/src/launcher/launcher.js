const COLS = 5;
const grid = document.getElementById('grid');
const powerButtons = [...document.querySelectorAll('#power button')];
const recent = JSON.parse(localStorage.getItem('recent') || '[]');

let apps = [];
let index = Number(localStorage.getItem('lastIndex') || 0);
let zone = 'grid'; // 'grid' | 'power'
let powerIndex = 0;
let appOpen = false;
const overlay = document.getElementById('overlay');

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

function render() {
  grid.innerHTML = '';
  apps.forEach((app, i) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.index = i;
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
  grid.querySelectorAll('.tile').forEach((t, i) =>
    t.classList.toggle('focused', zone === 'grid' && i === index));
  powerButtons.forEach((b, i) => b.classList.toggle('focused', zone === 'power' && i === powerIndex));

  const app = apps[index];
  if (!app) return;
  document.documentElement.style.setProperty('--accent', app.accent || app.color);
  paintArt(document.getElementById('hero-icon'), app);
  document.getElementById('hero-title').textContent = app.name;
  document.getElementById('hero-subtitle').textContent = app.subtitle || '';
  const chips = document.getElementById('hero-chips');
  chips.innerHTML = '';
  const labels = [];
  if (recent.includes(app.id)) labels.push('Usado recentemente');
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
  appOpen = app.type !== 'airplay';
  const pos = recent.indexOf(app.id);
  if (pos >= 0) recent.splice(pos, 1);
  recent.unshift(app.id);
  localStorage.setItem('recent', JSON.stringify(recent.slice(0, 5)));
  localStorage.setItem('lastIndex', String(index));
  window.tv.launch(app.id);
}

function closeOverlay() { overlay.hidden = true; }

document.addEventListener('keydown', (e) => {
  if (appOpen) return;
  const key = e.key;
  if (!overlay.hidden) {
    if (['Enter', 'Escape', 'Backspace', ' '].includes(key)) closeOverlay();
    e.preventDefault();
    return;
  }
  if (zone === 'power') {
    if (key === 'ArrowLeft') powerIndex = Math.max(0, powerIndex - 1);
    else if (key === 'ArrowRight') powerIndex = Math.min(powerButtons.length - 1, powerIndex + 1);
    else if (key === 'ArrowDown' || key === 'Escape') zone = 'grid';
    else if (key === 'Enter' || key === ' ') window.tv.power(powerButtons[powerIndex].dataset.action);
    else return;
  } else {
    if (key === 'ArrowLeft') index -= 1;
    else if (key === 'ArrowRight') index += 1;
    else if (key === 'ArrowDown') index = Math.min(apps.length - 1, index + COLS);
    else if (key === 'ArrowUp') { if (index < COLS) zone = 'power'; else index -= COLS; }
    else if (key === 'Enter' || key === ' ') return open();
    else return;
  }
  e.preventDefault();
  document.body.classList.remove('mouse');
  update();
});

powerButtons.forEach((b, i) => {
  b.addEventListener('mouseenter', () => { zone = 'power'; powerIndex = i; update(); });
  b.addEventListener('click', () => window.tv.power(b.dataset.action));
});

document.addEventListener('mousemove', () => document.body.classList.add('mouse'));

window.tv.onAppState((state) => {
  appOpen = Boolean(state.current);
  const playing = state.background || [];
  grid.querySelectorAll('.tile').forEach((t, i) =>
    t.classList.toggle('playing', playing.includes(apps[i].id)));
  update();
});

window.tv.onShowAirPlay((info) => {
  document.getElementById('airplay-name').textContent = info.deviceName;
  document.getElementById('airplay-off').hidden = info.airplay;
  overlay.hidden = false;
});

window.tv.onRemoteBack(() => {
  if (!overlay.hidden) closeOverlay();
  else if (zone === 'power') { zone = 'grid'; update(); }
});

overlay.addEventListener('click', closeOverlay);

window.tv.info().then((info) => {
  if (info.remoteUrl) {
    document.getElementById('remote-hint').textContent = `Controle pelo iPhone: ${info.remoteUrl}`;
  }
});

function tick() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
setInterval(tick, 10000);
tick();

window.tv.apps().then((list) => { apps = list; render(); });
