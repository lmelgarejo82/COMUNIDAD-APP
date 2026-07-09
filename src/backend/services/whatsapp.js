const twilio = require('twilio');

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

const whatsapp = {
  async sendExpenseNotification({ toPhone, unitNumber, description, amount, dueDate }) {
    const client = getClient();
    if (!client) return;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    try {
      await client.messages.create({
        from: `whatsapp:${from}`,
        to: `whatsapp:${toPhone}`,
        body: `Comunidad App — Nueva expensa\n\nUnidad: ${unitNumber}\nConcepto: ${description}\nMonto: $${amount}\nVence: ${dueDate}\n\nPagala desde la app en la sección Expensas.`,
      });
    } catch (err) {
      console.error('[WhatsApp] Error al enviar notificación de expensa:', err.message);
    }
  },

  async sendPaymentConfirmation({ toPhone, unitNumber, amount }) {
    const client = getClient();
    if (!client) return;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    try {
      await client.messages.create({
        from: `whatsapp:${from}`,
        to: `whatsapp:${toPhone}`,
        body: `Comunidad App — Pago confirmado\n\nUnidad ${unitNumber} pagó $${amount}.\nEl pago fue aprobado automáticamente.`,
      });
    } catch (err) {
      console.error('[WhatsApp] Error al enviar confirmación:', err.message);
    }
  },
};

module.exports = whatsapp;
