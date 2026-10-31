const test = require('node:test');
const assert = require('node:assert');
const { parseWifiList } = require('../src/network');

test('lê a lista do nmcli (com ":" escapado e redes repetidas)', () => {
  const out = [
    ' :Casa 5G:70:WPA2',
    '*:Casa:82:WPA2',
    ' :Casa 5G:91:WPA2',
    ' :Cafe\\: Livre:40:',
    ' ::20:WPA2',
  ].join('\n');
  assert.deepStrictEqual(parseWifiList(out), [
    { ssid: 'Casa', signal: 82, secure: true, connected: true },
    { ssid: 'Casa 5G', signal: 91, secure: true, connected: false },
    { ssid: 'Cafe: Livre', signal: 40, secure: false, connected: false },
  ]);
});
