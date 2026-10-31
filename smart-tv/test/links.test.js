const test = require('node:test');
const assert = require('node:assert');
const { resolveLink } = require('../src/links');
const { catalog } = require('../apps.json');

const cases = [
  ['https://www.netflix.com/title/80057281', 'netflix', 'https://www.netflix.com/title/80057281'],
  ['Assista "Stranger Things" na Netflix: https://www.netflix.com/title/80057281?s=i', 'netflix'],
  ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'youtube', 'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ'],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'youtube', 'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ'],
  ['https://youtube.com/shorts/abc_123', 'youtube', 'https://www.youtube.com/tv#/watch?v=abc_123'],
  ['https://music.youtube.com/watch?v=xyz', 'ytmusic'],
  ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify'],
  ['https://www.disneyplus.com/pt-br/movies/frozen/abc', 'disney'],
  ['https://www.primevideo.com/detail/0ABC', 'prime'],
  ['https://www.amazon.com.br/gp/video/detail/B0ABC', 'prime'],
  ['https://www.amazon.com.br/dp/B0LIVRO', 'browser'],
  ['https://globoplay.globo.com/v/12345/', 'globoplay'],
  ['https://tv.apple.com/br/show/severance/umc.cmc.1', 'appletv'],
  ['https://music.apple.com/br/album/x/1', 'applemusic'],
  ['https://www.twitch.tv/gaules', 'twitch'],
  ['https://example.com/qualquer', 'browser'],
];

for (const [input, appId, url] of cases) {
  test(`link ${input} -> ${appId}`, () => {
    const r = resolveLink(input, catalog);
    assert.strictEqual(r.appId, appId);
    if (url) assert.strictEqual(r.url, url);
  });
}

test('rejeita links inválidos', () => {
  assert.strictEqual(resolveLink('não é link', catalog), null);
  assert.strictEqual(resolveLink('javascript:alert(1)', catalog), null);
});
