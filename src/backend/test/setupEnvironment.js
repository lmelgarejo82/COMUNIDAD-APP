const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.INVITATION_TOKEN_SECRET = crypto.randomBytes(48).toString('hex');
process.env.PUBLIC_APP_URL = 'http://localhost.test';
