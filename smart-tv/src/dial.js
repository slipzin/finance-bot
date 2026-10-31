// DIAL: o protocolo que faz a TV aparecer no botão de transmitir do app do YouTube
// (o mesmo usado pelas Smart TVs). O celular descobre a TV por SSDP na rede local e
// pede para abrir o app "YouTube" com um código de pareamento; a TV então abre
// youtube.com/tv com esse código e o celular passa a controlar a reprodução.

const dgram = require('dgram');
const http = require('http');
const os = require('os');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const ST = 'urn:dial-multiscreen-org:service:dial:1';

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) if (net.family === 'IPv4' && !net.internal) return net.address;
  }
  return '127.0.0.1';
}

const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

function startDial({ name, port, uuid, apps }) {
  const base = () => `http://${lanAddress()}:${port}`;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://tv');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Location, Application-URL');

    if (url.pathname === '/dd.xml') {
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Application-URL': `${base()}/apps/` });
      return res.end(`<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:dial-multiscreen-org:device:dial:1</deviceType>
    <friendlyName>${xmlEscape(name)}</friendlyName>
    <manufacturer>Smart TV</manufacturer>
    <modelName>Smart TV</modelName>
    <UDN>uuid:${uuid}</UDN>
  </device>
</root>`);
    }

    const m = url.pathname.match(/^\/apps\/([^/]+)(\/run)?\/?$/);
    const handler = m && apps[decodeURIComponent(m[1])];
    if (!handler) { res.writeHead(404); return res.end(); }
    const appName = decodeURIComponent(m[1]);

    if (req.method === 'GET' && !m[2]) {
      const running = handler.isRunning();
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>
<service xmlns="urn:dial-multiscreen-org:schemas:dial" dialVer="2.1">
  <name>${xmlEscape(appName)}</name>
  <options allowStop="true"/>
  <state>${running ? 'running' : 'stopped'}</state>${running ? '\n  <link rel="run" href="run"/>' : ''}
</service>`);
    }
    if (req.method === 'POST' && !m[2]) {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
      req.on('end', () => {
        const wasRunning = handler.isRunning();
        handler.launch(body.trim());
        res.writeHead(wasRunning ? 200 : 201, { Location: `${base()}/apps/${encodeURIComponent(appName)}/run` });
        res.end();
      });
      return;
    }
    if (req.method === 'DELETE' && m[2]) {
      handler.stop();
      res.writeHead(200);
      return res.end();
    }
    res.writeHead(405);
    res.end();
  });
  server.on('error', (err) => console.error('DIAL indisponível:', err.message));
  server.listen(port, '0.0.0.0');

  // Responde às buscas SSDP ("quem é uma TV DIAL nesta rede?").
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('error', (err) => console.error('SSDP indisponível:', err.message));
  socket.on('message', (msg, rinfo) => {
    const text = msg.toString();
    if (!text.startsWith('M-SEARCH') || !(text.includes(ST) || text.includes('ssdp:all'))) return;
    const reply = [
      'HTTP/1.1 200 OK',
      'CACHE-CONTROL: max-age=1800',
      `DATE: ${new Date().toUTCString()}`,
      'EXT:',
      `LOCATION: ${base()}/dd.xml`,
      'SERVER: Linux/1.0 UPnP/1.1 SmartTV/1.0',
      `ST: ${ST}`,
      `USN: uuid:${uuid}::${ST}`,
      'BOOTID.UPNP.ORG: 1',
      '', '',
    ].join('\r\n');
    socket.send(reply, rinfo.port, rinfo.address);
  });
  socket.bind(SSDP_PORT, () => {
    try { socket.addMembership(SSDP_ADDR); } catch (err) { console.error('SSDP multicast:', err.message); }
  });

  return { server, socket };
}

module.exports = { startDial };
