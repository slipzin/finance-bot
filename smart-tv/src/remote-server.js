// Controle remoto pelo iPhone/iPad: servidor HTTP na rede local que entrega uma
// página (instalável na Tela de Início do iOS) com setas, OK, Voltar, Home,
// volume e teclado. Protegido por um PIN mostrado na TV.

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, 'remote', 'index.html');

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

function startRemoteServer({ port, pin, handlers }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://tv');
    const [, reqPin, ...rest] = url.pathname.split('/');
    if (reqPin !== pin) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('PIN incorreto. Use o endereço mostrado na TV.');
    }
    const route = rest.join('/');

    if (req.method === 'GET' && route === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(PAGE).pipe(res);
    }
    if (req.method === 'GET' && route === 'api/apps') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(handlers.apps()));
    }
    if (req.method === 'POST' && route.startsWith('api/')) {
      const body = await readBody(req);
      const action = route.slice(4);
      if (action === 'key' && typeof body.key === 'string') handlers.key(body.key);
      else if (action === 'text' && typeof body.text === 'string') handlers.text(body.text.slice(0, 500));
      else if (action === 'launch' && typeof body.id === 'string') handlers.launch(body.id);
      else if (action === 'volume' && typeof body.action === 'string') handlers.volume(body.action);
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });

  server.on('error', (err) => console.error('Controle remoto indisponível:', err.message));
  server.listen(port, '0.0.0.0');
  return { server, url: `http://${lanAddress()}:${port}/${pin}` };
}

module.exports = { startRemoteServer };
