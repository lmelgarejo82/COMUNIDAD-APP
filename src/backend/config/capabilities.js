const PLACEHOLDERS = Object.freeze({
  DEEPSEEK_API_KEY: new Set(['sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']),
  MP_ACCESS_TOKEN: new Set(['TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx']),
  TWILIO_ACCOUNT_SID: new Set(['ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']),
  TWILIO_AUTH_TOKEN: new Set(['xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']),
  TWILIO_WHATSAPP_NUMBER: new Set(['+14155238886']),
});

function hasMeaningfulValue(env, name) {
  const value = typeof env[name] === 'string' ? env[name].trim() : '';
  return Boolean(value) && !PLACEHOLDERS[name]?.has(value);
}

function getCapabilities(env = process.env) {
  return {
    aiAssistant: hasMeaningfulValue(env, 'DEEPSEEK_API_KEY'),
    mercadoPago: hasMeaningfulValue(env, 'MP_ACCESS_TOKEN'),
    automaticWhatsApp: [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_WHATSAPP_NUMBER',
    ].every((name) => hasMeaningfulValue(env, name)),
  };
}

module.exports = { getCapabilities };
