// Receptor AirPlay (espelhamento de tela e áudio do iPhone/iPad/Mac) via UxPlay.
// O UxPlay fica escutando em segundo plano; quando o iPhone conecta, ele abre
// o vídeo em tela cheia por cima do launcher.

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

function startAirPlay({ name, args = [] }) {
  const bin = findBinary('uxplay');
  const state = { available: Boolean(bin), name, child: null, stopped: false };
  if (!bin) {
    console.warn('UxPlay não encontrado: AirPlay desativado (veja o README).');
    return state;
  }

  let delay = 1000;
  const run = () => {
    if (state.stopped) return;
    const startedAt = Date.now();
    state.child = spawn(bin, ['-n', name, '-nh', ...args], { stdio: 'inherit' });
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

function stopAirPlay(state) {
  if (!state) return;
  state.stopped = true;
  state.child?.kill();
}

module.exports = { startAirPlay, stopAirPlay };
