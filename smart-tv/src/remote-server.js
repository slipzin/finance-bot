// Controle remoto pelo iPhone/iPad: servidor HTTP na rede local que entrega uma
// página (instalável na Tela de Início do iOS) e a API usada por ela e pelo atalho
// "Enviar para TV". Protegido por um PIN mostrado na TV.
//
//   GET  /<pin>               página do controle
//   GET  /<pin>/api/<nome>    handlers.get[nome]()      -> JSON
//   POST /<pin>/api/<nome>    handlers.post[nome](body) -> JSON (opcional)

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
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({ text: data }); }
    });
  });
}

function sendJson(res, value) {
  if (value === undefined) { res.writeHead(204); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
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

    const name = route.startsWith('api/') ? route.slice(4) : null;
    const table = req.method === 'GET' ? handlers.get : req.method === 'POST' ? handlers.post : null;
    const handler = name && table && Object.hasOwn(table, name) ? table[name] : null;
    if (!handler) { res.writeHead(404); return res.end(); }

    try {
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      sendJson(res, await handler(body || {}));
    } catch (err) {
      console.error('Controle remoto:', err);
      res.writeHead(500);
      res.end();
    }
  });

  server.on('error', (err) => console.error('Controle remoto indisponível:', err.message));
  server.listen(port, '0.0.0.0');
  return { server, url: `http://${lanAddress()}:${port}/${pin}` };
}

module.exports = { startRemoteServer };
