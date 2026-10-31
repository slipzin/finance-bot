// Serviços em segundo plano da TV (receptor AirPlay, Spotify Connect...).
// Cada um é um programa externo mantido vivo: se cair, é reiniciado.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function findBinary(name) {
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function startService({ label, bin, args = [] }) {
  const exe = findBinary(bin);
  const state = { label, available: Boolean(exe), child: null, stopped: false };
  if (!exe) {
    console.warn(`${label}: "${bin}" não encontrado, desativado (rode scripts/install-linux.sh).`);
    return state;
  }

  let delay = 1000;
  const run = () => {
    if (state.stopped) return;
    const startedAt = Date.now();
    state.child = spawn(exe, args, { stdio: 'inherit' });
    state.child.on('error', (err) => console.error(`${label}:`, err.message));
    state.child.on('exit', () => {
      state.child = null;
      // Reinicia se cair; espera mais se estiver caindo em sequência.
      delay = Date.now() - startedAt > 30000 ? 1000 : Math.min(delay * 2, 30000);
      setTimeout(run, delay);
    });
  };
  run();
  return state;
}

function stopService(state) {
  if (!state) return;
  state.stopped = true;
  state.child?.kill();
}

module.exports = { findBinary, startService, stopService };
