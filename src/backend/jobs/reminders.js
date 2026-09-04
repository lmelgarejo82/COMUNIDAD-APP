const cron = require('node-cron');
const { Expense } = require('../models/Expense');
const { Notification } = require('../models/Notification');

function startReminders() {
  // Todos los días a las 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Ejecutando recordatorios de expensas...');

    try {
      // Aviso: vence en 2 días
      const dueSoon = await Expense.findDueSoon(2);
      for (const item of dueSoon) {
        if (item.user_id) {
          await Notification.create({
            user_id: item.user_id,
            type: 'reminder',
            title: 'Expensa próxima a vencer',
            message: `Tu expensa "${item.description}" vence en 2 días (${new Date(item.due_date).toLocaleDateString('es-AR')}). No olvides pagarla.`,
            reference_id: item.id,
          });
        }
      }
      if (dueSoon.length > 0) console.log(`[CRON] ${dueSoon.length} recordatorios de vencimiento enviados.`);

      // Aviso: vencido ayer
      const overdue = await Expense.findOverdue();
      for (const item of overdue) {
        const lateFee = parseFloat(item.amount_owed) * (parseFloat(item.late_fee_percent || 0) / 100);
        if (item.user_id) {
          await Notification.create({
            user_id: item.user_id,
            type: 'reminder',
            title: 'Pago vencido',
            message: `Tu expensa "${item.description}" está vencida desde ayer. Se aplicará un recargo del ${item.late_fee_percent}% ($${lateFee.toFixed(2)}). Regularizá tu situación.`,
            reference_id: item.id,
          });
        }
      }
      if (overdue.length > 0) console.log(`[CRON] ${overdue.length} avisos de mora enviados.`);

    } catch (err) {
      console.error('[CRON] Error en recordatorios:', err);
    }
  });

  console.log('[CRON] Recordatorios de expensas programados (9:00 AM diario)');
}

module.exports = { startReminders };
