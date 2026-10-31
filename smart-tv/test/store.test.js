const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { catalog } = require('../apps.json');

function makeStore() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tv-')), 'sub', 'installed.json');
  let changes = 0;
  const store = new Store({ catalog, file, onChange: () => { changes += 1; } });
  return { store, file, changes: () => changes };
}

test('vem com os apps padrão, sistema no fim', () => {
  const { store } = makeStore();
  const ids = store.installed().map((a) => a.id);
  assert.deepStrictEqual(ids.slice(-2), ['airplay', 'store']);
  assert.ok(ids.includes('netflix') && !ids.includes('hbomax'));
});

test('instala e remove app web e persiste', async () => {
  const { store, file, changes } = makeStore();
  await store.install('hbomax');
  assert.ok(store.isInstalled('hbomax'));
  assert.strictEqual(store.installed().at(-3).id, 'hbomax');
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).installed.includes('hbomax'));
  await store.uninstall('hbomax');
  assert.ok(!store.isInstalled('hbomax'));
  assert.ok(changes() >= 2);
});

test('não remove apps de sistema', async () => {
  const { store } = makeStore();
  await store.uninstall('store');
  assert.ok(store.isInstalled('store'));
});

test('site personalizado', async () => {
  const { store } = makeStore();
  const app = store.addCustom({ name: '', url: 'www.exemplo.com.br/tv' });
  assert.strictEqual(app.name, 'exemplo.com.br');
  assert.ok(store.isInstalled(app.id));
  assert.strictEqual(store.addCustom({ url: 'javascript:alert(1)' }), null);
  await store.uninstall(app.id);
  assert.ok(!store.get(app.id));
});

test('apps nativos somem da loja sem flatpak', () => {
  const { store } = makeStore();
  store.flatpak = false;
  assert.ok(!store.listing().some((a) => a.type === 'flatpak'));
  store.flatpak = true;
  assert.ok(store.listing().some((a) => a.id === 'kodi'));
});
