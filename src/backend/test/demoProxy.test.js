const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('demo proxy preserves sanitized host client identity and TLS scheme but ignores untrusted peers',
  { skip: process.env.RUN_DEMO_PROXY_DOCKER !== 'true' }, async (t) => {
    const name = `tavalink-demo-proxy-test-${process.pid}-${Date.now()}`;
    const docker = args => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'demo-proxy-'));
    t.after(async () => { docker(['rm', '-f', name]); await fs.rm(dir, { recursive: true, force: true }); });
    const conf = await fs.readFile(path.resolve(__dirname, '../../frontend/nginx.demo.conf'), 'utf8');
    const fixture = '\nserver { listen 3000; location / { default_type application/json; return 200 \'{"ip":"$http_x_forwarded_for","real":"$http_x_real_ip","proto":"$http_x_forwarded_proto"}\'; } }\n';
    await fs.writeFile(path.join(dir, 'default.conf'), conf + fixture);
    const shell = [
      'set -eu',
      'ip addr add 172.31.10.1/32 dev lo',
      'ip addr add 172.31.10.8/32 dev lo',
      'nginx',
      'for endpoint in /api/health /uploads/test.pdf /api/auth/reset-password; do curl -fsS --interface 172.31.10.1 -H "X-Forwarded-For: 198.51.100.10" -H "X-Forwarded-Proto: https" http://127.0.0.1$endpoint; echo; done',
      'curl -fsS --interface 172.31.10.1 -H "X-Forwarded-For: 198.51.100.11" -H "X-Forwarded-Proto: https" http://127.0.0.1/api/health; echo',
      'curl -fsS --interface 172.31.10.8 -H "X-Forwarded-For: 198.51.100.99" -H "X-Forwarded-Proto: https" http://127.0.0.1/api/health; echo',
    ].join('\n');
    assert.equal(docker(['create', '--name', name, '--network', 'none', '--cap-add', 'NET_ADMIN', '--add-host', 'backend:127.0.0.1', 'nginx:alpine', 'sh', '-c', shell]).status, 0);
    assert.equal(docker(['cp', path.join(dir, 'default.conf'), `${name}:/etc/nginx/conf.d/default.conf`]).status, 0);
    const result = docker(['start', '-a', name]);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.split('\n').filter(s => s.startsWith('{')).map(s => JSON.parse(s));
    assert.deepEqual(lines, [
      ...Array.from({ length: 3 }, () => ({ ip: '198.51.100.10', real: '198.51.100.10', proto: 'https' })),
      { ip: '198.51.100.11', real: '198.51.100.11', proto: 'https' },
      { ip: '172.31.10.8', real: '172.31.10.8', proto: 'http' },
    ]);
  });
