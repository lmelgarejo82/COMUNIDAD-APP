const { ChatContext } = require('../models/ChatContext');
const { getCapabilities } = require('../config/capabilities');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

const conversationHistory = new Map();

exports.query = async (req, res) => {
  const capabilities = getCapabilities();
  if (!capabilities.aiAssistant) {
    return res.status(503).json({
      code: 'CAPABILITY_UNAVAILABLE',
      message: 'El asistente virtual no está disponible.',
    });
  }

  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    // Contexto del usuario desde la DB
    const contextData = await ChatContext.build(req.user.id);
    if (!contextData.user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const ctx = contextData.context;

    const paymentGuidance = capabilities.mercadoPago
      ? 'Indicá que puede enviar el comprobante para revisión administrativa y que, si lo prefiere, también puede usar el botón "Pagar con MP" disponible para expensas pendientes.'
      : 'Indicá que puede pagar por los medios informados por la administración y enviar el comprobante desde la sección Expensas para su revisión administrativa.';

    const systemPrompt = `Eres un asistente virtual de "Comunidad App", una plataforma de gestión de comunidades residenciales. Hablás en español, sos amable y conciso.

DATOS DEL USUARIO:
- Unidad: ${ctx.unit_number}
- Rol: ${ctx.role}
- Saldo pendiente total: $${ctx.saldo_pendiente.toLocaleString()} (${ctx.pendientes_count} expensas sin pagar)
- Última expensa pagada: ${ctx.ultima_expensa_pagada}
- Anuncios sin leer: ${ctx.anuncios_no_leidos}
- Próximas expensas: ${ctx.proximas_expensas.length > 0 ? ctx.proximas_expensas.join(' | ') : 'Ninguna pendiente'}
- Amenities disponibles: ${ctx.amenities.length > 0 ? ctx.amenities.join(', ') : 'No hay amenities registrados'}

INSTRUCCIONES:
1. Respondé preguntas sobre expensas, pagos, saldos, anuncios, amenities, reglamentos.
2. Si el usuario pregunta por su saldo, respondé con el monto exacto y las fechas de vencimiento.
3. Si el usuario quiere PAGAR una expensa y tiene saldo pendiente: ${paymentGuidance}
4. NO inventes números ni fechas. Usá solo los datos provistos.
5. Si el usuario pregunta algo que no está en los datos (ej. "cuándo es la próxima reunión"), decile que consultes con la administración.
6. Mantené respuestas breves (máximo 3-4 oraciones).`;

    // Historial de conversación (últimos 10 mensajes)
    const userId = req.user.id;
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, []);
    }
    const history = conversationHistory.get(userId);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('DeepSeek API error:', response.status, errBody);
      return res.status(502).json({ error: 'Error al comunicarse con el asistente' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Lo siento, no pude procesar tu consulta.';

    // Guardar en historial
    if (history.length > 20) history.splice(0, history.length - 20);
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });

    res.json({ reply });
  } catch (err) {
    console.error('Error en chat query:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
