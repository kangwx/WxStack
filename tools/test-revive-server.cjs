const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReviveServer, TTL } = require('./revive-server.cjs');

function service() {
  let clock = 1000000;
  const server = createReviveServer({ publicURL: 'http://192.168.1.8:7461', now: () => clock });
  function request(method, url, secret) {
    return new Promise(resolve => {
      const headers = {};
      const res = { setHeader(key, value) { headers[key] = value; },
        writeHead(status, values) { this.status = status; Object.assign(headers, values); },
        end(body) { resolve({ status: this.status, headers,
          body: typeof body === 'string' && body.startsWith('{') ? JSON.parse(body) : String(body ?? '') }); } };
      server.emit('request', { method, url, socket: { remoteAddress: 'test-device' },
        headers: { authorization: secret ? `Bearer ${secret}` : '' } }, res);
    });
  }
  return { request, advance(ms) { clock += ms; } };
}

test('scanning only opens the phone page; explicit confirmation and owner consumption are both required', async () => {
  const { request } = service();
  const created = await request('POST', '/api/revive');
  assert.equal(created.status, 201);
  const session = created.body;
  const scan = new URL(session.scanURL);
  const [id, confirm] = scan.hash.slice(1).split('.');
  assert.equal(id, session.id);
  assert.notEqual(confirm, session.owner, 'QR must not expose the game-only owner credential');
  assert.equal(session.modules.length, session.size * session.size);
  assert.ok(session.modules.every(bit => bit === 0 || bit === 1));
  const phone = await request('GET', '/revive');
  assert.equal(phone.status, 200);
  assert.match(phone.body, /确认复活/);
  const base = `/api/revive/${id}`;
  assert.equal((await request('GET', base, session.owner)).body.state, 'pending');
  assert.equal((await request('POST', `${base}/consume`, session.owner)).status, 409);
  assert.equal((await request('POST', `${base}/confirm`, session.owner)).status, 403);
  assert.equal((await request('GET', base, confirm)).status, 403);
  assert.equal((await request('POST', `${base}/confirm`, confirm)).status, 200);
  assert.equal((await request('POST', `${base}/confirm`, confirm)).status, 200, 'phone retries are idempotent');
  assert.equal((await request('GET', base, session.owner)).body.state, 'confirmed');
  assert.equal((await request('POST', `${base}/consume`, session.owner)).body.state, 'consumed');
  assert.equal((await request('POST', `${base}/consume`, session.owner)).status, 409);
  assert.equal((await request('POST', `${base}/confirm`, confirm)).status, 409);
  assert.equal((await request('GET', base, session.owner)).body.state, 'consumed', 'lost consume responses can be reconciled');
});

test('cancelled and expired QR codes cannot revive a later round, and sessions stay isolated', async () => {
  const { request, advance } = service();
  const a = (await request('POST', '/api/revive')).body;
  const b = (await request('POST', '/api/revive')).body;
  const confirmA = new URL(a.scanURL).hash.slice(1).split('.')[1];
  assert.equal((await request('POST', `/api/revive/${b.id}/confirm`, confirmA)).status, 403);
  assert.equal((await request('DELETE', `/api/revive/${a.id}`, b.owner)).status, 403);
  assert.equal((await request('DELETE', `/api/revive/${a.id}`, a.owner)).status, 200);
  assert.equal((await request('POST', `/api/revive/${a.id}/confirm`, confirmA)).status, 410);
  advance(TTL);
  assert.equal((await request('GET', `/api/revive/${b.id}`, b.owner)).status, 410);
});

test('session creation is bounded and static paths cannot escape the build directory', async () => {
  const { request, advance } = service();
  for (let i = 0; i < 30; i++) assert.equal((await request('POST', '/api/revive')).status, 201);
  assert.equal((await request('POST', '/api/revive')).status, 429);
  advance(60000);
  assert.equal((await request('POST', '/api/revive')).status, 201);
  assert.equal((await request('GET', '/%2e%2e%2fpackage.json')).status, 404);
});
