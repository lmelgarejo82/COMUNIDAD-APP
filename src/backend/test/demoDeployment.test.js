const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..', '..');

test('demo reset requires both the explicit flag and an unmistakably demo database', () => {
  const { assertDemoTarget } = require('../scripts/reset-demo');

  assert.throws(
    () => assertDemoTarget({ DEMO_ENV: 'false', DATABASE_URL: 'postgresql://u:p@db/tavalink_demo' }),
    /DEMO_ENV=true/
  );
  assert.throws(
    () => assertDemoTarget({ DEMO_ENV: 'true', DATABASE_URL: 'postgresql://u:p@db/comunidad' }),
    /demo/i
  );
  assert.doesNotThrow(
    () => assertDemoTarget({ DEMO_ENV: 'true', DATABASE_URL: 'postgresql://u:p@db/tavalink_demo' })
  );
});

test('demo reset requires all four passwords without embedding a default credential', () => {
  const { createDemoPdf, readDemoCredentials } = require('../scripts/reset-demo');
  const complete = {
    DEMO_ADMIN_PASSWORD: 'Admin-strong-credential-123!',
    DEMO_RESIDENT_PASSWORD: 'Resident-strong-credential-123!',
    DEMO_GUARD_PASSWORD: 'Guard-strong-credential-123!',
    DEMO_ACCESS_PASSWORD: 'Access-strong-credential-123!',
  };

  assert.throws(() => readDemoCredentials({ ...complete, DEMO_GUARD_PASSWORD: '' }), /DEMO_GUARD_PASSWORD/);
  assert.deepEqual(Object.keys(readDemoCredentials(complete)).sort(), ['access', 'admin', 'guard', 'resident']);

  const source = fs.readFileSync(path.join(backendRoot, 'scripts', 'reset-demo.js'), 'utf8');
  assert.doesNotMatch(source, /admin123|password\s*[:=]\s*['"][^'"]+['"]/i);
  assert.match(source, /DELETE FROM users WHERE email = ANY\(\$1::text\[\]\)/);

  const pdf = createDemoPdf();
  assert.equal(pdf.subarray(0, 8).toString('ascii'), '%PDF-1.4');
  assert.match(pdf.toString('ascii'), /xref\n0 6\n/);
  assert.match(pdf.toString('ascii'), /%%EOF\n$/);
});

test('demo compose isolates state and publishes only the frontend on loopback', () => {
  const compose = fs.readFileSync(path.join(repoRoot, 'deploy', 'demo', 'docker-compose.demo.yml'), 'utf8');

  assert.match(compose, /127\.0\.0\.1:\$\{DEMO_HTTP_PORT:-18080\}:80/);
  assert.doesNotMatch(compose, /(?:5432|6379):(?:5432|6379)/);
  assert.match(compose, /tavalink-demo-postgres/);
  assert.match(compose, /tavalink-demo-redis/);
  assert.match(compose, /tavalink-demo-uploads/);
  assert.match(compose, /QUEUE_ENABLED:\s*['"]true['"]/);
  assert.match(compose, /PUBLIC_REGISTRATION_ENABLED:\s*['"]false['"]/);
  assert.match(compose, /DEMO_ENV:\s*['"]true['"]/);
  assert.match(compose, /healthcheck:/g);
  assert.match(compose, /backend:[\s\S]*edge:\s*\n\s+ipv4_address: 172\.31\.10\.3/);
  assert.match(compose, /frontend:[\s\S]*edge:\s*\n\s+ipv4_address: 172\.31\.10\.2/);
  assert.match(compose, /demo-bootstrap\.sql:\/docker-entrypoint-initdb\.d\/00-demo-bootstrap\.sql:ro/);

  const bootstrap = fs.readFileSync(path.join(repoRoot, 'deploy', 'demo', 'demo-bootstrap.sql'), 'utf8');
  assert.match(bootstrap, /migration-bootstrap@example\.invalid/);
  assert.match(bootstrap, /ON CONFLICT \(email\) DO NOTHING/);
  assert.doesNotMatch(bootstrap, /admin123|tavalink\.com\.py/);
});

test('backend entrypoint waits for the configured database rather than development constants', () => {
  const entrypoint = fs.readFileSync(path.join(backendRoot, 'entrypoint.sh'), 'utf8');
  assert.match(entrypoint, /PGHOST/);
  assert.match(entrypoint, /PGUSER/);
  assert.match(entrypoint, /PGDATABASE/);
  assert.doesNotMatch(entrypoint, /-U postgres -d comunidad/);
});

test('frontend nginx marks every response non-indexable and serves private robots and health', () => {
  const nginx = fs.readFileSync(path.join(repoRoot, 'src', 'frontend', 'nginx.demo.conf'), 'utf8');

  assert.match(nginx, /add_header X-Robots-Tag "noindex, nofollow, noarchive" always;/);
  assert.match(nginx, /location = \/robots\.txt/);
  assert.match(nginx, /Disallow: \/\\n/);
  assert.match(nginx, /location = \/health/);
});
