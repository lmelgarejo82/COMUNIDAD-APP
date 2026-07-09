const { pool } = require('../db');
const { Hierarchy } = require('../models/Hierarchy');
const { VisitorAccessLog } = require('../models/VisitorAccessLog');

function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

async function validateComplexOwnership(communityId, complexId) {
  if (!complexId) return true;
  const complexes = await Hierarchy.getComplexes(communityId);
  return complexes.some(c => c.id === complexId);
}

async function findUnitInCommunity(communityId, unitId) {
  if (!unitId) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.unit_code, cx.id AS complex_id, cx.name AS complex_name
     FROM units u
     JOIN floors f ON f.id = u.floor_id
     JOIN buildings b ON b.id = f.building_id
     JOIN complexes cx ON cx.id = b.complex_id
     WHERE u.id = $1
       AND cx.community_id = $2
       AND COALESCE(u.is_active, TRUE) = TRUE
       AND cx.deleted_at IS NULL`,
    [unitId, communityId]
  );
  return rows[0] || null;
}

function requireCommunity(req, res) {
  if (!req.communityId) {
    res.status(400).json({ error: 'Contexto de comunidad requerido' });
    return false;
  }
  return true;
}

exports.list = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const result = await VisitorAccessLog.list(req.communityId, {
      ...req.query,
      complex_id: req.query.complex_id || req.query.complexId || req.complexId,
    });

    res.json(result);
  } catch (err) {
    console.error('Error en accessLogController.list:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.detail = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const visit = await VisitorAccessLog.findByIdForCommunity(parsePositiveInt(req.params.id), req.communityId);
    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });

    res.json(visit);
  } catch (err) {
    console.error('Error en accessLogController.detail:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.checkIn = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const visitorName = normalizeText(req.body.visitor_name);
    const visitType = normalizeText(req.body.visit_type);
    if (!visitorName) return res.status(400).json({ error: 'visitor_name es requerido' });
    if (!visitType) return res.status(400).json({ error: 'visit_type es requerido' });

    const bodyComplexId = parsePositiveInt(req.body.complex_id);
    const requestedComplexId = bodyComplexId || req.complexId || null;
    const unitId = parsePositiveInt(req.body.unit_id);

    let resolvedComplexId = requestedComplexId;
    if (requestedComplexId && !(await validateComplexOwnership(req.communityId, requestedComplexId))) {
      return res.status(403).json({ error: 'El complejo no pertenece a tu comunidad' });
    }

    if (unitId) {
      const unit = await findUnitInCommunity(req.communityId, unitId);
      if (!unit) return res.status(403).json({ error: 'La unidad no pertenece a tu comunidad' });
      if (requestedComplexId && unit.complex_id !== requestedComplexId) {
        return res.status(403).json({ error: 'La unidad no pertenece al complejo seleccionado' });
      }
      resolvedComplexId = unit.complex_id;
    }

    const visit = await VisitorAccessLog.create({
      community_id: req.communityId,
      complex_id: resolvedComplexId,
      unit_id: unitId,
      visitor_name: visitorName,
      visitor_document: normalizeText(req.body.visitor_document),
      visitor_phone: normalizeText(req.body.visitor_phone),
      vehicle_plate: normalizeText(req.body.vehicle_plate),
      visit_type: visitType,
      destination_label: normalizeText(req.body.destination_label),
      authorized_by: normalizeText(req.body.authorized_by),
      notes: normalizeText(req.body.notes),
      entry_at: req.body.entry_at || null,
      created_by: req.user?.id || null,
    });

    res.status(201).json({ message: 'Ingreso registrado correctamente.', visit });
  } catch (err) {
    console.error('Error en accessLogController.checkIn:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.checkOut = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const visit = await VisitorAccessLog.checkOut({
      id: parsePositiveInt(req.params.id),
      communityId: req.communityId,
      userId: req.user?.id,
    });
    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });

    res.json({
      message: visit.alreadyExited ? 'La salida ya estaba registrada.' : 'Salida registrada correctamente.',
      visit,
    });
  } catch (err) {
    if (err.code === 'VISIT_CANCELLED') {
      return res.status(409).json({ error: 'No se puede registrar salida de una visita cancelada' });
    }
    console.error('Error en accessLogController.checkOut:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.cancel = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const visit = await VisitorAccessLog.cancel({
      id: parsePositiveInt(req.params.id),
      communityId: req.communityId,
      userId: req.user?.id,
    });
    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });

    res.json({
      message: visit.alreadyCancelled ? 'El registro ya estaba cancelado.' : 'Registro cancelado correctamente.',
      visit,
    });
  } catch (err) {
    if (err.code === 'VISIT_EXITED') {
      return res.status(409).json({ error: 'No se puede cancelar una visita con salida registrada' });
    }
    console.error('Error en accessLogController.cancel:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.observe = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const note = normalizeText(req.body.observation_note || req.body.note);
    if (!note) return res.status(400).json({ error: 'observation_note es requerido' });

    const visit = await VisitorAccessLog.observe({
      id: parsePositiveInt(req.params.id),
      communityId: req.communityId,
      userId: req.user?.id,
      note,
    });
    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });

    res.json({ message: 'Visita marcada como observada.', visit });
  } catch (err) {
    console.error('Error en accessLogController.observe:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.unobserve = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const visit = await VisitorAccessLog.unobserve({
      id: parsePositiveInt(req.params.id),
      communityId: req.communityId,
    });
    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });

    res.json({ message: 'Observación removida.', visit });
  } catch (err) {
    console.error('Error en accessLogController.unobserve:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
