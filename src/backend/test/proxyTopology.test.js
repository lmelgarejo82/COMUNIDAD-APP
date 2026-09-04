const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.join(__dirname, '..', '..', '..');

test('Docker exposes the API only through an explicitly addressed Nginx proxy', () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  const backendBlock = compose.match(/\n  backend:\n([\s\S]*?)\n  frontend:/)?.[1] || '';
  const frontendBlock = compose.match(/\n  frontend:\n([\s\S]*?)\nvolumes:/)?.[1] || '';

  assert.match(backendBlock, /TRUST_PROXY_IP:\s*['"]?172\.30\.0\.2['"]?/);
  assert.doesNotMatch(backendBlock, /\n\s+ports:/);
  assert.match(backendBlock, /proxy:\s*\n\s+ipv4_address:\s*172\.30\.0\.3/);
  assert.match(frontendBlock, /proxy:\s*\n\s+ipv4_address:\s*172\.30\.0\.2/);
});

test('Nginx replaces untrusted forwarding headers and supplies the trusted scheme', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'src', 'frontend', 'nginx.conf'), 'utf8');
  const apiBlock = nginx.match(/location \/api\/ \{([\s\S]*?)\n  \}/)?.[1] || '';

  assert.match(apiBlock, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.match(apiBlock, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(apiBlock, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  assert.doesNotMatch(apiBlock, /\$proxy_add_x_forwarded_for/);
});
