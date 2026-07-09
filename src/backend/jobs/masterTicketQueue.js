const Bull = require('bull');
const { pool } = require('../db');
const { Notification } = require('../models/Notification');
const whatsapp = require('../services/whatsapp');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const WHATSAPP_RATE_MS = parseInt(process.env.WHATSAPP_RATE_MS || '350', 10);
const NOTIFY_CONCURRENCY = parseInt(process.env.NOTIFY_CONCURRENCY || '5', 10);

let queue = null;
let queueReady = false;

function createQueue() {
  try {
    queue = new Bull('generate-subtickets', REDIS_URL, {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    queue.on('ready', () => { queueReady = true; console.log('[master-ticket] Bull queue ready'); });
    queue.on('error', (err) => { console.error('[master-ticket] Queue error:', err.message); queueReady = false; });
    queue.on('failed', (job, err) => {
      console.error(`[master-ticket] Job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`);
    });

    queue.process(processJob);
  } catch (err) {
    console.warn('[master-ticket] Bull/Redis no disponible — jobs ejecutados sincrónicamente:', err.message);
    queue = null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processWithRateLimit(tasks, concurrency, delayMs) {
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn => fn()));
    results.push(...settled);
    if (i + concurrency < tasks.length && delayMs > 0) {
      await delay(delayMs);
    }
  }
  return results;
}

async function sendNotifications(master, ticketsWithOwner) {
  const whatsappTasks = [];
  const inAppTasks = [];

  for (const item of ticketsWithOwner) {
    if (!item.userEmail) continue;

    inAppTasks.push(async () => {
      try {
        const { rows: u } = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [item.userEmail]);
        if (u[0]) {
          await Notification.create({
            user_id: u[0].id,
            type: 'ticket_new',
            title: master.title,
            message: `${master.description || 'Nuevo ticket generado desde un aviso general.'} — Unidad ${item.unitCode}`,
            reference_id: item.ticketId,
          });
        }
      } catch (err) {
        console.error(`[master-ticket] Error notificación in-app para ${item.userEmail}:`, err.message);
      }
    });

    whatsappTasks.push(async () => {
      try {
        const { rows: u } = await pool.query(
          'SELECT phone FROM users WHERE email = $1 AND phone IS NOT NULL LIMIT 1',
          [item.userEmail]
        );
        if (u[0]?.phone) {
          await whatsapp.sendExpenseNotification({
            toPhone: u[0].phone,
            unitNumber: item.unitCode,
            description: master.title,
            amount: '-',
            dueDate: '-',
          });
        }
      } catch (err) {
        console.error(`[master-ticket] Error WhatsApp para ${item.userEmail}:`, err.message);
      }
    });
  }

  // In-app notifications: fast batch
  console.log(`[master-ticket] Enviando ${inAppTasks.length} notificaciones in-app...`);
  await processWithRateLimit(inAppTasks, NOTIFY_CONCURRENCY, 0);

  // WhatsApp: rate-limited
  console.log(`[master-ticket] Enviando ${whatsappTasks.length} notificaciones WhatsApp con rate limiting...`);
  await processWithRateLimit(whatsappTasks, 1, WHATSAPP_RATE_MS);

  console.log('[master-ticket] Notificaciones completadas.');
}

async function processJob(job) {
  const { masterId } = job.data;
  const client = await pool.connect();

  try {
    const { rows: masterRows } = await client.query(
      'SELECT * FROM master_tickets WHERE id = $1', [masterId]
    );
    const master = masterRows[0];
    if (!master) throw new Error(`Master ticket ${masterId} no encontrado`);
    if (master.status !== 'active') {
      console.log(`[master-ticket] Master ${masterId} ya procesado (status=${master.status}), omitiendo.`);
      return { skipped: true, reason: `status=${master.status}` };
    }

    const { rows: affected } = await client.query(
      'SELECT * FROM master_ticket_units WHERE master_ticket_id = $1', [masterId]
    );

    const unitIds = new Set();
    for (const row of affected) {
      if (row.unit_id) {
        unitIds.add(row.unit_id);
      } else if (row.floor_id) {
        const { rows: floorUnits } = await client.query(
          'SELECT id FROM units WHERE floor_id = $1', [row.floor_id]
        );
        floorUnits.forEach(u => unitIds.add(u.id));
      } else if (row.building_id) {
        const { rows: buildingUnits } = await client.query(
          `SELECT u.id FROM units u
           JOIN floors f ON u.floor_id = f.id
           WHERE f.building_id = $1`,
          [row.building_id]
        );
        buildingUnits.forEach(u => unitIds.add(u.id));
      }
    }

    if (unitIds.size === 0) {
      await client.query(
        "UPDATE master_tickets SET status = 'open', updated_at = NOW() WHERE id = $1",
        [masterId]
      );
      return { units: 0, status: 'open' };
    }

    const ticketsWithOwner = [];

    for (const unitId of unitIds) {
      const { rows: unitRows } = await client.query(
        `SELECT u.unit_code FROM units u WHERE u.id = $1`, [unitId]
      );
      const unit = unitRows[0];
      if (!unit) continue;

      const { rows: ownerRows } = await client.query(
        `SELECT uo.user_id, us.email FROM unit_ownerships uo
         JOIN users us ON uo.user_id = us.id
         WHERE uo.unit_id = $1
           AND (uo.end_date IS NULL OR uo.end_date > NOW())
         ORDER BY uo.is_primary DESC
         LIMIT 1`,
        [unitId]
      );

      const ticketUserId = ownerRows[0]?.user_id || master.created_by;
      const ownerEmail = ownerRows[0]?.email || null;

      const existing = await client.query(
        'SELECT id FROM tickets WHERE master_ticket_id = $1 AND unit_id = $2',
        [masterId, unitId]
      );
      if (existing.rows.length > 0) continue;

      const { rows: ticketRows } = await client.query(
        `INSERT INTO tickets (community_id, user_id, unit_number, unit_id, title, description, file_url, master_ticket_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [master.community_id, ticketUserId, unit.unit_code, unitId,
         master.title, master.description, master.file_url, masterId]
      );

      ticketsWithOwner.push({
        ticketId: ticketRows[0].id,
        unitCode: unit.unit_code,
        userEmail: ownerEmail,
      });
    }

    await client.query(
      "UPDATE master_tickets SET status = 'open', updated_at = NOW() WHERE id = $1",
      [masterId]
    );

    console.log(`[master-ticket] ${ticketsWithOwner.length} sub-tickets creados para master ${masterId}.`);

    // Fire-and-forget notifications (don't block commit)
    setImmediate(() => {
      sendNotifications(master, ticketsWithOwner).catch(err => {
        console.error(`[master-ticket] Fallo en notificaciones para master ${masterId}:`, err.message);
      });
    });

    return { units: ticketsWithOwner.length, status: 'open' };
  } catch (err) {
    console.error(`[master-ticket] Error procesando master ${masterId}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function enqueueGeneration(masterId) {
  if (!queue) {
    console.warn(`[master-ticket] Bull no disponible. Ejecutando sincrónicamente master ${masterId}.`);
    try {
      return await processJob({ data: { masterId } });
    } catch (err) {
      throw err;
    }
  }
  return queue.add({ masterId }, { jobId: `master-${masterId}-${Date.now()}` });
}

function init() {
  createQueue();
}

module.exports = { enqueueGeneration, init };
