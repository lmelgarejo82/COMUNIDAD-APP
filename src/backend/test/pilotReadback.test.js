const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');

// Real PostgreSQL projection/filter regression; never connects to application DB/Redis.
test('public invitation metadata and resident announcements use safe database readbacks', async t => {
  const name = `comunidad-readback-test-${process.pid}-${Date.now()}`;
  const docker = args => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
  const started = docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:18-alpine']);
  assert.equal(started.status === 0, true, 'isolated PostgreSQL must start');
  let pool;
  t.after(async () => { await pool?.end(); assert.equal(docker(['rm', '-f', name]).status === 0, true, 'isolated PostgreSQL cleaned'); });
  const port = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', name]).stdout.trim();
  pool = new Pool({ host: '127.0.0.1', port: Number(port), user: 'postgres', database: 'postgres' });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query('SELECT 1'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(ready, true, 'isolated PostgreSQL ready');
  await pool.query(`
    CREATE TABLE users(id int PRIMARY KEY,email text,community_id int,unit_id int);
    INSERT INTO users VALUES(10,'admin@example.test',4,null),(11,'resident@example.test',4,1),(12,'foreign@example.test',5,2);
    CREATE TABLE visitor_digital_invitations(id serial PRIMARY KEY, community_id int,preauthorization_id int,token_hash varchar(128),token_hint varchar(16),expires_at timestamptz,revoked_at timestamptz,revoked_by int,created_by int,created_at timestamptz DEFAULT NOW(),updated_at timestamptz DEFAULT NOW());
    CREATE TABLE announcements(id serial PRIMARY KEY,community_id int,title text,message text,file_url text,created_by int,created_at timestamptz DEFAULT NOW(),deleted_at timestamptz);
    CREATE TABLE complexes(id int,community_id int,deleted_at timestamptz);
    CREATE TABLE buildings(id int,complex_id int,deleted_at timestamptz);
    CREATE TABLE floors(id int,building_id int,deleted_at timestamptz);
    CREATE TABLE units(id int,floor_id int,unit_code text,is_active bool DEFAULT true,deleted_at timestamptz);
    CREATE TABLE unit_ownerships(user_id int,unit_id int,start_date timestamptz,end_date timestamptz);
    CREATE TABLE expenses(id int,community_id int,due_date date);
    CREATE TABLE unit_expenses(unit_id int,expense_id int,status text,amount_owed numeric);
    INSERT INTO complexes VALUES(1,4,null),(2,5,null);
    INSERT INTO buildings VALUES(1,1,null),(2,2,null);
    INSERT INTO floors VALUES(1,1,null),(2,2,null);
    INSERT INTO units(id,floor_id,unit_code) VALUES(1,1,'A'),(2,2,'B');
    INSERT INTO unit_ownerships VALUES(11,1,null,null),(12,2,null,null);
    INSERT INTO expenses VALUES(1,4,'2030-01-01');
    INSERT INTO unit_expenses VALUES(1,1,'rejected',123);
  `);
  const inject = (module, exports) => { const path = require.resolve(module); require.cache[path] = { id: path, filename: path, loaded: true, exports }; };
  inject('../db', { pool });
  inject('../cache', { cacheOrFetch() { throw new Error('resident read must not use cache'); }, CACHE_TTL: {} });
  inject('../models/VisitorPreauthorization', { VisitorPreauthorization: { async findByIdForCommunity(id, community) { return community === 4 && id === 3 ? { id: 3, status: 'pending' } : null; } } });
  const invitationController = require('../controllers/accessInvitationController');
  const { Announcement } = require('../models/Announcement');
  const { Dashboard } = require('../models/Dashboard');
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = JSON.parse(JSON.stringify(payload)); return this; } });
  const req = { params: { id: '3' }, communityId: 4, user: { id: 10, role: 'admin' }, body: {} };
  const created = response(); await invitationController.create(req, created);
  assert.equal(created.statusCode, 201);
  const raw = created.body.token;
  const hash = (await pool.query('SELECT token_hash FROM visitor_digital_invitations')).rows[0].token_hash;
  const safe = metadata => {
    assert.equal(JSON.stringify(metadata).includes(hash), false, 'public metadata must omit stored hash');
    assert.equal(JSON.stringify(metadata).includes(raw), false, 'public metadata must omit raw token');
    assert.equal(Object.hasOwn(metadata, 'token_hash'), false);
    assert.equal(metadata.token_hint, raw.slice(0, 8));
    assert.equal(metadata.community_id, 4);
    assert.equal(metadata.preauthorization_id, 3);
    assert.equal(metadata.created_by_email, 'admin@example.test');
    assert.ok(metadata.created_at && metadata.updated_at && metadata.expires_at);
  };
  await t.test('serialized create metadata excludes hash and preserves deliberate new token', () => { safe(created.body.invitation); assert.equal(new URL(created.body.invitation_url).pathname.endsWith(raw), true); });
  await t.test('serialized list excludes hash and raw token with foreign isolation', async () => {
    const listed = response(); await invitationController.list(req, listed); safe(listed.body.data[0]);
    const foreign = response(); await invitationController.list({ ...req, communityId: 5 }, foreign); assert.deepEqual(foreign.body.data, []);
  });
  await t.test('serialized revoke excludes hash and preserves revocation metadata', async () => {
    const revoked = response(); await invitationController.revoke({ ...req, params: { id: '3', invitationId: String(created.body.invitation.id) } }, revoked);
    safe(revoked.body.invitation); assert.equal(revoked.body.invitation.status, 'revoked'); assert.equal(revoked.body.invitation.revoked_by_email, 'admin@example.test');
  });
  await t.test('fresh resident dashboard excludes deleted and foreign announcements, preserving rejected balance', async () => {
    const a = await Announcement.create({ community_id: 4, title: 'Own announcement', message: 'Text', created_by: 10 });
    await Announcement.create({ community_id: 5, title: 'Foreign announcement', message: 'Text', created_by: 12 });
    assert.equal((await Announcement.findByCommunity(4)).data.length, 1);
    assert.deepEqual((await Dashboard.residente(11, 4)).anuncios.map(row => row.title), ['Own announcement']);
    await Announcement.softDelete(a.id, 4);
    assert.equal((await Announcement.findByCommunity(4)).data.length, 0);
    const dashboard = await Dashboard.residente(11, 4);
    assert.deepEqual(dashboard.anuncios, [], 'deleted announcement must not return in fresh dashboard');
    assert.equal(dashboard.saldo_pendiente, 123);
    assert.equal((await Dashboard.residente(12, 5)).anuncios[0].title, 'Foreign announcement');
  });
});
