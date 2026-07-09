const { pool } = require('../db');
const { enqueueGeneration } = require('../jobs/masterTicketQueue');

function getQuery(client) {
  return client || pool;
}

const MasterTicket = {
  async createMasterTicket({ community_id, title, description, type, file_url, created_by }, affectedUnits = [], client = null) {
    const db = getQuery(client);

    const { rows } = await db.query(
      `INSERT INTO master_tickets (community_id, title, description, type, file_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [community_id, title, description || null, type || 'general', file_url || null, created_by]
    );
    const master = rows[0];

    if (affectedUnits.length > 0) {
      const values = [];
      const params = [];
      affectedUnits.forEach((entry) => {
        const unitId = entry.unit_id || null;
        const buildingId = entry.building_id || null;
        const floorId = entry.floor_id || null;
        if (!unitId && !buildingId && !floorId) return;
        const base = params.length;
        params.push(master.id, unitId, buildingId, floorId);
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      });

      if (values.length > 0) {
        await db.query(
          `INSERT INTO master_ticket_units (master_ticket_id, unit_id, building_id, floor_id)
           VALUES ${values.join(', ')}`,
          params
        );
      }
    }

    return master;
  },

  async getMasterTicket(id) {
    const { rows: masterRows } = await pool.query(
      `SELECT mt.*, u.email AS created_by_email
       FROM master_tickets mt
       LEFT JOIN users u ON mt.created_by = u.id
       WHERE mt.id = $1`,
      [id]
    );
    const master = masterRows[0] || null;
    if (!master) return null;

    const [affected, subTickets] = await Promise.all([
      pool.query(
        `SELECT mtu.*, u.unit_code, b.name AS building_name, f.number AS floor_number
         FROM master_ticket_units mtu
         LEFT JOIN units u ON mtu.unit_id = u.id
         LEFT JOIN floors f ON mtu.floor_id = f.id
         LEFT JOIN buildings b ON mtu.building_id = b.id
         WHERE mtu.master_ticket_id = $1`,
        [id]
      ),
      pool.query(
        `SELECT t.*, u.email AS user_email
         FROM tickets t
         LEFT JOIN users u ON t.user_id = u.id
         WHERE t.master_ticket_id = $1
         ORDER BY t.created_at`,
        [id]
      ),
    ]);

    return {
      ...master,
      affected_units: affected.rows,
      sub_tickets: subTickets.rows,
    };
  },

  async listMasterTickets(communityId, { status, type, page = 1, limit = 10 } = {}) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['mt.community_id = $1'];
    const params = [communityId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`mt.status = $${paramIdx++}`);
      params.push(status);
    }
    if (type) {
      conditions.push(`mt.type = $${paramIdx++}`);
      params.push(type);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM master_tickets mt ${whereClause}`, params
    );
    const total = parseInt(countRows[0].count);

    const { rows } = await pool.query(
      `SELECT mt.*, u.email AS created_by_email,
              (SELECT COUNT(*) FROM tickets t WHERE t.master_ticket_id = mt.id) AS sub_tickets_count,
              (SELECT COUNT(*) FROM tickets t WHERE t.master_ticket_id = mt.id AND t.status != 'resolved') AS pending_count
       FROM master_tickets mt
       LEFT JOIN users u ON mt.created_by = u.id
       ${whereClause}
       ORDER BY mt.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    return {
      data: rows,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)) || 1,
    };
  },

  async updateMasterTicket(id, { title, description, type, status, file_url }) {
    const fields = [];
    const params = [id];

    if (title !== undefined) { fields.push(`title = $${params.length + 1}`); params.push(title); }
    if (description !== undefined) { fields.push(`description = $${params.length + 1}`); params.push(description); }
    if (type !== undefined) { fields.push(`type = $${params.length + 1}`); params.push(type); }
    if (status !== undefined) { fields.push(`status = $${params.length + 1}`); params.push(status); }
    if (file_url !== undefined) { fields.push(`file_url = $${params.length + 1}`); params.push(file_url); }

    if (fields.length === 0) {
      const { rows } = await pool.query('SELECT * FROM master_tickets WHERE id = $1', [id]);
      return rows[0] || null;
    }

    fields.push('updated_at = NOW()');
    const { rows } = await pool.query(
      `UPDATE master_tickets SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return rows[0] || null;
  },

  async resolveSubTicket(ticketId) {
    const { rows: ticketRows } = await pool.query(
      `UPDATE tickets SET status = 'resolved', updated_at = NOW()
       WHERE id = $1 AND status != 'resolved'
       RETURNING *`,
      [ticketId]
    );
    const ticket = ticketRows[0];
    if (!ticket) return { ticket: null, master_closed: false };

    if (ticket.master_ticket_id) {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) AS remaining FROM tickets
         WHERE master_ticket_id = $1 AND status != 'resolved'`,
        [ticket.master_ticket_id]
      );
      if (parseInt(countRows[0].remaining) === 0) {
        await pool.query(
          `UPDATE master_tickets SET status = 'closed', updated_at = NOW()
           WHERE id = $1`,
          [ticket.master_ticket_id]
        );
        return { ticket, master_closed: true };
      }
    }

    return { ticket, master_closed: false };
  },

  async getRemainingSubTickets(masterId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
              COUNT(*) FILTER (WHERE status != 'resolved') AS remaining
       FROM tickets WHERE master_ticket_id = $1`,
      [masterId]
    );
    return {
      total: parseInt(rows[0].total),
      resolved: parseInt(rows[0].resolved),
      remaining: parseInt(rows[0].remaining),
    };
  },

  async enqueueSubTicketGeneration(masterId) {
    try {
      const job = await enqueueGeneration(masterId);
      return { enqueued: true, jobId: job?.id || null, units: job?.units };
    } catch (err) {
      console.error('Error enqueuing sub-ticket generation:', err);
      return { enqueued: false, error: err.message };
    }
  },
};

module.exports = { MasterTicket };
