const test = require('node:test');
const assert = require('node:assert');
const { startRemoteServer } = require('../src/remote-server');

test('controle remoto: PIN e rotas', async (t) => {
  const calls = [];
  const { server } = startRemoteServer({
    port: 8798, pin: '1234',
    handlers: {
      get: { apps: () => [{ id: 'netflix' }] },
      post: { key: (b) => { calls.push(b); }, open: (b) => ({ ok: true, got: b.url }) },
    },
  });
  t.after(() => server.close());
  await new Promise((r) => setTimeout(r, 100));
  const base = 'http://127.0.0.1:8798';

  assert.strictEqual((await fetch(`${base}/0000/api/apps`)).status, 403);
  assert.strictEqual((await fetch(`${base}/1234`)).status, 200);
  assert.deepStrictEqual(await (await fetch(`${base}/1234/api/apps`)).json(), [{ id: 'netflix' }]);
  const key = await fetch(`${base}/1234/api/key`, { method: 'POST', body: JSON.stringify({ key: 'ok' }) });
  assert.strictEqual(key.status, 204);
  assert.deepStrictEqual(calls, [{ key: 'ok' }]);
  const open = await fetch(`${base}/1234/api/open`, { method: 'POST', body: JSON.stringify({ url: 'https://x' }) });
  assert.deepStrictEqual(await open.json(), { ok: true, got: 'https://x' });
  assert.strictEqual((await fetch(`${base}/1234/api/toString`, { method: 'POST' })).status, 404);
  assert.strictEqual((await fetch(`${base}/1234/api/nada`)).status, 404);
});
