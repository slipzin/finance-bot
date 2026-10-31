// Loja de aplicativos: controla o que está instalado na TV.
// - Apps web: instalar = colocar o bloco na tela inicial (login fica salvo por app).
// - Apps nativos: instalados/removidos de verdade pelo Flatpak (Flathub), por usuário, sem senha.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findBinary } = require('./services');

const COLORS = ['#e8453c', '#f9a825', '#43a047', '#1e88e5', '#8e24aa', '#00897b', '#6d4c41', '#546e7a'];

class Store {
  constructor({ catalog, file, onChange }) {
    this.catalog = catalog;
    this.file = file;
    this.onChange = onChange;
    this.status = {}; // id -> 'installing' | 'removing' | 'error'
    this.flatpak = process.platform === 'linux' && Boolean(findBinary('flatpak'));
    try {
      this.state = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.state = { installed: catalog.filter((a) => a.default).map((a) => a.id), custom: [] };
      this.save();
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  all() {
    return [...this.catalog, ...this.state.custom];
  }

  get(id) {
    return this.all().find((a) => a.id === id);
  }

  isInstalled(id) {
    return this.state.installed.includes(id);
  }

  // Apps da tela inicial, na ordem em que foram instalados (sistema sempre no fim).
  installed() {
    const apps = this.state.installed.map((id) => this.get(id)).filter(Boolean);
    return [...apps.filter((a) => !a.system), ...apps.filter((a) => a.system)];
  }

  // Catálogo da loja com o estado de cada app.
  listing() {
    return this.all()
      .filter((a) => !a.system && (a.type !== 'flatpak' || this.flatpak))
      .map((a) => ({ ...a, installed: this.isInstalled(a.id), status: this.status[a.id] || null }));
  }

  setStatus(id, status) {
    if (status) this.status[id] = status;
    else delete this.status[id];
    this.onChange();
  }

  markInstalled(id, installed) {
    this.state.installed = this.state.installed.filter((x) => x !== id);
    if (installed) {
      // Novos apps entram antes dos blocos de sistema.
      this.state.installed.push(id);
    }
    this.save();
  }

  flatpakCmd(args) {
    return new Promise((resolve, reject) => {
      execFile('flatpak', [...args, '-y', '--noninteractive', '--user'], { maxBuffer: 1 << 24 },
        (err, _out, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()));
    });
  }

  async install(id) {
    const app = this.get(id);
    if (!app || this.isInstalled(id) || this.status[id]) return;
    if (app.type === 'flatpak') {
      if (!this.flatpak) return;
      this.setStatus(id, 'installing');
      try {
        await this.flatpakCmd(['install', 'flathub', app.flatpak]);
      } catch (err) {
        console.error(`Falha ao instalar ${app.name}:`, err.message);
        return this.setStatus(id, 'error');
      }
    }
    this.markInstalled(id, true);
    this.setStatus(id, null);
  }

  async uninstall(id) {
    const app = this.get(id);
    if (!app || app.system || !this.isInstalled(id) || this.status[id]) return;
    if (app.type === 'flatpak' && this.flatpak) {
      this.setStatus(id, 'removing');
      try {
        await this.flatpakCmd(['uninstall', app.flatpak]);
      } catch (err) {
        console.error(`Falha ao remover ${app.name}:`, err.message);
      }
    }
    this.markInstalled(id, false);
    if (id.startsWith('custom-')) this.state.custom = this.state.custom.filter((a) => a.id !== id);
    this.save();
    this.setStatus(id, null);
  }

  // Site qualquer adicionado pelo controle do iPhone.
  addCustom({ name, url }) {
    let parsed;
    try { parsed = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`); } catch { return null; }
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const label = (name || parsed.hostname.replace(/^www\./, '')).trim().slice(0, 30);
    const id = `custom-${Date.now().toString(36)}`;
    const color = COLORS[this.state.custom.length % COLORS.length];
    const app = {
      id, type: 'web', userAgent: 'desktop', name: label, subtitle: parsed.hostname, category: 'Meus sites',
      url: parsed.href, domains: [parsed.hostname.replace(/^www\./, '')], color, fg: '#ffffff', accent: color,
      glyph: label.slice(0, 2).toUpperCase(),
    };
    this.state.custom.push(app);
    this.markInstalled(id, true);
    this.onChange();
    return app;
  }
}

module.exports = { Store };
