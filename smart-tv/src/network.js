// Wi-Fi pelo NetworkManager (nmcli): a TV não tem área de trabalho, então a
// conexão é feita pela tela de Configurações do launcher.

const { execFile } = require('child_process');
const os = require('os');

function nmcli(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile('nmcli', args, { timeout }, (err, stdout, stderr) =>
      (err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout)));
  });
}

// "nmcli -t" separa campos com ":" e escapa ":" dentro do valor como "\:".
function splitTerse(line) {
  const fields = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length) cur += line[++i];
    else if (line[i] === ':') { fields.push(cur); cur = ''; } else cur += line[i];
  }
  fields.push(cur);
  return fields;
}

function parseWifiList(stdout) {
  const best = new Map();
  for (const line of stdout.split('\n').filter(Boolean)) {
    const [inUse, ssid, signal, security] = splitTerse(line);
    if (!ssid) continue;
    const net = { ssid, signal: Number(signal) || 0, secure: Boolean(security && security !== '--'), connected: inUse === '*' };
    const prev = best.get(ssid);
    // Mesma rede em vários pontos de acesso: fica o de sinal mais forte.
    if (!prev || net.connected || (!prev.connected && net.signal > prev.signal)) best.set(ssid, net);
  }
  return [...best.values()].sort((a, b) => b.connected - a.connected || b.signal - a.signal);
}

async function listWifi() {
  const out = await nmcli(['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'yes']);
  return parseWifiList(out);
}

async function connectWifi(ssid, password) {
  const args = ['device', 'wifi', 'connect', ssid];
  if (password) args.push('password', password);
  try {
    await nmcli(args, 45000);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message.replace(/^Error:\s*/, '') };
  }
}

function addresses() {
  const list = [];
  for (const [name, nets] of Object.entries(os.networkInterfaces())) {
    for (const net of nets || []) if (net.family === 'IPv4' && !net.internal) list.push(`${name}: ${net.address}`);
  }
  return list;
}

module.exports = { listWifi, connectWifi, parseWifiList, addresses };
