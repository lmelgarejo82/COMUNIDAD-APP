const { pool } = require('../../db');

async function masterTicketProcessor(masterId) {
  const client = await pool.connect();
  try {
    const { rows: masterRows } = await client.query(
      'SELECT * FROM master_tickets WHERE id = $1', [masterId]
    );
    const master = masterRows[0];
    if (!master || master.status !== 'active') return;

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

    for (const unitId of unitIds) {
      const { rows: unitRows } = await client.query(
        `SELECT u.unit_code, f.id AS floor_id, f.building_id,
                b.complex_id, cx.community_id
         FROM units u
         JOIN floors f ON u.floor_id = f.id
         JOIN buildings b ON f.building_id = b.id
         JOIN complexes cx ON b.complex_id = cx.id
         WHERE u.id = $1`,
        [unitId]
      );
      const unit = unitRows[0];
      if (!unit) continue;

      const { rows: ownerRows } = await client.query(
        `SELECT uo.user_id FROM unit_ownerships uo
         WHERE uo.unit_id = $1
           AND (uo.end_date IS NULL OR uo.end_date > NOW())
         ORDER BY uo.is_primary DESC
         LIMIT 1`,
        [unitId]
      );

      const ticketUserId = ownerRows[0]?.user_id || master.created_by;

      const existing = await client.query(
        `SELECT id FROM tickets
         WHERE master_ticket_id = $1 AND unit_id = $2`,
        [masterId, unitId]
      );
      if (existing.rows.length > 0) continue;

      await client.query(
        `INSERT INTO tickets (community_id, user_id, unit_number, unit_id, title, description, file_url, master_ticket_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [master.community_id, ticketUserId, unit.unit_code, unitId,
         master.title, master.description, master.file_url, masterId]
      );
    }

    console.log(`Sub-tickets generados para master ${masterId}: ${unitIds.size} unidades procesadas.`);
  } catch (err) {
    console.error(`Error procesando master ticket ${masterId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = masterTicketProcessor;
