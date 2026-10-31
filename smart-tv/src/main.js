// Smart TV - processo principal.
// - Apps web rodam em uma "WebContentsView" própria, em tela cheia, sem barra de
//   endereço/abas/menus, com sessão (login) separada e user-agent próprio.
//   O YouTube usa a interface oficial de TV (youtube.com/tv).
// - Apps nativos (Flatpak: Kodi, Plex, Steam...) abrem como programas de verdade.
// - Serviços: AirPlay (UxPlay), Spotify Connect (librespot), YouTube DIAL,
//   controle remoto/"Enviar para TV" pelo iPhone.

const {
  app, BrowserWindow, WebContentsView, ipcMain, session, components, globalShortcut,
} = require('electron');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { startRemoteServer } = require('./remote-server');
const { findBinary, startService, stopService } = require('./services');
const { startDial } = require('./dial');
const { Store } = require('./store');
const { resolveLink } = require('./links');
const network = require('./network');

const WINDOWED = process.argv.includes('--windowed');
const ROOT = path.join(__dirname, '..');
const REBOOT_WINDOWS = '/usr/local/sbin/smart-tv-reboot-windows';

// Navegação por setas em sites que não foram feitos para TV.
app.commandLine.appendSwitch('enable-spatial-navigation');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoDecodeLinuxGL');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps.json'), 'utf8'));
const settings = {
  deviceName: 'Smart TV', remotePort: 8765, dialPort: 56790, airplayArgs: [],
  spotifyConnect: true, spotifyArgs: [], ...config.settings,
};

// User-agent de Chrome "puro" (sem "Electron/..."), senão Netflix/Disney+ bloqueiam.
function desktopUA() {
  const os = process.platform === 'win32'
    ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
  const major = process.versions.chrome.split('.')[0];
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

// User-agent de Smart TV: faz o YouTube entregar a interface "leanback" de TV.
const TV_UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36';

function userAgentFor(appDef) {
  if (!appDef.userAgent || appDef.userAgent === 'desktop') return desktopUA();
  if (appDef.userAgent === 'tv') return TV_UA;
  return appDef.userAgent;
}

// Arquivo em userData criado uma vez (PIN do controle, id DIAL...).
function persistent(name, create) {
  const file = path.join(app.getPath('userData'), name);
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const value = create();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  return value;
}

let win = null;
let store = null;
const running = new Map(); // id -> WebContentsView (apps web)
let native = null;         // { id, ref, proc } app nativo aberto
let current = null;        // id do app em primeiro plano
const services = {};
let remoteUrl = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function notifyState() {
  send('app-state', { current, background: [...running.keys()].filter((id) => id !== current) });
}

function createLauncher() {
  win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: !WINDOWED,
    kiosk: !WINDOWED,
    frame: WINDOWED,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'Smart TV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'launcher', 'index.html'));
  win.on('resize', layout);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F5') win.webContents.reload();
  });
}

function layout() {
  if (!win || !current || !running.has(current)) return;
  const [width, height] = win.getContentSize();
  running.get(current).setBounds({ x: 0, y: 0, width, height });
}

function isHomeKey(input) {
  return ['Home', 'BrowserHome', 'Meta', 'ContextMenu'].includes(input.key) ||
    (input.control && input.key.toLowerCase() === 'h');
}

function isBackKey(input) {
  return ['Escape', 'BrowserBack', 'GoBack'].includes(input.key);
}

function goBack(wc) {
  if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else goHome();
}

// ---------- Abrir apps ----------

function launch(id, url) {
  const appDef = store.get(id);
  if (!appDef) return;
  if (appDef.type === 'airplay') return send('show-airplay', systemInfo());
  if (appDef.type === 'store') return send('show-store');
  if (appDef.type === 'settings') return send('show-settings');
  if (current && current !== id) goHome();
  if (appDef.type === 'flatpak') return launchNative(appDef);
  launchWeb(appDef, url);
}

function launchWeb(appDef, url) {
  const { id } = appDef;
  let view = running.get(id);
  if (view) {
    if (url) view.webContents.loadURL(url);
  } else {
    const ses = session.fromPartition(`persist:${id}`); // login separado por app
    ses.setUserAgent(userAgentFor(appDef));
    view = new WebContentsView({
      webPreferences: { session: ses, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    view.setBackgroundColor('#000000');
    const wc = view.webContents;
    wc.setUserAgent(userAgentFor(appDef));

    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (isHomeKey(input)) {
        event.preventDefault();
        goHome();
      } else if (isBackKey(input) && !appDef.tvUi) {
        // Apps de TV (YouTube) tratam o Voltar sozinhos.
        event.preventDefault();
        goBack(wc);
      }
    });

    // Popups (login Google/Apple etc.) abrem em janela cheia sem barra.
    wc.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: win, fullscreen: !WINDOWED, autoHideMenuBar: true, backgroundColor: '#000000',
        webPreferences: { session: ses },
      },
    }));

    // Se o app travar, volta para o início.
    wc.on('render-process-gone', () => { closeWeb(id); notifyState(); });

    wc.loadURL(url || appDef.url);
    running.set(id, view);
  }

  current = id;
  win.contentView.addChildView(view);
  layout();
  view.webContents.focus();
  notifyState();
}

function closeWeb(id) {
  const view = running.get(id);
  if (!view) return;
  win.contentView.removeChildView(view);
  view.webContents.close();
  running.delete(id);
  if (current === id) current = null;
}

// Apps nativos: o gerenciador de janelas mostra a janela deles por cima do launcher.
function launchNative(appDef) {
  const proc = spawn('flatpak', ['run', appDef.flatpak, ...(appDef.args || [])], { stdio: 'ignore' });
  native = { id: appDef.id, ref: appDef.flatpak, proc };
  current = appDef.id;
  // Home funciona mesmo com o app nativo em foco (atalho global do X11).
  for (const key of ['Home', 'BrowserHome']) globalShortcut.register(key, goHome);
  notifyState();

  const finished = () => {
    if (native?.proc !== proc) return;
    native = null;
    globalShortcut.unregisterAll();
    if (current === appDef.id) current = null;
    win.focus();
    win.webContents.focus();
    notifyState();
  };
  proc.on('exit', finished);
  proc.on('error', (err) => {
    console.error(`Falha ao abrir ${appDef.name}:`, err.message);
    finished();
  });
}

function goHome() {
  if (!current) return;
  const id = current;
  const appDef = store.get(id);
  if (native?.id === id) {
    execFile('flatpak', ['kill', native.ref], () => {});
    native.proc.kill('SIGTERM');
    return; // o evento "exit" volta para o início
  }
  if (appDef?.background) {
    // Apps de música continuam tocando em segundo plano.
    win.contentView.removeChildView(running.get(id));
    current = null;
  } else {
    closeWeb(id);
  }
  win.webContents.focus();
  notifyState();
}

// "Enviar para TV": abre o link compartilhado no app certo (instala se for app web).
function openLink(raw) {
  const target = resolveLink(raw, store.all());
  if (!target) return { ok: false };
  const appDef = store.get(target.appId);
  if (appDef.type === 'web' && !store.isInstalled(appDef.id) && appDef.id !== 'browser') {
    store.install(appDef.id);
  }
  launch(appDef.id, target.url);
  return { ok: true, app: appDef.name };
}

// ---------- Controle remoto (iPhone) ----------

const ELECTRON_KEYS = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', ok: 'Enter', escape: 'Escape',
  playpause: 'MediaPlayPause', backspace: 'Backspace',
};
const X11_KEYS = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', ok: 'Return', back: 'Escape',
  playpause: 'XF86AudioPlay', backspace: 'BackSpace',
};

function remoteKey(key) {
  if (key === 'home') return goHome();
  if (native) {
    // Apps nativos recebem as teclas como se viessem do teclado.
    if (X11_KEYS[key]) execFile('xdotool', ['key', X11_KEYS[key]], () => {});
    return;
  }
  const appDef = current ? store.get(current) : null;
  const wc = current ? running.get(current).webContents : win.webContents;
  if (key === 'back') {
    if (!appDef) return send('remote-back');
    if (!appDef.tvUi) return goBack(wc);
    key = 'escape';
  }
  const keyCode = ELECTRON_KEYS[key];
  if (!keyCode) return;
  wc.sendInputEvent({ type: 'keyDown', keyCode });
  if (keyCode === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' });
  wc.sendInputEvent({ type: 'keyUp', keyCode });
}

function remoteText(text) {
  if (native) return execFile('xdotool', ['type', '--delay', '30', '--', text], () => {});
  const wc = current ? running.get(current).webContents : win.webContents;
  wc.insertText(text);
}

function setVolume(action) {
  if (process.platform !== 'linux') return;
  const args = {
    up: ['set-sink-volume', '@DEFAULT_SINK@', '+5%'],
    down: ['set-sink-volume', '@DEFAULT_SINK@', '-5%'],
    mute: ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'],
  }[action];
  if (args) execFile('pactl', args, () => {});
}

// ---------- Sistema ----------

function systemInfo() {
  return {
    deviceName: settings.deviceName,
    remoteUrl,
    airplay: Boolean(services.airplay?.available),
    spotifyConnect: Boolean(services.spotify?.available),
    windows: process.platform === 'linux' && fs.existsSync(REBOOT_WINDOWS),
  };
}

function iconUrl(appDef) {
  return appDef.icon && fs.existsSync(path.join(ROOT, 'icons', appDef.icon)) ? `../../icons/${appDef.icon}` : null;
}

const forUi = (a) => ({ ...a, icon: iconUrl(a) });
const forRemote = ({ id, name, color, fg, glyph, category, subtitle, type, system, installed, status }) =>
  ({ id, name, color, fg, glyph, category, subtitle, type, system, installed, status });

function uninstall(id) {
  if (current === id) goHome();
  if (running.has(id)) closeWeb(id);
  store.uninstall(id);
}

ipcMain.handle('system:info', () => ({
  ...systemInfo(), version: app.getVersion(), addresses: network.addresses(), live: fs.existsSync('/run/live/medium'),
}));
ipcMain.handle('wifi:list', () => network.listWifi().catch((err) => ({ error: err.message })));
ipcMain.handle('wifi:connect', (_e, { ssid, password }) => network.connectWifi(String(ssid), password ? String(password) : ''));
ipcMain.handle('apps:list', () => store.installed().map(forUi));
ipcMain.handle('store:list', () => store.listing().map(forUi));
ipcMain.on('apps:launch', (_e, id) => launch(id));
ipcMain.on('store:install', (_e, id) => store.install(id));
ipcMain.on('store:uninstall', (_e, id) => uninstall(id));

ipcMain.on('system:power', (_e, action) => {
  if (action === 'quit') return app.quit();
  if (action === 'windows') return execFile('sudo', ['-n', REBOOT_WINDOWS], () => {});
  const cmds = process.platform === 'win32'
    ? { shutdown: ['shutdown', ['/s', '/t', '0']], reboot: ['shutdown', ['/r', '/t', '0']] }
    : { shutdown: ['systemctl', ['poweroff']], reboot: ['systemctl', ['reboot']] };
  const cmd = cmds[action];
  if (cmd) execFile(cmd[0], cmd[1], () => {});
});

function startBackgroundServices() {
  const userData = app.getPath('userData');

  services.airplay = startService({
    label: 'AirPlay', bin: 'uxplay', args: ['-n', settings.deviceName, '-nh', ...settings.airplayArgs],
  });

  if (settings.spotifyConnect) {
    services.spotify = startService({
      label: 'Spotify Connect',
      bin: 'librespot',
      args: ['--name', settings.deviceName, '--device-type', 'tv', '--cache', path.join(userData, 'librespot'),
        ...settings.spotifyArgs],
    });
  }

  // YouTube no botão de transmitir do celular.
  startDial({
    name: settings.deviceName,
    port: settings.dialPort,
    uuid: persistent('dial-uuid.txt', () => crypto.randomUUID()),
    apps: {
      YouTube: {
        isRunning: () => running.has('youtube'),
        launch: (params) => launch('youtube', `https://www.youtube.com/tv${params ? `?${params}` : ''}`),
        stop: () => {
          if (current === 'youtube') goHome();
          closeWeb('youtube');
        },
      },
    },
  });

  remoteUrl = startRemoteServer({
    port: settings.remotePort,
    pin: persistent('remote-pin.txt', () => String(crypto.randomInt(1000, 10000))),
    handlers: {
      get: {
        apps: () => store.installed().map(forRemote),
        catalog: () => store.listing().map(forRemote),
        info: () => systemInfo(),
      },
      post: {
        key: ({ key }) => { if (typeof key === 'string') remoteKey(key); },
        text: ({ text }) => { if (typeof text === 'string') remoteText(text.slice(0, 500)); },
        launch: ({ id }) => { if (typeof id === 'string') launch(id); },
        volume: ({ action }) => { if (typeof action === 'string') setVolume(action); },
        open: ({ url, text }) => openLink(String(url || text || '')),
        install: ({ id }) => { if (typeof id === 'string') store.install(id); },
        uninstall: ({ id }) => { if (typeof id === 'string') uninstall(id); },
        custom: ({ name, url }) => {
          const added = typeof url === 'string' ? store.addCustom({ name: String(name || ''), url }) : null;
          return { ok: Boolean(added) };
        },
      },
    },
  }).url;
  console.log('Controle remoto no iPhone:', remoteUrl);
}

app.whenReady().then(() => {
  store = new Store({
    catalog: config.catalog,
    file: path.join(app.getPath('userData'), 'installed.json'),
    onChange: () => send('apps-changed'),
  });
  if (process.platform === 'linux' && !findBinary('xdotool')) {
    console.warn('xdotool não encontrado: o controle do iPhone não funciona dentro de apps nativos.');
  }

  // A tela abre primeiro: no pendrive, o primeiro boot pode estar sem internet.
  createLauncher();
  startBackgroundServices();

  // Electron da castLabs: baixa/ativa o Widevine (DRM) de Netflix, Disney+, Prime etc.
  // em segundo plano; os apps com DRM passam a tocar assim que ele fica pronto.
  if (components) {
    components.whenReady()
      .then(() => console.log('Widevine pronto:', components.status()))
      .catch((err) => console.error('Widevine indisponível, apps com DRM não vão reproduzir:', err));
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  Object.values(services).forEach(stopService);
});
app.on('window-all-closed', () => app.quit());
