const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const QRCode = require('qrcode');

const TTL = 5 * 60 * 1000;
const token = () => randomBytes(24).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function createReviveServer({ publicURL, now = Date.now, logLinks = false } = {}) {
  const sessions = new Map();
  const rates = new Map();
  const root = path.resolve(__dirname, '../build/web-mobile');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The game may be served by Creator or another origin; owner tokens remain private.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const current = now();
    for (const [id, value] of sessions) if (value.expiresAt <= current) sessions.delete(id);
    for (const [ip, value] of rates) if (current - value.at >= 60000) rates.delete(ip);
    try {
      if (url.pathname === '/api/revive' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const rate = rates.get(ip) ?? { at: current, count: 0 };
        if (++rate.count > 30 || sessions.size >= 1000) { json(429, { error: '请求过多，请稍后重试' }); return; }
        rates.set(ip, rate);
        const id = token(), owner = token(), confirm = token();
        const session = { owner, confirm, expiresAt: current + TTL, state: 'pending' };
        sessions.set(id, session);
        const scanURL = `${publicURL}/revive#${id}.${confirm}`;
        const qr = QRCode.create(scanURL, { errorCorrectionLevel: 'M' });
        if (logLinks) console.log(`扫码复活测试链接：${scanURL}`);
        json(201, { id, owner, expiresAt: session.expiresAt, scanURL,
          size: qr.modules.size, modules: Array.from(qr.modules.data) });
        return;
      }
      const match = url.pathname.match(/^\/api\/revive\/([A-Za-z0-9_-]{32})(?:\/(confirm|consume))?$/);
      if (match) {
        const [, id, action] = match;
        const session = sessions.get(id);
        if (!session) { json(410, { error: '二维码已过期或已取消，请在游戏中重新扫码' }); return; }
        const secret = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        if (!same(secret, action === 'confirm' ? session.confirm : session.owner)) {
          json(403, { error: '无效的复活凭证' }); return;
        }
        if (action === 'confirm' && req.method === 'POST') {
          if (session.state === 'consumed') { json(409, { error: '本次复活已经使用' }); return; }
          session.state = 'confirmed';
          json(200, { state: 'confirmed' }); return;
        }
        if (action === 'consume' && req.method === 'POST') {
          if (session.state !== 'confirmed') { json(409, { error: '尚未确认，或复活已使用' }); return; }
          session.state = 'consumed';
          json(200, { state: 'consumed' }); return;
        }
        if (!action && req.method === 'GET') { json(200, { state: session.state, expiresAt: session.expiresAt }); return; }
        if (!action && req.method === 'DELETE') { sessions.delete(id); json(200, { state: 'cancelled' }); return; }
      }
      if (url.pathname === '/revive' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'revive-page.html'))); return;
      }
      if (url.pathname === '/health') { json(200, { ok: true }); return; }
      if (req.method !== 'GET') { json(405, { error: '不支持的请求' }); return; }
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        json(404, { error: '页面不存在' }); return;
      }
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
        '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error(error.message);
      if (!res.headersSent) json(500, { error: '服务暂不可用，请稍后重试' });
      else res.end();
    }
  });
  server.requestTimeout = 10000;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 7461);
  const interfaces = os.networkInterfaces();
  const addresses = Object.entries(interfaces).filter(([name]) => !/^(utun|tun|docker|vbox)/.test(name))
    .flatMap(([, entries]) => entries).filter(entry => entry.family === 'IPv4' && !entry.internal);
  const host = addresses[0]?.address ?? '127.0.0.1';
  const publicURL = (process.env.REVIVE_PUBLIC_URL || `http://${host}:${port}`).replace(/\/$/, '');
  const server = createReviveServer({ publicURL, logLinks: process.env.REVIVE_LOG_LINKS === '1' });
  server.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`游戏与扫码复活服务：${publicURL}/`);
    if (!addresses.length && !process.env.REVIVE_PUBLIC_URL) console.log('未检测到局域网地址；手机扫码前请设置 REVIVE_PUBLIC_URL。');
  });
}
module.exports = { createReviveServer, TTL };
