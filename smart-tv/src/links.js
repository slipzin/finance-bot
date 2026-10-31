// "Enviar para TV": descobre em qual app um link compartilhado pelo iPhone deve abrir
// (Netflix, Disney+, Prime, Globoplay, YouTube, Spotify...) e ajusta a URL se preciso.

function matches(url, pattern) {
  const [host, ...rest] = pattern.split('/');
  const pathPrefix = rest.length ? `/${rest.join('/')}` : '';
  const hostOk = url.hostname === host || url.hostname.endsWith(`.${host}`);
  return hostOk && url.pathname.startsWith(pathPrefix);
}

// O YouTube de TV abre vídeos pelo hash da interface "leanback".
function youtubeTvUrl(url) {
  let id = null;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (url.searchParams.get('v')) id = url.searchParams.get('v');
  else {
    const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]+)/);
    if (m) id = m[2];
  }
  return id ? `https://www.youtube.com/tv#/watch?v=${encodeURIComponent(id)}` : 'https://www.youtube.com/tv';
}

// Retorna { appId, url } ou null se não for um link válido.
function resolveLink(raw, apps) {
  // Apps de compartilhamento costumam mandar "Assista X no Netflix: https://...".
  const found = String(raw).match(/https?:\/\/\S+/);
  let url;
  try { url = new URL(found ? found[0] : raw); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;

  // O padrão mais específico ganha (music.youtube.com antes de youtube.com).
  let best = null;
  for (const app of apps) {
    for (const pattern of app.domains || []) {
      if (matches(url, pattern) && (!best || pattern.length > best.pattern.length)) best = { app, pattern };
    }
  }
  if (!best) return { appId: 'browser', url: url.href };
  if (best.app.id === 'youtube') return { appId: 'youtube', url: youtubeTvUrl(url) };
  return { appId: best.app.id, url: url.href };
}

module.exports = { resolveLink, youtubeTvUrl };
