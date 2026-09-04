const LEGACY_JWT_SECRET = 'cambiar-por-secreto-seguro-en-produccion';

function configError(variable, detail) {
  const error = new Error(`${variable} ${detail}`);
  error.code = 'SECURITY_CONFIG_INVALID';
  return error;
}

function getJwtSecret(env = process.env) {
  const secret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET.trim() : '';
  if (!secret) throw configError('JWT_SECRET', 'debe configurarse explícitamente');
  if (secret === LEGACY_JWT_SECRET) {
    throw configError('JWT_SECRET', 'usa un valor conocido e inseguro');
  }
  return secret;
}

function getInvitationTokenSecret(env = process.env) {
  const secret = typeof env.INVITATION_TOKEN_SECRET === 'string'
    ? env.INVITATION_TOKEN_SECRET.trim()
    : '';
  if (!secret) throw configError('INVITATION_TOKEN_SECRET', 'debe configurarse explícitamente');
  if (secret === LEGACY_JWT_SECRET) {
    throw configError('INVITATION_TOKEN_SECRET', 'usa un valor conocido e inseguro');
  }

  const jwtSecret = getJwtSecret(env);
  if (secret === jwtSecret) {
    throw configError('INVITATION_TOKEN_SECRET', 'debe ser diferente de JWT_SECRET');
  }
  return secret;
}

function getPublicAppOrigin(env = process.env) {
  const configured = typeof env.PUBLIC_APP_URL === 'string' ? env.PUBLIC_APP_URL.trim() : '';
  if (!configured) throw configError('PUBLIC_APP_URL', 'debe configurarse explícitamente');

  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw configError('PUBLIC_APP_URL', 'debe ser un origen HTTP(S) absoluto válido');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash) {
    throw configError('PUBLIC_APP_URL', 'debe ser un origen HTTP(S) sin credenciales, path, query ni fragmento');
  }

  return parsed.origin;
}

function validateSecurityConfig(env = process.env) {
  return Object.freeze({
    jwtSecret: getJwtSecret(env),
    invitationTokenSecret: getInvitationTokenSecret(env),
    publicAppOrigin: getPublicAppOrigin(env),
  });
}

module.exports = {
  getJwtSecret,
  getInvitationTokenSecret,
  getPublicAppOrigin,
  validateSecurityConfig,
};
