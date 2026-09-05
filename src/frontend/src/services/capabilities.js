import api from './api.js';

const unavailable = Object.freeze({
  aiAssistant: false,
  mercadoPago: false,
  automaticWhatsApp: false,
});

function normalize(value) {
  const capabilities = value && typeof value === 'object' ? value : {};
  return {
    aiAssistant: capabilities.aiAssistant === true,
    mercadoPago: capabilities.mercadoPago === true,
    automaticWhatsApp: capabilities.automaticWhatsApp === true,
  };
}

export function createCapabilityService(client = api) {
  let cached;
  return {
    get() {
      if (!cached) {
        cached = client.get('/health')
          .then(({ data }) => normalize(data?.capabilities))
          .catch(() => unavailable);
      }
      return cached;
    },
  };
}

export const capabilityService = createCapabilityService();
