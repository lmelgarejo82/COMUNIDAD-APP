const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the real QA startup with only Docker and pg replaced. No socket or
// container can be created by these failure-path tests.
async function startWithInspection(inspected) {
  const source = fs.readFileSync(path.join(__dirname, 'pilotReadback.test.js'), 'utf8');
  const cleanups = [], commands = [], connections = [];
  let run, failure;
  const stopAfterPool = new Error('Connection boundary reached');
  vm.runInNewContext(source, {
    process: { pid: 123 },
    require(name) {
      if (name === 'node:test') return (_title, callback) => { run = callback; };
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:child_process') return { spawnSync(command, args) {
        assert.equal(command, 'docker'); commands.push(Array.from(args));
        if (args[0] === 'inspect') return inspected;
        assert.ok(args[0] === 'run' || args[0] === 'rm');
        return { status: 0, stdout: '' };
      } };
      if (name === 'pg') return { Pool: class { constructor(config) { connections.push({ ...config }); throw stopAfterPool; } } };
      throw new Error('Unexpected dependency before isolated endpoint validation');
    },
  });
  try { await run({ after(callback) { cleanups.push(callback); } }); }
  catch (error) { failure = error; }
  finally { for (const cleanup of cleanups) await cleanup(); }
  const container = commands.find(args => args[0] === 'run');
  assert.ok(container, 'startup owns an exact container');
  assert.deepEqual(commands.filter(args => args[0] === 'rm'), [['rm', '-f', container[container.indexOf('--name') + 1]]], 'inspection failure still cleans only the exact owned container');
  return { connections, failure, stopAfterPool };
}

for (const [label, status, stdout] of [
  ['failed inspect with plausible output', 1, '5432'],
  ['failed inspect with empty output', 1, ''],
  ['empty output', 0, ''],
  ['whitespace output', 0, ' \n'],
  ['nonnumeric output', 0, 'invalid'],
  ['zero port', 0, '0'],
  ['negative port', 0, '-1'],
  ['port above TCP range', 0, '65536'],
  ['fractional port', 0, '5432.5'],
  ['exponent syntax', 0, '1e3'],
  ['numeric prefix with suffix', 0, '5432extra'],
]) test(`isolated readback rejects ${label} before any Pool construction`, async () => {
  const result = await startWithInspection({ status, stdout });
  assert.equal(result.connections.length, 0, 'invalid discovery must not construct a database connection');
  assert.equal(result.failure?.code, 'ERR_ASSERTION', 'failed discovery must explicitly reject its safety precondition');
});

for (const port of [1, 65535]) test(`isolated readback accepts trimmed valid TCP boundary ${port}`, async () => {
  const result = await startWithInspection({ status: 0, stdout: ` ${port}\n` });
  assert.deepEqual(result.connections, [{ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' }]);
  assert.equal(result.failure, result.stopAfterPool);
});
