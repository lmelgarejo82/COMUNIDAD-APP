const jwt = require('jsonwebtoken');

function uploadsAuth(req, res, next) {
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido para acceder a archivos' });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { uploadsAuth };
