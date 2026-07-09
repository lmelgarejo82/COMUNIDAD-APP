const xss = require('xss');

function sanitize(...fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = xss(req.body[field]);
      }
    }
    next();
  };
}

module.exports = { sanitize };
