const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.join(__dirname, '..', '..', '..');

test('Windows checkout preserves Unix bytes for executable and immutable deployment files', (t) => {
  const checkoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'comunidad-checkout-'));
  const checkoutPrefix = `${checkoutRoot}${path.sep}`;
  t.after(() => fs.rmSync(checkoutRoot, { recursive: true, force: true }));

  const checkout = spawnSync(
    'git',
    ['-c', 'core.autocrlf=true', 'checkout-index', '--all', '--force', `--prefix=${checkoutPrefix}`],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  assert.ifError(checkout.error);
  assert.equal(checkout.status, 0, checkout.stderr);

  const entrypoint = fs.readFileSync(path.join(checkoutRoot, 'src', 'backend', 'entrypoint.sh'));
  assert.equal(entrypoint.subarray(0, 10).toString('utf8'), '#!/bin/sh\n');
  assert.equal(entrypoint.includes(13), false);

  const migrationsDir = path.join(checkoutRoot, 'src', 'backend', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
  for (const filename of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    assert.equal(sql.includes('\r'), false, filename);
  }
});
