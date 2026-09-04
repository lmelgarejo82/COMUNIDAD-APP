const { User } = require('../models/User');

function tokenAuthVersion(decoded) {
  if (decoded?.auth_version === undefined) return 0;
  return Number.isInteger(decoded.auth_version) && decoded.auth_version >= 0
    ? decoded.auth_version
    : null;
}

async function isSessionCurrent(decoded) {
  if (!Number.isInteger(decoded?.id) || decoded.id <= 0) return false;

  const tokenVersion = tokenAuthVersion(decoded);
  if (tokenVersion === null) return false;

  const currentVersion = await User.getAuthVersion(decoded.id);
  return Number.isInteger(currentVersion) && currentVersion === tokenVersion;
}

module.exports = { isSessionCurrent, tokenAuthVersion };
