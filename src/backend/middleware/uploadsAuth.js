const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');
const { isSessionCurrent } = require('./sessionVersion');

async function uploadsAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acceso requerido para acceder a archivos' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!(await isSessionCurrent(decoded))) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { uploadsAuth };
