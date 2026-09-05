const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const frontendDirectory = path.join(__dirname, '..', '..', 'frontend');

function runDocker(args, options = {}) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 1024 * 1024,
    ...options,
  });
}

function extractLocationBlock(configuration, marker) {
  const start = configuration.indexOf(marker);
  if (start === -1) return null;

  const openBrace = configuration.indexOf('{', start);
  if (openBrace === -1) return null;

  let depth = 0;
  for (let index = openBrace; index < configuration.length; index += 1) {
    if (configuration[index] === '{') depth += 1;
    if (configuration[index] === '}') depth -= 1;
    if (depth === 0) return configuration.slice(start, index + 1);
  }
  return null;
}

function buildFrontendImage(t) {
  const tag = `comunidad-reset-log-test-${process.pid}-${Date.now()}`;
  const build = runDocker(['build', '--quiet', '--tag', tag, frontendDirectory]);

  assert.ifError(build.error);
  assert.equal(build.status, 0, 'frontend Docker image must build for effective Nginx validation');

  t.after(() => {
    const image = runDocker(['image', 'inspect', tag]);
    if (image.status === 0) runDocker(['image', 'rm', '--force', tag]);
  });

  return tag;
}

test('effective frontend Nginx configuration disables access logging for legacy reset credentials', (t) => {
  const available = runDocker(['version', '--format', '{{.Server.Version}}'], { timeout: 10000 });
  assert.ifError(available.error);
  assert.equal(available.status, 0, 'Docker is required for effective Nginx validation');

  const image = buildFrontendImage(t);
  const inspected = runDocker([
    'run',
    '--rm',
    '--add-host',
    'backend:127.0.0.1',
    '--entrypoint',
    'nginx',
    image,
    '-T',
  ]);

  assert.ifError(inspected.error);
  assert.equal(inspected.status, 0, 'effective Nginx configuration must be valid');
  const configuration = `${inspected.stdout}\n${inspected.stderr}`;
  const legacyLocation = extractLocationBlock(
    configuration,
    'location ^~ /api/auth/reset-password/'
  );
  const bodyLocation = extractLocationBlock(
    configuration,
    'location = /api/auth/reset-password'
  );

  assert.equal(Boolean(legacyLocation), true, 'legacy reset path must have an explicit effective location');
  assert.equal(/\baccess_log\s+off\s*;/.test(legacyLocation || ''), true);
  assert.equal(/\bproxy_pass\s+http:\/\/backend:3000\s*;/.test(legacyLocation || ''), true);
  assert.equal(Boolean(bodyLocation), true, 'body reset path must avoid the legacy prefix redirect');
  assert.equal(/\bproxy_pass\s+http:\/\/backend:3000\s*;/.test(bodyLocation || ''), true);
});
