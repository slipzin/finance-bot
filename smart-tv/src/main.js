// Smart TV - processo principal.
// Cada app roda em uma "WebContentsView" própria, em tela cheia, sem barra de
// endereço, abas ou menus, com sessão (login) separada e user-agent próprio.
// O YouTube usa a interface oficial de TV (youtube.com/tv), igual às Smart TVs.

const { app, BrowserWindow, WebContentsView, ipcMain, session, components } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { startRemoteServer } = require('./remote-server');
const { startAirPlay, stopAirPlay } = require('./airplay');

const WINDOWED = process.argv.includes('--windowed');
const ROOT = path.join(__dirname, '..');

// Navegação por setas em sites que não foram feitos para TV.
app.commandLine.appendSwitch('enable-spatial-navigation');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoDecodeLinuxGL');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps.json'), 'utf8'));
const settings = { deviceName: 'Smart TV', remotePort: 8765, airplayArgs: [], ...config.settings };

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

let win = null;
const running = new Map(); // id -> WebContentsView
let current = null;        // id do app em primeiro plano
let airplay = null;
let remoteUrl = null;

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
    // Botão Voltar no início não faz nada (como numa TV), F5 recarrega o launcher.
    if (input.type === 'keyDown' && input.key === 'F5') win.webContents.reload();
  });
}

function layout() {
  if (!win || !current) return;
  const [width, height] = win.getContentSize();
  running.get(current)?.setBounds({ x: 0, y: 0, width, height });
}

function isHomeKey(input) {
  return ['Home', 'BrowserHome', 'Meta', 'ContextMenu'].includes(input.key) ||
    (input.control && input.key.toLowerCase() === 'h');
}

function isBackKey(input) {
  return ['Escape', 'BrowserBack', 'GoBack'].includes(input.key);
}

function goBack(appDef, wc) {
  if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else goHome();
}

function launch(id) {
  const appDef = config.apps.find((a) => a.id === id);
  if (!appDef) return;
  if (appDef.type === 'airplay') {
    // Não é uma janela: mostra no launcher como espelhar a tela do iPhone.
    win.webContents.send('show-airplay', systemInfo());
    return;
  }
  // Abrir outro app pelo controle do iPhone enquanto um já está aberto.
  if (current && current !== id) goHome();

  let view = running.get(id);
  if (!view) {
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
        goBack(appDef, wc);
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

    // Se o app fechar (ou travar), volta para o início.
    wc.on('render-process-gone', () => closeApp(id));

    wc.loadURL(appDef.url);
    running.set(id, view);
  }

  current = id;
  win.contentView.addChildView(view);
  layout();
  view.webContents.focus();
  win.webContents.send('app-state', { current });
}

function closeApp(id) {
  const view = running.get(id);
  if (!view) return;
  win.contentView.removeChildView(view);
  view.webContents.close();
  running.delete(id);
  if (current === id) current = null;
}

function goHome() {
  if (!current) return;
  const id = current;
  const appDef = config.apps.find((a) => a.id === id);
  if (appDef?.background) {
    // Apps de música continuam tocando em segundo plano.
    win.contentView.removeChildView(running.get(id));
    current = null;
  } else {
    closeApp(id);
  }
  win.webContents.focus();
  win.webContents.send('app-state', { current: null, background: [...running.keys()] });
}

function systemInfo() {
  return { deviceName: settings.deviceName, remoteUrl, airplay: Boolean(airplay?.available) };
}

// Teclas vindas do controle remoto do iPhone.
const REMOTE_KEYS = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', ok: 'Enter',
  playpause: 'MediaPlayPause', backspace: 'Backspace',
};

function remoteKey(key) {
  const appDef = config.apps.find((a) => a.id === current);
  const wc = current ? running.get(current).webContents : win.webContents;
  if (key === 'home') return goHome();
  if (key === 'back') {
    if (!appDef) return win.webContents.send('remote-back');
    if (!appDef.tvUi) return goBack(appDef, wc);
    key = 'escape';
  }
  const keyCode = REMOTE_KEYS[key] || (key === 'escape' ? 'Escape' : null);
  if (!keyCode) return;
  wc.sendInputEvent({ type: 'keyDown', keyCode });
  if (keyCode === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' });
  wc.sendInputEvent({ type: 'keyUp', keyCode });
}

function remoteText(text) {
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

// PIN do controle remoto: gerado uma vez e guardado, para o atalho no iPhone continuar valendo.
function remotePin() {
  const file = path.join(app.getPath('userData'), 'remote-pin.txt');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const pin = String(crypto.randomInt(1000, 10000));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pin);
  return pin;
}

ipcMain.handle('system:info', () => systemInfo());

ipcMain.handle('apps:list', () =>
  config.apps.map((a) => ({
    ...a,
    icon: a.icon && fs.existsSync(path.join(ROOT, 'icons', a.icon))
      ? `../../icons/${a.icon}` : null,
  })));

ipcMain.on('apps:launch', (_e, id) => launch(id));

ipcMain.on('system:power', (_e, action) => {
  if (action === 'quit') return app.quit();
  const cmds = process.platform === 'win32'
    ? { shutdown: ['shutdown', ['/s', '/t', '0']], reboot: ['shutdown', ['/r', '/t', '0']] }
    : { shutdown: ['systemctl', ['poweroff']], reboot: ['systemctl', ['reboot']] };
  const cmd = cmds[action];
  if (cmd) execFile(cmd[0], cmd[1]);
});

app.whenReady().then(async () => {
  // Electron da castLabs: baixa/ativa o Widevine (DRM) usado por Netflix, Disney+, Prime etc.
  if (components) {
    try {
      await components.whenReady();
      console.log('Widevine pronto:', components.status());
    } catch (err) {
      console.error('Widevine indisponível, apps com DRM não vão reproduzir:', err);
    }
  }
  createLauncher();

  airplay = startAirPlay({ name: settings.deviceName, args: settings.airplayArgs });
  remoteUrl = startRemoteServer({
    port: settings.remotePort,
    pin: remotePin(),
    handlers: {
      key: remoteKey,
      text: remoteText,
      launch,
      volume: setVolume,
      apps: () => config.apps.map(({ id, name, color, fg, glyph }) => ({ id, name, color, fg, glyph })),
    },
  }).url;
  console.log('Controle remoto no iPhone:', remoteUrl);
});

app.on('will-quit', () => stopAirPlay(airplay));
app.on('window-all-closed', () => app.quit());
