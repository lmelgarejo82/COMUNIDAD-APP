const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
const { resetDemo } = require('../scripts/reset-demo');

test('demo reset removes complete demo hierarchy and prospect identities but preserves unrelated tenants',
  { skip: process.env.RUN_DEMO_RESET_POSTGRES !== 'true' }, async (t) => {
    const name = `tavalink-demo-reset-test-${process.pid}-${Date.now()}`;
    const docker = args => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
    assert.equal(docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'postgres:18-alpine']).status, 0);
    const port = Number(docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', name]).stdout.trim());
    assert.ok(port > 0 && port <= 65535);
    const pool = new Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    const uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'demo-reset-upload-'));
    let client;
    t.after(async () => { client?.release(); await pool.end(); docker(['rm', '-f', name]); await fs.rm(uploads, { recursive: true, force: true }); });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await pool.query('SELECT 1'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert.ok(ready);
    client = await pool.connect();
    await client.query(await fs.readFile(path.resolve(__dirname, '../../../deploy/demo/demo-bootstrap.sql'), 'utf8'));
    await require('../scripts/migrate').runMigrations({ client, logger: { log() {} } });
    const foreign = (await client.query("INSERT INTO communities(name, access_code) VALUES('Unrelated tenant','FOREIGN_ONLY') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO complexes(name, community_id) VALUES('Unrelated complex',$1)", [foreign]);
    await client.query("INSERT INTO users(email,password_hash,role,community_id) VALUES('demo.admin@tavalink.com.py','!','admin',$1)", [foreign]);
    const credentials = { admin: 'Synthetic-admin-123!', resident: 'Synthetic-resident-123!', guard: 'Synthetic-guard-123!', access: 'Synthetic-access-123!' };
    await assert.rejects(resetDemo(client, credentials, uploads), /duplicate key/i);
    assert.equal((await client.query("SELECT community_id FROM users WHERE email='demo.admin@tavalink.com.py'")).rows[0].community_id, foreign);
    await client.query("UPDATE users SET email='unrelated@example.invalid' WHERE community_id=$1", [foreign]);
    const first = await resetDemo(client, credentials, uploads);
    await client.query("INSERT INTO users(email,password_hash,role,community_id) VALUES('prospect@example.invalid','!','residente',$1)", [first.communityId]);
    await client.query("INSERT INTO complexes(name,community_id) VALUES('Prospect-created complex',$1)", [first.communityId]);
    await resetDemo(client, credentials, uploads);
    const counts = (await client.query('SELECT (SELECT count(*) FROM communities)::int AS communities, (SELECT count(*) FROM complexes)::int AS complexes, (SELECT count(*) FROM buildings)::int AS buildings, (SELECT count(*) FROM floors)::int AS floors, (SELECT count(*) FROM units)::int AS units, (SELECT count(*) FROM users)::int AS users')).rows[0];
    assert.deepEqual(counts, { communities: 2, complexes: 2, buildings: 1, floors: 3, units: 6, users: 8 });
    assert.equal((await client.query("SELECT count(*)::int AS n FROM users WHERE email='prospect@example.invalid'")).rows[0].n, 0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM users WHERE community_id=$1', [foreign])).rows[0].n, 1);
    assert.ok((await fs.stat(path.join(uploads, '1726000000000-reglamento-demo.pdf'))).size > 0);
  });
