const { Hierarchy } = require('../models/Hierarchy');
const { AdminComplex } = require('../models/AdminComplex');
const { pool } = require('../db');
const { invalidatePattern } = require('../cache');

function getComplexForCommunity(communityId) {
  return Hierarchy.getComplexes(communityId).then(r => r[0] || null);
}

async function validateComplexOwnership(communityId, complexId) {
  const complexes = await Hierarchy.getComplexes(communityId);
  return complexes.some(c => c.id === complexId);
}

function parsePositiveInt(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function validateTreeComplexAccess(req, complexId) {
  if (!(await validateComplexOwnership(req.communityId, complexId))) {
    return false;
  }

  if (req.user.role !== 'admin') {
    return true;
  }

  if (req.complexId === complexId) {
    return true;
  }

  return AdminComplex.verifyAdminAccess(req.user.id, complexId);
}

async function validateBuildingOwnership(communityId, buildingId) {
  const building = await Hierarchy.getBuildingById(buildingId);
  if (!building) return false;
  return validateComplexOwnership(communityId, building.complex_id);
}

async function validateFloorOwnership(communityId, floorId) {
  const { rows } = await pool.query(
    `SELECT b.complex_id FROM floors f
     JOIN buildings b ON f.building_id = b.id WHERE f.id = $1`, [floorId]
  );
  if (!rows[0]) return false;
  return validateComplexOwnership(communityId, rows[0].complex_id);
}

async function validateUnitOwnership(communityId, unitId) {
  const { rows } = await pool.query(
    `SELECT b.complex_id FROM units u
     JOIN floors f ON u.floor_id = f.id
     JOIN buildings b ON f.building_id = b.id WHERE u.id = $1`, [unitId]
  );
  if (!rows[0]) return false;
  return validateComplexOwnership(communityId, rows[0].complex_id);
}

// ──────────────────────────────────────────────
// TREE
// ──────────────────────────────────────────────

exports.tree = async (req, res) => {
  try {
    const requestedComplexId = req.complexId || (req.query.complexId ? parsePositiveInt(req.query.complexId) : null);
    let complexes;

    if (req.query.complexId && !requestedComplexId) {
      return res.status(400).json({ error: 'Contexto de complejo inválido' });
    }

    if (requestedComplexId) {
      if (!(await validateTreeComplexAccess(req, requestedComplexId))) {
        return res.status(403).json({ error: 'No tenés acceso a este complejo' });
      }
      const tree = await Hierarchy.getUnitTree(requestedComplexId);
      return res.json(tree ? [tree] : []);
    }

    if (req.user.role === 'admin') {
      complexes = (await AdminComplex.findComplexesByAdmin(req.user.id))
        .filter(c => c.community_id === req.communityId);
    } else {
      complexes = await Hierarchy.getComplexes(req.communityId);
    }
    const trees = [];
    for (const c of complexes) {
      const tree = await Hierarchy.getUnitTree(c.id);
      if (tree) trees.push(tree);
    }
    res.json(trees);
  } catch (err) {
    console.error('Error en hierarchy tree:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ──────────────────────────────────────────────
// COMPLEXES CRUD
// ──────────────────────────────────────────────

exports.getComplexes = async (req, res) => {
  try {
    const complexes = await Hierarchy.getComplexes(req.communityId);
    res.json(complexes);
  } catch (err) {
    console.error('Error en getComplexes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.createComplex = async (req, res) => {
  try {
    const { name, address, access_code } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });
    const complex = await Hierarchy.createComplex({
      name, address, community_id: req.communityId,
      access_code: access_code || undefined,
    });

    // Grant the creating admin access to this complex
    await AdminComplex.addAdminToComplex(req.user.id, complex.id);

    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.status(201).json(complex);
  } catch (err) {
    console.error('Error en createComplex:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateComplex = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await validateComplexOwnership(req.communityId, parseInt(id)))) {
      return res.status(403).json({ error: 'El complejo no pertenece a tu comunidad' });
    }
    const updated = await Hierarchy.updateComplex(parseInt(id), req.body);
    if (!updated) return res.status(404).json({ error: 'Complejo no encontrado' });
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json(updated);
  } catch (err) {
    console.error('Error en updateComplex:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteComplex = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await validateComplexOwnership(req.communityId, parseInt(id)))) {
      return res.status(403).json({ error: 'El complejo no pertenece a tu comunidad' });
    }
    try {
      const deleted = await Hierarchy.deleteComplex(parseInt(id));
      if (!deleted) return res.status(404).json({ error: 'Complejo no encontrado' });
    } catch (err) {
      if (err.message === 'COMPLEX_HAS_BUILDINGS') return res.status(409).json({ error: 'El complejo tiene edificios activos. Eliminá los edificios primero.' });
      throw err;
    }
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.status(204).send();
  } catch (err) {
    console.error('Error en deleteComplex:', err);
    res.status(500).json({ error: err.message });
  }
};

// ──────────────────────────────────────────────
// BUILDINGS
// ──────────────────────────────────────────────

exports.getBuildings = async (req, res) => {
  try {
    const complexes = await Hierarchy.getComplexes(req.communityId);
    const all = [];
    for (const c of complexes) {
      const buildings = await Hierarchy.getBuildings(c.id);
      all.push(...buildings.map(b => ({ ...b, complex_name: c.name, complex_id: c.id })));
    }
    res.json(all);
  } catch (err) {
    console.error('Error en getBuildings:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.createBuilding = async (req, res) => {
  try {
    const { complex_id, name, address, building_type, sort_order, total_lots } = req.body;
    if (!name) return res.status(400).json({ error: 'name es requerido' });

    const targetComplexId = complex_id || (await getComplexForCommunity(req.communityId))?.id;
    if (!targetComplexId) return res.status(400).json({ error: 'complex_id es requerido' });

    if (!(await validateComplexOwnership(req.communityId, targetComplexId))) {
      return res.status(403).json({ error: 'El complejo no pertenece a tu comunidad' });
    }

    const bt = building_type || 'tower';
    const autoFloor = bt === 'block' || bt === 'house';
    const result = await Hierarchy.createBuilding({
      complex_id: targetComplexId, name, address,
      building_type: bt, sort_order,
      autoFloor,
      totalLots: autoFloor ? (parseInt(total_lots) || 1) : undefined,
    });
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.status(201).json(result);
  } catch (err) {
    console.error('Error en createBuilding:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateBuilding = async (req, res) => {
  try {
    const { id } = req.params;
    const building = await Hierarchy.getBuildingById(id);
    if (!building) return res.status(404).json({ error: 'Edificio no encontrado' });
    if (!(await validateComplexOwnership(req.communityId, building.complex_id))) {
      return res.status(403).json({ error: 'El edificio no pertenece a tu comunidad' });
    }
    const updated = await Hierarchy.updateBuilding(parseInt(id), req.body);
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json(updated);
  } catch (err) {
    console.error('Error en updateBuilding:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteBuilding = async (req, res) => {
  try {
    const { id } = req.params;
    const building = await Hierarchy.getBuildingById(id);
    if (!building) return res.status(404).json({ error: 'Edificio no encontrado' });
    if (!(await validateComplexOwnership(req.communityId, building.complex_id))) {
      return res.status(403).json({ error: 'El edificio no pertenece a tu comunidad' });
    }
    try {
      await Hierarchy.deleteBuilding(parseInt(id));
    } catch (err) {
      if (err.message === 'BUILDING_HAS_UNITS') return res.status(409).json({ error: 'El edificio tiene unidades activas. Eliminá las unidades primero.' });
      if (err.message === 'BUILDING_HAS_FLOORS') return res.status(409).json({ error: 'El edificio tiene pisos. Eliminá los pisos primero.' });
      throw err;
    }
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.status(204).send();
  } catch (err) {
    console.error('Error en deleteBuilding:', err);
    res.status(500).json({ error: err.message });
  }
};

// ──────────────────────────────────────────────
// FLOORS
// ──────────────────────────────────────────────

exports.getFloors = async (req, res) => {
  try {
    const buildingId = parseInt(req.query.buildingId);
    if (!buildingId) return res.status(400).json({ error: 'buildingId es requerido' });
    if (!(await validateBuildingOwnership(req.communityId, buildingId))) {
      return res.status(403).json({ error: 'El edificio no pertenece a tu comunidad' });
    }
    res.json(await Hierarchy.getFloors(buildingId));
  } catch (err) {
    console.error('Error en getFloors:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.createFloor = async (req, res) => {
  try {
    const { building_id, number, name, sort_order } = req.body;
    if (!building_id || number === undefined) return res.status(400).json({ error: 'building_id y number son requeridos' });
    if (!(await validateBuildingOwnership(req.communityId, building_id))) {
      return res.status(403).json({ error: 'El edificio no pertenece a tu comunidad' });
    }
    const floor = await Hierarchy.createFloor({ building_id, number, name, sort_order });
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.status(201).json(floor);
  } catch (err) {
    console.error('Error en createFloor:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateFloor = async (req, res) => {
  try {
    const { id } = req.params;
    const floor = await Hierarchy.getFloorById(id);
    if (!floor) return res.status(404).json({ error: 'Piso no encontrado' });
    if (!(await validateComplexOwnership(req.communityId, floor.complex_id))) {
      return res.status(403).json({ error: 'El piso no pertenece a tu comunidad' });
    }
    const updated = await Hierarchy.updateFloor(parseInt(id), req.body);
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json(updated);
  } catch (err) {
    console.error('Error en updateFloor:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteFloor = async (req, res) => {
  try {
    const { id } = req.params;
    const floor = await Hierarchy.getFloorById(id);
    if (!floor) return res.status(404).json({ error: 'Piso no encontrado' });
    if (!(await validateComplexOwnership(req.communityId, floor.complex_id))) {
      return res.status(403).json({ error: 'El piso no pertenece a tu comunidad' });
    }
    try {
      await Hierarchy.deleteFloor(parseInt(id));
    } catch (err) {
      if (err.message === 'FLOOR_HAS_ACTIVE_UNITS') return res.status(409).json({ error: 'El piso tiene unidades activas. Eliminá o desactivá las unidades primero.' });
      throw err;
    }
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.status(204).send();
  } catch (err) {
    console.error('Error en deleteFloor:', err);
    res.status(500).json({ error: err.message });
  }
};

// ──────────────────────────────────────────────
// UNITS
// ──────────────────────────────────────────────

exports.getUnits = async (req, res) => {
  try {
    const { floorId, buildingId } = req.query;
    if (!floorId && !buildingId) return res.status(400).json({ error: 'floorId o buildingId es requerido' });
    if (floorId && !(await validateFloorOwnership(req.communityId, parseInt(floorId)))) {
      return res.status(403).json({ error: 'El piso no pertenece a tu comunidad' });
    }
    if (buildingId && !(await validateBuildingOwnership(req.communityId, parseInt(buildingId)))) {
      return res.status(403).json({ error: 'El edificio no pertenece a tu comunidad' });
    }
    res.json(await Hierarchy.getUnits({
      floorId: floorId ? parseInt(floorId) : null,
      buildingId: buildingId ? parseInt(buildingId) : null,
    }));
  } catch (err) {
    console.error('Error en getUnits:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.createUnit = async (req, res) => {
  try {
    const { floor_id, unit_code, unit_type, area_m2, coef_percent, sort_order } = req.body;
    if (!floor_id || !unit_code) return res.status(400).json({ error: 'floor_id y unit_code son requeridos' });
    if (!(await validateFloorOwnership(req.communityId, floor_id))) {
      return res.status(403).json({ error: 'El piso no pertenece a tu comunidad' });
    }
    try {
      const unit = await Hierarchy.createUnit({ floor_id, unit_code, unit_type, area_m2, coef_percent, sort_order });
      invalidatePattern('hierarchy:tree:*').catch(() => {});
      res.status(201).json(unit);
    } catch (err) {
      if (err.constraint === 'units_floor_id_unit_code_key') return res.status(409).json({ error: `La unidad "${unit_code}" ya existe en este piso` });
      throw err;
    }
  } catch (err) {
    console.error('Error en createUnit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await validateUnitOwnership(req.communityId, parseInt(id)))) {
      return res.status(403).json({ error: 'La unidad no pertenece a tu comunidad' });
    }
    try {
      const updated = await Hierarchy.updateUnit(parseInt(id), req.body);
      if (!updated) return res.status(404).json({ error: 'Unidad no encontrada' });
      invalidatePattern('hierarchy:tree:*').catch(() => {});
      invalidatePattern('dashboard:*').catch(() => {});
      res.json(updated);
    } catch (err) {
      if (err.constraint === 'units_floor_id_unit_code_key') return res.status(409).json({ error: 'El código de unidad ya existe en este piso' });
      throw err;
    }
  } catch (err) {
    console.error('Error en updateUnit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await validateUnitOwnership(req.communityId, parseInt(id)))) {
      return res.status(403).json({ error: 'La unidad no pertenece a tu comunidad' });
    }
    const result = await Hierarchy.deleteUnit(parseInt(id));
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json({ deleted: true, soft: result.is_active === false, unit: result });
  } catch (err) {
    console.error('Error en deleteUnit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.moveUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_floor_id } = req.body;
    if (!new_floor_id) return res.status(400).json({ error: 'new_floor_id es requerido' });
    if (!(await validateUnitOwnership(req.communityId, parseInt(id)))) {
      return res.status(403).json({ error: 'La unidad no pertenece a tu comunidad' });
    }
    if (!(await validateFloorOwnership(req.communityId, new_floor_id))) {
      return res.status(403).json({ error: 'El piso destino no pertenece a tu comunidad' });
    }
    const result = await Hierarchy.moveUnit(parseInt(id), new_floor_id);
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('Error en moveUnit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.moveFloor = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_building_id } = req.body;
    if (!new_building_id) return res.status(400).json({ error: 'new_building_id es requerido' });
    if (!(await validateFloorOwnership(req.communityId, parseInt(id)))) {
      return res.status(403).json({ error: 'El piso no pertenece a tu comunidad' });
    }
    if (!(await validateBuildingOwnership(req.communityId, new_building_id))) {
      return res.status(403).json({ error: 'El edificio destino no pertenece a tu comunidad' });
    }
    const result = await Hierarchy.moveFloor(parseInt(id), new_building_id);
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('Error en moveFloor:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.moveBuilding = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_complex_id } = req.body;
    if (!new_complex_id) return res.status(400).json({ error: 'new_complex_id es requerido' });
    if (!(await validateBuildingOwnership(req.communityId, parseInt(id)))) {
      return res.status(403).json({ error: 'El edificio no pertenece a tu comunidad' });
    }
    if (!(await validateComplexOwnership(req.communityId, new_complex_id))) {
      return res.status(403).json({ error: 'El complejo destino no pertenece a tu comunidad' });
    }
    const result = await Hierarchy.moveBuilding(parseInt(id), new_complex_id);
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('Error en moveBuilding:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.reorganizeUnits = async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries debe ser un array no vacío' });
    }
    for (const entry of entries) {
      if (entry.new_floor_id) {
        const { rows } = await pool.query(
          `SELECT f.id FROM floors f JOIN buildings b ON f.building_id = b.id
           JOIN complexes cx ON b.complex_id = cx.id WHERE f.id = $1 AND cx.community_id = $2`,
          [parseInt(entry.new_floor_id), req.communityId]
        );
        if (!rows[0]) return res.status(403).json({ error: `El piso ${entry.new_floor_id} no pertenece a tu comunidad`, unit_id: entry.unit_id });
      }
    }
    const result = await Hierarchy.reorganizeUnits(entries);
    invalidatePattern('hierarchy:tree:*').catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('Error en reorganizeUnits:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ──────────────────────────────────────────────
// UNIFIED MOVE / REORDER
// Body: { node_id, node_type, new_parent_id, new_parent_type, new_sort_order? }
// ──────────────────────────────────────────────

exports.moveNode = async (req, res) => {
  try {
    const { node_id, node_type, new_parent_id, new_parent_type, new_sort_order } = req.body;
    if (!node_id || !node_type || !new_parent_id || !new_parent_type) {
      return res.status(400).json({ error: 'node_id, node_type, new_parent_id, new_parent_type son requeridos' });
    }

    const id = parseInt(node_id);
    const parentId = parseInt(new_parent_id);

    if (node_type === 'building' && new_parent_type === 'complex') {
      if (!(await validateBuildingOwnership(req.communityId, id))) {
        return res.status(403).json({ error: 'El edificio no pertenece a tu comunidad' });
      }
      if (!(await validateComplexOwnership(req.communityId, parentId))) {
        return res.status(403).json({ error: 'El complejo destino no pertenece a tu comunidad' });
      }
      const result = await Hierarchy.moveBuilding(id, parentId);
      if (new_sort_order !== undefined) {
        await pool.query('UPDATE buildings SET sort_order = $1 WHERE id = $2', [new_sort_order, id]);
      }
      invalidatePattern('hierarchy:tree:*').catch(() => {});
      return res.json(result);
    }

    if (node_type === 'floor' && new_parent_type === 'building') {
      if (!(await validateFloorOwnership(req.communityId, id))) {
        return res.status(403).json({ error: 'El piso no pertenece a tu comunidad' });
      }
      if (!(await validateBuildingOwnership(req.communityId, parentId))) {
        return res.status(403).json({ error: 'El edificio destino no pertenece a tu comunidad' });
      }
      const result = await Hierarchy.moveFloor(id, parentId);
      if (new_sort_order !== undefined) {
        await pool.query('UPDATE floors SET sort_order = $1 WHERE id = $2', [new_sort_order, id]);
      }
      invalidatePattern('hierarchy:tree:*').catch(() => {});
      return res.json(result);
    }

    if (node_type === 'unit' && new_parent_type === 'floor') {
      if (!(await validateUnitOwnership(req.communityId, id))) {
        return res.status(403).json({ error: 'La unidad no pertenece a tu comunidad' });
      }
      if (!(await validateFloorOwnership(req.communityId, parentId))) {
        return res.status(403).json({ error: 'El piso destino no pertenece a tu comunidad' });
      }
      const result = await Hierarchy.moveUnit(id, parentId);
      if (new_sort_order !== undefined) {
        await pool.query('UPDATE units SET sort_order = $1 WHERE id = $2', [new_sort_order, id]);
      }
      invalidatePattern('hierarchy:tree:*').catch(() => {});
      return res.json(result);
    }

    return res.status(400).json({ error: `Movimiento invlido: ${node_type} -> ${new_parent_type}` });
  } catch (err) {
    console.error('Error en moveNode:', err);
    res.status(500).json({ error: err.message });
  }
};

// ──────────────────────────────────────────────
// ADMIN COMPLEXES
// ──────────────────────────────────────────────

exports.getAdminComplexes = async (req, res) => {
  try {
    const complexes = await AdminComplex.findComplexesByAdmin(req.user.id);
    res.json(complexes);
  } catch (err) {
    console.error('Error en getAdminComplexes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ──────────────────────────────────────────────
// BULK CREATE (building + floors + units)
// Soporta tower (con pisos) y block/house (piso automático + lotes)
// ──────────────────────────────────────────────

exports.bulkCreate = async (req, res) => {
  const client = await pool.connect();
  try {
    const { complex_id, building, floors, total_lots } = req.body;
    if (!building?.name) {
      return res.status(400).json({ error: 'building.name es requerido' });
    }

    const bt = building.building_type || 'tower';
    const isAutoFloor = bt === 'block' || bt === 'house';

    if (!isAutoFloor && (!Array.isArray(floors) || floors.length === 0)) {
      return res.status(400).json({ error: 'floors[] es requerido para tipo tower' });
    }

    const targetComplexId = complex_id || req.complexId;
    if (!targetComplexId) return res.status(400).json({ error: 'complex_id es requerido' });
    if (!(await validateComplexOwnership(req.communityId, targetComplexId))) {
      return res.status(403).json({ error: 'El complejo no pertenece a tu comunidad' });
    }

    await client.query('BEGIN');

    const { rows: [bld] } = await client.query(
      `INSERT INTO buildings (complex_id, name, building_type, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
      [targetComplexId, building.name, bt, building.sort_order || 0]
    );

    let createdFloors = [];
    let createdUnits = [];

    if (isAutoFloor) {
      const { rows: [autoFloor] } = await client.query(
        `INSERT INTO floors (building_id, number, name, sort_order) VALUES ($1, 1, 'Planta Baja', 1) RETURNING *`,
        [bld.id]
      );
      createdFloors.push(autoFloor);

      const lots = parseInt(total_lots) || 1;
      const values = [];
      const params = [];
      for (let i = 1; i <= lots; i++) {
        const code = bt === 'house' ? `Casa ${i}` : `Lote ${i}`;
        const base = params.length;
        params.push(autoFloor.id, code);
        values.push(`($${base + 1}, $${base + 2})`);
      }
      if (values.length > 0) {
        const { rows: batch } = await client.query(
          `INSERT INTO units (floor_id, unit_code) VALUES ${values.join(', ')} RETURNING *`, params
        );
        createdUnits = batch;
      }
    } else {
      for (const floorData of floors) {
        const { rows: [fl] } = await client.query(
          `INSERT INTO floors (building_id, number, name, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
          [bld.id, floorData.number, floorData.name || null, floorData.sort_order || 0]
        );
        createdFloors.push(fl);

        if (floorData.units && floorData.units.length > 0) {
          const values = [];
          const params = [];
          floorData.units.forEach((u) => {
            const base = params.length;
            params.push(fl.id, u.unit_code, u.unit_type || null, u.area_m2 || null, u.coef_percent || null, u.sort_order || 0);
            values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`);
          });
          const { rows: batchUnits } = await client.query(
            `INSERT INTO units (floor_id, unit_code, unit_type, area_m2, coef_percent, sort_order)
             VALUES ${values.join(', ')} RETURNING *`, params
          );
          createdUnits.push(...batchUnits);
        }
      }
    }

    await client.query('COMMIT');
    invalidatePattern('hierarchy:tree:*').catch(() => {});

    res.status(201).json({
      building: bld,
      floors: createdFloors,
      units: createdUnits,
      summary: { buildings: 1, floors: createdFloors.length, units: createdUnits.length },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en bulkCreate:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// ──────────────────────────────────────────────
// ASSIGN USER TO UNIT
// ──────────────────────────────────────────────

exports.assignUnit = async (req, res) => {
  try {
    const { unit_id, user_id, ownership_type, start_date } = req.body;
    if (!unit_id || !user_id) return res.status(400).json({ error: 'unit_id y user_id son requeridos' });
    if (!(await validateUnitOwnership(req.communityId, parseInt(unit_id)))) {
      return res.status(403).json({ error: 'La unidad no pertenece a tu comunidad' });
    }

    const { rows } = await pool.query(
      `INSERT INTO unit_ownerships (unit_id, user_id, ownership_type, start_date, is_primary)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (unit_id, user_id) DO UPDATE
         SET ownership_type = $3, start_date = $4, end_date = NULL, is_primary = TRUE
       RETURNING *`,
      [unit_id, user_id, ownership_type || 'owner', start_date || new Date().toISOString()]
    );

    // Also update user's unit_id
    await pool.query('UPDATE users SET unit_id = $1, unit_number = (SELECT unit_code FROM units WHERE id = $1) WHERE id = $2', [unit_id, user_id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error en assignUnit:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.endAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE unit_ownerships SET end_date = NOW(), is_primary = FALSE
       WHERE id = $1 AND end_date IS NULL RETURNING *`,
      [parseInt(id)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Asignación no encontrada o ya finalizada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error en endAssignment:', err);
    res.status(500).json({ error: err.message });
  }
};
