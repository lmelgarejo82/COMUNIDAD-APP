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

function assertDockerSucceeded(result, message) {
  assert.ifError(result.error);
  assert.equal(result.status === 0, true, message);
}

function buildFrontendImage() {
  const tag = `comunidad-reset-log-test-${process.pid}-${Date.now()}`;
  const build = runDocker(['build', '--quiet', '--tag', tag, frontendDirectory]);
  assertDockerSucceeded(build, 'frontend Docker image must build for behavioral Nginx validation');
  return tag;
}

async function waitUntilReachable(origin) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(origin);
      await response.arrayBuffer();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  assert.fail('isolated frontend container must become reachable');
}

async function waitUntilBackendReady(origin) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-readiness': 'true',
        },
        body: '{}',
        signal: AbortSignal.timeout(500),
      });
      await response.arrayBuffer();
      if (response.status === 204) return;
    } catch {
      // The isolated listener may not have bound its port yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('isolated backend must become ready through the shipped proxy');
}

async function postJson(origin, requestPath, body, headers = {}) {
  try {
    const response = await fetch(`${origin}${requestPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    await response.arrayBuffer();
    return response.status;
  } catch {
    assert.fail('isolated proxy request must complete');
  }
}

test('shipped Nginx keeps reset credentials out of proxy and application logs', async (t) => {
  const available = runDocker(['version', '--format', '{{.Server.Version}}'], { timeout: 10000 });
  assertDockerSucceeded(available, 'Docker is required for behavioral Nginx validation');

  const suffix = `${process.pid}-${Date.now()}`;
  const network = `comunidad-reset-log-${suffix}`;
  const backend = `comunidad-reset-backend-${suffix}`;
  const frontend = `comunidad-reset-frontend-${suffix}`;
  const image = buildFrontendImage();

  t.after(() => {
    runDocker(['rm', '--force', frontend]);
    runDocker(['rm', '--force', backend]);
    runDocker(['network', 'rm', network]);
    runDocker(['image', 'rm', '--force', image]);
  });

  assertDockerSucceeded(
    runDocker(['network', 'create', network]),
    'isolated reset-log network must be created'
  );

  const backendScript = [
    "const http = require('http');",
    "let readinessChecked = false;",
    "http.createServer((req, res) => {",
    "  console.log(req.url);",
    "  if (req.url === '/api/auth/reset-password' && !readinessChecked) {",
    "    req.resume();",
    "    req.on('end', () => {",
    "      if (req.headers['x-test-readiness']) readinessChecked = true;",
    "      res.writeHead(503); res.end();",
    "    });",
    "    return;",
    "  }",
    "  if (req.url.includes('synthetic-failed-') || req.headers['x-test-upstream-failure']) {",
    "    req.socket.destroy(); return;",
    "  }",
    "  req.resume();",
    "  req.on('end', () => {",
    "    const realIp = req.headers['x-real-ip'];",
    "    const forwardedFor = req.headers['x-forwarded-for'];",
    "    const trustedHeaders = Boolean(realIp) && realIp === forwardedFor",
    "      && !forwardedFor.includes(',') && req.headers['x-forwarded-proto'] === 'http';",
    "    res.writeHead(trustedHeaders ? 204 : 418); res.end();",
    "  });",
    "}).listen(3000, '0.0.0.0');",
  ].join('\n');
  assertDockerSucceeded(
    runDocker([
      'run', '--detach',
      '--name', backend,
      '--network', network,
      '--network-alias', 'backend',
      'node:22-alpine',
      'node', '-e', backendScript,
    ]),
    'safe synthetic backend must start in the isolated network'
  );
  assertDockerSucceeded(
    runDocker([
      'run', '--detach', '--rm',
      '--name', frontend,
      '--network', network,
      '--publish', '127.0.0.1::80',
      image,
    ]),
    'shipped frontend container must start in the isolated network'
  );

  const portResult = runDocker([
    'inspect',
    '--format', '{{(index (index .NetworkSettings.Ports "80/tcp") 0).HostPort}}',
    frontend,
  ]);
  assertDockerSucceeded(portResult, 'isolated frontend port must be discoverable');
  const origin = `http://127.0.0.1:${portResult.stdout.trim()}`;
  await waitUntilReachable(origin);
  await waitUntilBackendReady(origin);

  const password = 'Synthetic-password-1!';
  const pathCases = [
    ['/api/auth/reset-password/synthetic-lowercase-credential', 'synthetic-lowercase-credential'],
    ['/api/auth/RESET-PASSWORD/synthetic-uppercase-credential', 'synthetic-uppercase-credential'],
    ['/api/auth/ReSeT-PaSsWoRd/synthetic-mixed-credential', 'synthetic-mixed-credential'],
    ['/api/auth/%72eset-password/synthetic-encoded-credential', 'synthetic-encoded-credential'],
  ];
  const upstreamFailureCases = [
    ['/api/auth/reset-password/synthetic-failed-lowercase', 'synthetic-failed-lowercase'],
    ['/api/auth/RESET-PASSWORD/synthetic-failed-uppercase', 'synthetic-failed-uppercase'],
    ['/api/auth/ReSeT-PaSsWoRd/synthetic-failed-mixed', 'synthetic-failed-mixed'],
    ['/api/auth/reset%2Dpassword/synthetic-failed-encoded', 'synthetic-failed-encoded'],
  ];
  const bodyCredential = 'synthetic-body-credential';
  const queryCredential = 'synthetic-query-credential';
  const trailingQueryCredential = 'synthetic-trailing-query-credential';
  const failingBodyCredential = 'synthetic-failing-body-credential';
  const failingBodyQueryCredential = 'synthetic-failing-body-query-credential';

  const pathStatuses = [];
  for (const [requestPath] of pathCases) {
    pathStatuses.push(await postJson(origin, requestPath, { password }));
  }
  const bodyStatus = await postJson(origin, '/api/auth/reset-password', {
    token: bodyCredential,
    password,
  });
  const queryStatus = await postJson(
    origin,
    `/api/auth/reset-password?token=${queryCredential}`,
    { token: bodyCredential, password }
  );
  const trailingStatus = await postJson(
    origin,
    `/api/auth/reset-password/?token=${trailingQueryCredential}`,
    { token: bodyCredential, password }
  );
  const failingBodyStatus = await postJson(
    origin,
    `/api/auth/reset-password?token=${failingBodyQueryCredential}`,
    { token: failingBodyCredential, password },
    { 'x-test-upstream-failure': 'true' }
  );
  const upstreamFailureStatuses = [];
  for (const [requestPath] of upstreamFailureCases) {
    upstreamFailureStatuses.push(await postJson(origin, requestPath, { password }));
  }

  const frontendLogs = runDocker(['logs', frontend]);
  const backendLogs = runDocker(['logs', backend]);
  assertDockerSucceeded(frontendLogs, 'frontend logs must be inspectable');
  assertDockerSucceeded(backendLogs, 'synthetic application logs must be inspectable');
  const capturedLogs = `${frontendLogs.stdout}${frontendLogs.stderr}${backendLogs.stdout}${backendLogs.stderr}`;
  const credentials = [
    ...pathCases.map(([, credential]) => credential),
    ...upstreamFailureCases.map(([, credential]) => credential),
    bodyCredential,
    queryCredential,
    trailingQueryCredential,
    failingBodyCredential,
    failingBodyQueryCredential,
    password,
  ];

  assert.equal(
    upstreamFailureStatuses.every(status => status === 404),
    true,
    'URL-token variants must not reach a failing upstream'
  );
  assert.equal(
    credentials.some(credential => capturedLogs.includes(credential)),
    false,
    'raw reset credentials must be absent from access, error, and application logs'
  );
  assert.equal(pathStatuses.every(status => status === 404), true, 'URL-token reset variants must be rejected');
  assert.equal(bodyStatus === 204, true, 'body-only reset must still reach the backend');
  assert.equal(queryStatus === 204, true, 'body reset with a query must still reach the backend safely');
  assert.equal(trailingStatus === 204, true, 'trailing-slash body reset must still reach the backend safely');
  assert.equal(failingBodyStatus === 502, true, 'body reset must exercise the protected upstream-error path');
});
