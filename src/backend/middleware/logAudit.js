const { Audit } = require('../models/Audit');

function logAudit(action, getDetails = null) {
  return async (req, res, next) => {
    const originalSend = res.json.bind(res);

    res.json = function (body) {
      const details = getDetails ? getDetails(req, body) : {};
      const ip = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress;

      Audit.log({
        user_id: req.user?.id,
        action,
        details,
        ip_address: ip?.split(',')[0]?.trim() || null,
      }).catch(err => console.error('Error en logAudit:', err));

      return originalSend(body);
    };

    next();
  };
}

module.exports = { logAudit };
