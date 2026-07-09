const { MercadoPagoConfig, Preference } = require('mercadopago');
const { Expense } = require('../models/Expense');
const { PaymentTransaction } = require('../models/PaymentTransaction');
const { Notification } = require('../models/Notification');

function getClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MP_ACCESS_TOKEN no configurado');
  }
  return new MercadoPagoConfig({ accessToken });
}

exports.createPreference = async (req, res) => {
  try {
    const { unitExpenseId } = req.body;
    if (!unitExpenseId) {
      return res.status(400).json({ error: 'unitExpenseId es requerido' });
    }

    const unit = await Expense.findUnitExpenseById(unitExpenseId);
    if (!unit) {
      return res.status(404).json({ error: 'Expensa no encontrada' });
    }

    if (unit.status !== 'pending') {
      return res.status(400).json({ error: 'Esta expensa ya fue pagada o está en revisión' });
    }

    const user = await require('../models/User').User.findById(req.user.id);
    if (!user || user.community_id !== req.communityId || user.unit_number !== unit.unit_number || unit.community_id !== req.communityId) {
      return res.status(403).json({ error: 'No podés pagar expensas de otra unidad' });
    }

    const client = getClient();
    const preference = new Preference(client);

    const amount = parseFloat(unit.amount_owed).toFixed(2);
    const externalRef = `expense-${unitExpenseId}-${Date.now()}`;

    const result = await preference.create({
      body: {
        items: [
          {
            id: String(unitExpenseId),
            title: `Expensa: ${unit.description}`,
            description: `Unidad ${unit.unit_number} — ${unit.due_date ? new Date(unit.due_date).toLocaleDateString('es-AR') : ''}`,
            quantity: 1,
            currency_id: 'ARS',
            unit_price: Number(amount),
          },
        ],
        external_reference: externalRef,
        back_urls: {
          success: process.env.MP_SUCCESS_URL || 'http://localhost:5173/expensas',
          failure: process.env.MP_FAILURE_URL || 'http://localhost:5173/expensas',
          pending: process.env.MP_PENDING_URL || 'http://localhost:5173/expensas',
        },
        auto_return: 'approved',
        notification_url: process.env.MP_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/mercadopago',
      },
    });

    await PaymentTransaction.create({
      unit_expense_id: unitExpenseId,
      preference_id: result.id,
      external_reference: externalRef,
      fee_amount: parseFloat((Number(amount) * 0.0399 + 10).toFixed(2)), // 3.99% + $10 aprox
    });

    // Marcar como in_review al generar la preferencia
    await Expense.updateUnitStatus(unitExpenseId, 'in_review');

    res.json({
      init_point: result.init_point,
      preference_id: result.id,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (err) {
    console.error('Error en createPreference:', err);
    res.status(500).json({ error: 'Error al crear preferencia de pago' });
  }
};

exports.webhook = async (req, res) => {
  try {
    const { type, data, action } = req.body;

    // MercadoPago siempre responde 200 OK primero
    if (type === 'payment' && action === 'payment.created') {
      const paymentId = data?.id;
      if (!paymentId) return res.sendStatus(200);

      console.log(`[MP Webhook] Pago recibido: ${paymentId}`);

      const { Payment } = require('mercadopago');
      const client = getClient();
      const paymentApi = new Payment(client);

      const payment = await paymentApi.get({ id: paymentId });

      if (payment.status === 'approved') {
        const externalRef = payment.external_reference;
        const [prefix, unitExpenseId, timestamp] = (externalRef || '').split('-');

        if (prefix === 'expense' && unitExpenseId) {
          const tx = await PaymentTransaction.findByPreferenceId(payment.id);
          await PaymentTransaction.updateStatus(payment.id, 'approved', String(paymentId), payment);

          if (tx) {
            const unit = await Expense.findUnitExpenseById(tx.unit_expense_id);
            await Expense.confirmUnitExpense(tx.unit_expense_id);

            if (unit) {
              const user = await require('../models/User').User.findByUnit(unit.community_id, unit.unit_number);
              if (user) {
                await Notification.create({
                  user_id: user.id,
                  type: 'payment',
                  title: 'Pago confirmado',
                  message: `Tu pago de $${parseFloat(unit.amount_owed).toFixed(2)} fue aprobado automáticamente.`,
                  reference_id: tx.unit_expense_id,
                });
              }
            }
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[MP Webhook] Error:', err);
    res.sendStatus(500);
  }
};
