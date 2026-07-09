const { pool } = require('../db');
const { cacheOrFetch, CACHE_TTL } = require('../cache');

function getQuery(client) {
  return client || pool;
}

const Hierarchy = {
  async getComplexes(communityId = null, client = null) {
    const db = getQuery(client);
    let query = 'SELECT * FROM complexes WHERE deleted_at IS NULL';
    const params = [];
    if (communityId) {
      query += ' AND community_id = $1';
      params.push(communityId);
    }
    query += ' ORDER BY name';
    const { rows } = await db.query(query, params);
    return rows;
  },

  async getBuildings(complexId, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      'SELECT * FROM buildings WHERE complex_id = $1 AND deleted_at IS NULL ORDER BY sort_order, name',
      [complexId]
    );
    return rows;
  },

  async getFloors(buildingId, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      'SELECT * FROM floors WHERE building_id = $1 AND deleted_at IS NULL ORDER BY sort_order, number',
      [buildingId]
    );
    return rows;
  },

  async getUnits({ floorId, buildingId, complexId } = {}, client = null) {
    const db = getQuery(client);
    let query = `SELECT u.*, f.number AS floor_number, f.name AS floor_name,
                        b.id AS building_id, b.name AS building_name,
                        cx.id AS complex_id, cx.name AS complex_name
                 FROM units u
                 JOIN floors f ON u.floor_id = f.id
                 JOIN buildings b ON f.building_id = b.id
                 JOIN complexes cx ON b.complex_id = cx.id`;
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (floorId) {
      conditions.push(`u.floor_id = $${paramIdx++}`);
      params.push(floorId);
    }
    if (buildingId) {
      conditions.push(`f.building_id = $${paramIdx++}`);
      params.push(buildingId);
    }
    if (complexId) {
      conditions.push(`b.complex_id = $${paramIdx++}`);
      params.push(complexId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY f.sort_order, f.number, u.sort_order, u.unit_code';
    const { rows } = await db.query(query, params);
    return rows;
  },

  async searchUnits(communityId, { q = '', complexId = null, limit = 20 } = {}, client = null) {
    const db = getQuery(client);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 20);
    const params = [communityId];
    const conditions = [
      'cx.community_id = $1',
      'cx.deleted_at IS NULL',
      'COALESCE(u.is_active, TRUE) = TRUE',
    ];
    let paramIdx = 2;

    if (complexId) {
      conditions.push(`cx.id = $${paramIdx++}`);
      params.push(complexId);
    }

    const search = String(q || '').trim();
    if (search) {
      conditions.push(`(
        u.unit_code ILIKE $${paramIdx}
        OR COALESCE(f.name, '') ILIKE $${paramIdx}
        OR CAST(f.number AS TEXT) ILIKE $${paramIdx}
        OR b.name ILIKE $${paramIdx}
        OR cx.name ILIKE $${paramIdx}
        OR CONCAT_WS(' ', b.name, f.name, f.number, u.unit_code, cx.name) ILIKE $${paramIdx}
        OR CONCAT_WS(' ', b.name, f.number, u.unit_code, cx.name) ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx += 1;
    }

    params.push(safeLimit);

    const { rows } = await db.query(
      `SELECT
         u.id AS unit_id,
         u.unit_code,
         u.unit_code AS unit_label,
         f.name AS floor_name,
         f.number AS floor_number,
         b.name AS building_name,
         cx.id AS complex_id,
         cx.name AS complex_name,
         CONCAT_WS(
           ' · ',
           b.name,
           CASE
             WHEN f.name IS NOT NULL AND f.name <> '' THEN f.name
             ELSE 'Piso ' || f.number::text
           END,
           'Unidad ' || u.unit_code
         ) AS display_path
       FROM units u
       JOIN floors f ON u.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY cx.name, b.sort_order, b.name, f.sort_order, f.number, u.sort_order, u.unit_code
       LIMIT $${paramIdx}`,
      params
    );

    return rows;
  },

  async getUnitTree(complexId, client = null) {
    if (client) return _getUnitTree(complexId, client);
    return cacheOrFetch(`hierarchy:tree:${complexId}`, CACHE_TTL.LONG, () => _getUnitTree(complexId));
  },

  // ──────────────────────────────────────────────
  // COMPLEX CRUD
  // ──────────────────────────────────────────────

  async createComplex({ name, address, community_id, access_code }, client = null) {
    const db = getQuery(client);
    const accessCode = access_code || `COMPLEX${Date.now().toString(36).toUpperCase()}`;
    const { rows: [comm] } = await db.query(
      `INSERT INTO communities (name, address, access_code) VALUES ($1, $2, $3)
       ON CONFLICT (access_code) DO UPDATE SET name = $1 RETURNING *`,
      [name, address, accessCode]
    );
    const { rows: [complex] } = await db.query(
      `INSERT INTO complexes (name, address, community_id) VALUES ($1, $2, $3) RETURNING *`,
      [name, address, comm.id]
    );
    return complex;
  },

  async updateComplex(id, { name, address }, client = null) {
    const db = getQuery(client);
    const fields = []; const params = [id];
    if (name !== undefined) { fields.push(`name = $${params.length + 1}`); params.push(name); }
    if (address !== undefined) { fields.push(`address = $${params.length + 1}`); params.push(address); }
    if (fields.length === 0) return null;
    const { rows } = await db.query(`UPDATE complexes SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, params);
    if (rows[0]) {
      await db.query('UPDATE communities SET name = $1, address = $2 WHERE id = $3', [rows[0].name, rows[0].address, rows[0].community_id]);
    }
    return rows[0] || null;
  },

  async deleteComplex(id, client = null) {
    const db = getQuery(client);
    const { rows: count } = await db.query(
      'SELECT COUNT(*) AS cnt FROM buildings WHERE complex_id = $1 AND deleted_at IS NULL', [id]
    );
    if (parseInt(count[0].cnt) > 0) throw new Error('COMPLEX_HAS_BUILDINGS');

    const { rows } = await db.query(
      'UPDATE complexes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *', [id]
    );
    if (rows[0]) {
      await db.query(
        'UPDATE communities SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [rows[0].community_id]
      );
    }
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────
  // BUILDING CRUD (updated with auto-floor)
  // ──────────────────────────────────────────────

  async createBuilding({ complex_id, name, address, building_type, sort_order, autoFloor, totalLots }, client = null) {
    const db = getQuery(client);
    const { rows: [building] } = await db.query(
      `INSERT INTO buildings (complex_id, name, address, building_type, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [complex_id, name, address || null, building_type || 'tower', sort_order || 0]
    );

    let floor = null;
    let units = [];

    if (building_type === 'block' || building_type === 'house' || autoFloor) {
      const { rows: [fl] } = await db.query(
        `INSERT INTO floors (building_id, number, name, sort_order) VALUES ($1, 1, 'Planta Baja', 1) RETURNING *`,
        [building.id]
      );
      floor = fl;

      const lots = totalLots || 1;
      const values = []; const params = [];
      for (let i = 1; i <= lots; i++) {
        const code = building_type === 'house' ? `Casa ${i}` : `Lote ${i}`;
        const base = params.length;
        params.push(fl.id, code);
        values.push(`($${base + 1}, $${base + 2})`);
      }
      const { rows: batch } = await db.query(
        `INSERT INTO units (floor_id, unit_code) VALUES ${values.join(', ')} RETURNING *`, params
      );
      units = batch;
    }

    return { building, floor, units };
  },

  async getBuildingById(id) {
    const { rows } = await pool.query(
      `SELECT b.*, cx.community_id FROM buildings b
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE b.id = $1`, [id]
    );
    return rows[0] || null;
  },

  async updateBuilding(id, { name, address, building_type, sort_order }, client = null) {
    const db = getQuery(client);
    const fields = [];
    const params = [id];
    if (name !== undefined) { fields.push(`name = $${params.length + 1}`); params.push(name); }
    if (address !== undefined) { fields.push(`address = $${params.length + 1}`); params.push(address); }
    if (building_type !== undefined) { fields.push(`building_type = $${params.length + 1}`); params.push(building_type); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${params.length + 1}`); params.push(sort_order); }
    if (fields.length === 0) return this.getBuildingById(id);
    const { rows } = await db.query(
      `UPDATE buildings SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, params
    );
    return rows[0] || null;
  },

  async deleteBuilding(id, client = null) {
    const db = getQuery(client);
    const { rows: floorCount } = await db.query(
      'SELECT COUNT(*) AS cnt FROM floors WHERE building_id = $1', [id]
    );
    if (parseInt(floorCount[0].cnt) > 0) {
      const { rows: unitCount } = await db.query(
        `SELECT COUNT(*) AS cnt FROM units u
         JOIN floors f ON u.floor_id = f.id WHERE f.building_id = $1`, [id]
      );
      if (parseInt(unitCount[0].cnt) > 0) {
        throw new Error('BUILDING_HAS_UNITS');
      }
      throw new Error('BUILDING_HAS_FLOORS');
    }
    const { rows } = await db.query(
      'DELETE FROM buildings WHERE id = $1 RETURNING *', [id]
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────
  // FLOOR CRUD
  // ──────────────────────────────────────────────

  async createFloor({ building_id, number, name, sort_order }, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      `INSERT INTO floors (building_id, number, name, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [building_id, number, name || null, sort_order || 0]
    );
    return rows[0];
  },

  async getFloorById(id) {
    const { rows } = await pool.query(
      `SELECT f.*, b.complex_id FROM floors f
       JOIN buildings b ON f.building_id = b.id
       WHERE f.id = $1`, [id]
    );
    return rows[0] || null;
  },

  async updateFloor(id, { number, name, sort_order }, client = null) {
    const db = getQuery(client);
    const fields = [];
    const params = [id];
    if (number !== undefined) { fields.push(`number = $${params.length + 1}`); params.push(number); }
    if (name !== undefined) { fields.push(`name = $${params.length + 1}`); params.push(name); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${params.length + 1}`); params.push(sort_order); }
    if (fields.length === 0) return this.getFloorById(id);
    const { rows } = await db.query(
      `UPDATE floors SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, params
    );
    return rows[0] || null;
  },

  async deleteFloor(id, client = null) {
    const db = getQuery(client);
    const { rows: unitCount } = await db.query(
      'SELECT COUNT(*) AS cnt FROM units WHERE floor_id = $1 AND is_active = TRUE', [id]
    );
    if (parseInt(unitCount[0].cnt) > 0) {
      throw new Error('FLOOR_HAS_ACTIVE_UNITS');
    }
    const { rows } = await db.query(
      'DELETE FROM floors WHERE id = $1 RETURNING *', [id]
    );
    return rows[0] || null;
  },

  // ──────────────────────────────────────────────
  // UNIT CRUD
  // ──────────────────────────────────────────────

  async createUnit({ floor_id, unit_code, unit_type, area_m2, coef_percent, sort_order }, client = null) {
    const db = getQuery(client);

    const { rows: floorRows } = await db.query('SELECT id FROM floors WHERE id = $1', [floor_id]);
    if (!floorRows[0]) throw new Error('FLOOR_NOT_FOUND');

    const { rows } = await db.query(
      `INSERT INTO units (floor_id, unit_code, unit_type, area_m2, coef_percent, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [floor_id, unit_code, unit_type || null, area_m2 || null, coef_percent || null, sort_order || 0]
    );
    return rows[0];
  },

  async getUnitById(id) {
    const { rows } = await pool.query(
      `SELECT u.*, f.number AS floor_number, f.name AS floor_name,
              b.id AS building_id, b.name AS building_name,
              cx.id AS complex_id, cx.name AS complex_name
       FROM units u
       JOIN floors f ON u.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE u.id = $1`, [id]
    );
    return rows[0] || null;
  },

  async updateUnit(id, { unit_code, unit_type, area_m2, coef_percent, sort_order, is_active }, client = null) {
    const db = getQuery(client);
    const fields = [];
    const params = [id];
    if (unit_code !== undefined) { fields.push(`unit_code = $${params.length + 1}`); params.push(unit_code); }
    if (unit_type !== undefined) { fields.push(`unit_type = $${params.length + 1}`); params.push(unit_type); }
    if (area_m2 !== undefined) { fields.push(`area_m2 = $${params.length + 1}`); params.push(area_m2); }
    if (coef_percent !== undefined) { fields.push(`coef_percent = $${params.length + 1}`); params.push(coef_percent); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${params.length + 1}`); params.push(sort_order); }
    if (is_active !== undefined) { fields.push(`is_active = $${params.length + 1}`); params.push(is_active); }
    if (fields.length === 0) return this.getUnitById(id);
    const { rows } = await db.query(
      `UPDATE units SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, params
    );
    return rows[0] || null;
  },

  async deleteUnit(id, client = null) {
    const db = getQuery(client);
    const { rows: depCount } = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM unit_expenses WHERE unit_id = $1) +
         (SELECT COUNT(*) FROM unit_ownerships WHERE unit_id = $1 AND end_date IS NULL) +
         (SELECT COUNT(*) FROM tickets WHERE unit_id = $1 AND status IN ('sent','in_progress')) AS cnt`, [id]
    );
    if (parseInt(depCount[0].cnt) > 0) {
      const { rows } = await db.query(
        "UPDATE units SET is_active = FALSE WHERE id = $1 RETURNING *", [id]
      );
      return rows[0] || null;
    }
    const { rows } = await db.query(
      'DELETE FROM units WHERE id = $1 RETURNING *', [id]
    );
    return rows[0] || null;
  },

  async moveUnit(unitId, newFloorId, client = null) {
    const db = getQuery(client);

    const { rows: unitRows } = await db.query('SELECT * FROM units WHERE id = $1', [unitId]);
    if (!unitRows[0]) throw new Error('UNIT_NOT_FOUND');

    const { rows: floorRows } = await db.query(
      `SELECT f.id, f.building_id, b.complex_id FROM floors f
       JOIN buildings b ON f.building_id = b.id WHERE f.id = $1`, [newFloorId]
    );
    if (!floorRows[0]) throw new Error('FLOOR_NOT_FOUND');

    const { rows } = await db.query(
      `UPDATE units SET floor_id = $2 WHERE id = $1 RETURNING *`, [unitId, newFloorId]
    );
    return rows[0] || null;
  },

  async moveFloor(floorId, newBuildingId, client = null) {
    const db = getQuery(client);
    const { rows: floorRows } = await db.query('SELECT id FROM floors WHERE id = $1 AND deleted_at IS NULL', [floorId]);
    if (!floorRows[0]) throw new Error('FLOOR_NOT_FOUND');
    const { rows: buildingRows } = await db.query('SELECT id, complex_id FROM buildings WHERE id = $1 AND deleted_at IS NULL', [newBuildingId]);
    if (!buildingRows[0]) throw new Error('BUILDING_NOT_FOUND');
    const { rows } = await db.query(
      'UPDATE floors SET building_id = $2 WHERE id = $1 RETURNING *', [floorId, newBuildingId]
    );
    return { floor: rows[0], complex_id: buildingRows[0].complex_id };
  },

  async moveBuilding(buildingId, newComplexId, client = null) {
    const db = getQuery(client);
    const { rows: buildingRows } = await db.query('SELECT id FROM buildings WHERE id = $1 AND deleted_at IS NULL', [buildingId]);
    if (!buildingRows[0]) throw new Error('BUILDING_NOT_FOUND');
    const { rows: complexRows } = await db.query('SELECT id, community_id FROM complexes WHERE id = $1 AND deleted_at IS NULL', [newComplexId]);
    if (!complexRows[0]) throw new Error('COMPLEX_NOT_FOUND');
    const { rows } = await db.query(
      'UPDATE buildings SET complex_id = $2 WHERE id = $1 RETURNING *', [buildingId, newComplexId]
    );
    return { building: rows[0], community_id: complexRows[0].community_id };
  },

  // ──────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────

  async resolveUnitId(communityId, unitNumber, client = null) {
    const db = getQuery(client);
    if (!communityId || !unitNumber) return null;
    const trimmed = String(unitNumber).trim();
    if (!trimmed) return null;
    const { rows } = await db.query(
      `SELECT u.id FROM units u
       JOIN floors f ON u.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE cx.community_id = $1 AND u.unit_code = $2 LIMIT 1`,
      [communityId, trimmed]
    );
    return rows[0]?.id || null;
  },

  async resolveUnitIds(communityId, unitNumbers, client = null) {
    const db = getQuery(client);
    const map = {};
    if (!communityId || !unitNumbers || unitNumbers.length === 0) return map;
    const trimmed = unitNumbers.map(n => String(n).trim()).filter(Boolean);
    if (trimmed.length === 0) return map;
    const { rows } = await db.query(
      `SELECT u.id, u.unit_code FROM units u
       JOIN floors f ON u.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE cx.community_id = $1 AND u.unit_code = ANY($2::varchar[])`,
      [communityId, trimmed]
    );
    for (const r of rows) map[r.unit_code] = r.id;
    return map;
  },

  async reorganizeUnits(entries, client = null) {
    const db = getQuery(client);
    const results = [];
    const errors = [];
    for (const entry of entries) {
      try {
        const { unit_id, new_floor_id } = entry;
        if (!unit_id || !new_floor_id) {
          errors.push({ unit_id, error: 'unit_id y new_floor_id son requeridos' });
          continue;
        }
        const { rows: floorRows } = await db.query(
          `SELECT f.id AS floor_id, f.building_id, b.complex_id, b.name AS building_name, f.number AS floor_number
           FROM floors f JOIN buildings b ON f.building_id = b.id WHERE f.id = $1`, [new_floor_id]
        );
        if (!floorRows[0]) { errors.push({ unit_id, error: `Piso ${new_floor_id} no existe` }); continue; }
        const floor = floorRows[0];
        if (entry.new_building_id && floor.building_id !== parseInt(entry.new_building_id)) {
          errors.push({ unit_id, error: `Piso no pertenece al edificio ${entry.new_building_id}` }); continue;
        }
        if (entry.new_complex_id && floor.complex_id !== parseInt(entry.new_complex_id)) {
          errors.push({ unit_id, error: `Piso no pertenece al complejo ${entry.new_complex_id}` }); continue;
        }
        const { rows: unitRows } = await db.query(
          'UPDATE units SET floor_id = $2 WHERE id = $1 RETURNING *', [unit_id, new_floor_id]
        );
        if (!unitRows[0]) { errors.push({ unit_id, error: `Unidad ${unit_id} no existe` }); continue; }
        results.push({ ...unitRows[0], new_floor_number: floor.floor_number, new_building_name: floor.building_name, new_complex_id: floor.complex_id });
      } catch (err) { errors.push({ unit_id: entry.unit_id, error: err.message }); }
    }
    return { updated: results, errors };
  },

  async getActiveUnitForUser(userId, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      `SELECT u.*, uo.ownership_type, uo.is_primary, uo.start_date,
              f.number AS floor_number, f.name AS floor_name,
              b.id AS building_id, b.name AS building_name,
              cx.id AS complex_id, cx.name AS complex_name
       FROM unit_ownerships uo
       JOIN units u ON uo.unit_id = u.id
       JOIN floors f ON u.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE uo.user_id = $1 AND (uo.end_date IS NULL OR uo.end_date > NOW())
       ORDER BY uo.is_primary DESC, uo.start_date DESC LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  async getCurrentOwnership(unitId, client = null) {
    const db = getQuery(client);
    const { rows } = await db.query(
      `SELECT uo.*, u.email, u.user_type, u.role, u.unit_number
       FROM unit_ownerships uo JOIN users u ON uo.user_id = u.id
       WHERE uo.unit_id = $1 AND (uo.end_date IS NULL OR uo.end_date > NOW())
       ORDER BY uo.is_primary DESC, uo.start_date DESC`, [unitId]
    );
    return rows;
  },
};

async function _getUnitTree(complexId, client = null) {
  const db = getQuery(client);
  const { rows: complexRows } = await db.query('SELECT * FROM complexes WHERE id = $1', [complexId]);
  const tree = complexRows[0] || null;
  if (!tree) return null;

  const { rows: buildings } = await db.query(
    'SELECT * FROM buildings WHERE complex_id = $1 AND deleted_at IS NULL ORDER BY sort_order, name', [complexId]
  );
  if (buildings.length === 0) { tree.buildings = []; return tree; }

  const buildingIds = buildings.map(b => b.id);
  const { rows: floors } = await db.query(
    'SELECT * FROM floors WHERE building_id = ANY($1::int[]) AND deleted_at IS NULL ORDER BY building_id, sort_order, number', [buildingIds]
  );
  if (floors.length === 0) { tree.buildings = buildings.map(b => ({ ...b, floors: [] })); return tree; }

  const floorIds = floors.map(f => f.id);
  const { rows: units } = await db.query(
    'SELECT * FROM units WHERE floor_id = ANY($1::int[]) AND is_active = TRUE ORDER BY floor_id, sort_order, unit_code', [floorIds]
  );

  const floorMap = new Map();
  for (const floor of floors) { floor.units = []; floorMap.set(floor.id, floor); }
  for (const unit of units) { const floor = floorMap.get(unit.floor_id); if (floor) floor.units.push(unit); }

  const buildingMap = new Map();
  for (const b of buildings) { b.floors = []; buildingMap.set(b.id, b); }
  for (const floor of floors) { const bld = buildingMap.get(floor.building_id); if (bld) bld.floors.push(floor); }

  tree.buildings = buildings;
  return tree;
}

module.exports = { Hierarchy };
