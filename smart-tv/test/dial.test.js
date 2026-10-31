const test = require('node:test');
const assert = require('node:assert');
const dgram = require('dgram');
const { startDial } = require('../src/dial');

test('DIAL: SSDP, descrição e app YouTube', async (t) => {
  let running = false;
  let launched = null;
  const { server, socket } = startDial({
    name: 'Smart TV', port: 56799, uuid: 'test-uuid',
    apps: { YouTube: { isRunning: () => running, launch: (p) => { launched = p; running = true; }, stop: () => { running = false; } } },
  });
  t.after(() => { server.close(); socket.close(); });
  await new Promise((r) => setTimeout(r, 200));

  // Busca SSDP como o app do YouTube faz.
  const client = dgram.createSocket('udp4');
  const reply = await new Promise((resolve, reject) => {
    client.on('message', (m) => resolve(m.toString()));
    client.send(['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 1',
      'ST: urn:dial-multiscreen-org:service:dial:1', '', ''].join('\r\n'), 1900, '127.0.0.1');
    setTimeout(() => reject(new Error('sem resposta SSDP')), 2000);
  });
  client.close();
  assert.match(reply, /LOCATION: http:\/\/.+:56799\/dd\.xml/);
  assert.match(reply, /USN: uuid:test-uuid/);

  const dd = await fetch('http://127.0.0.1:56799/dd.xml');
  assert.match(dd.headers.get('application-url'), /:56799\/apps\/$/);
  assert.match(await dd.text(), /<friendlyName>Smart TV<\/friendlyName>/);

  assert.match(await (await fetch('http://127.0.0.1:56799/apps/YouTube')).text(), /<state>stopped<\/state>/);
  const post = await fetch('http://127.0.0.1:56799/apps/YouTube', { method: 'POST', body: 'pairingCode=abc&v=xyz' });
  assert.strictEqual(post.status, 201);
  assert.match(post.headers.get('location'), /\/apps\/YouTube\/run$/);
  assert.strictEqual(launched, 'pairingCode=abc&v=xyz');
  assert.match(await (await fetch('http://127.0.0.1:56799/apps/YouTube')).text(), /<state>running<\/state>/);
  assert.strictEqual((await fetch('http://127.0.0.1:56799/apps/YouTube/run', { method: 'DELETE' })).status, 200);
  assert.strictEqual(running, false);
  assert.strictEqual((await fetch('http://127.0.0.1:56799/apps/Netflix')).status, 404);
});
