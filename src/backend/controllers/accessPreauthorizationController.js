const { VisitorPreauthorization } = require('../models/VisitorPreauthorization');

function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function requireCommunity(req, res) {
  if (!req.communityId) {
    res.status(400).json({ error: 'Contexto de comunidad requerido' });
    return false;
  }
  return true;
}

function handleDestinationError(err, res) {
  if (err.code === 'COMPLEX_FORBIDDEN') {
    res.status(403).json({ error: 'El complejo no pertenece a tu comunidad' });
    return true;
  }
  if (err.code === 'UNIT_FORBIDDEN') {
    res.status(403).json({ error: 'La unidad no pertenece a tu comunidad' });
    return true;
  }
  if (err.code === 'UNIT_COMPLEX_MISMATCH') {
    res.status(403).json({ error: 'La unidad no pertenece al complejo seleccionado' });
    return true;
  }
  return false;
}

exports.list = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const items = await VisitorPreauthorization.list(req.communityId, {
      ...req.query,
      complex_id: req.query.complex_id || req.query.complexId || req.complexId,
    });
    res.json({ data: items });
  } catch (err) {
    console.error('Error en accessPreauthorizationController.list:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.detail = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const item = await VisitorPreauthorization.findByIdForCommunity(parsePositiveInt(req.params.id), req.communityId);
    if (!item) return res.status(404).json({ error: 'Preautorización no encontrada' });
    res.json(item);
  } catch (err) {
    console.error('Error en accessPreauthorizationController.detail:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const visitorName = normalizeText(req.body.visitor_name);
    const visitType = normalizeText(req.body.visit_type);
    if (!visitorName) return res.status(400).json({ error: 'visitor_name es requerido' });
    if (!visitType) return res.status(400).json({ error: 'visit_type es requerido' });

    const item = await VisitorPreauthorization.create({
      community_id: req.communityId,
      complex_id: parsePositiveInt(req.body.complex_id) || req.complexId || null,
      unit_id: parsePositiveInt(req.body.unit_id),
      visitor_name: visitorName,
      visitor_document: normalizeText(req.body.visitor_document),
      visitor_phone: normalizeText(req.body.visitor_phone),
      vehicle_plate: normalizeText(req.body.vehicle_plate),
      visit_type: visitType,
      destination_label: normalizeText(req.body.destination_label),
      authorized_by: normalizeText(req.body.authorized_by),
      notes: normalizeText(req.body.notes),
      expected_from: req.body.expected_from || null,
      expected_until: req.body.expected_until || null,
      created_by: req.user?.id || null,
    });

    res.status(201).json({ message: 'Preautorización creada correctamente.', preauthorization: item });
  } catch (err) {
    if (handleDestinationError(err, res)) return;
    console.error('Error en accessPreauthorizationController.create:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.cancel = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const item = await VisitorPreauthorization.cancel({
      id: parsePositiveInt(req.params.id),
      communityId: req.communityId,
      userId: req.user?.id,
    });
    if (!item) return res.status(404).json({ error: 'Preautorización no encontrada' });

    res.json({
      message: item.alreadyFinal ? 'La preautorización ya estaba cerrada.' : 'Preautorización cancelada correctamente.',
      preauthorization: item,
    });
  } catch (err) {
    console.error('Error en accessPreauthorizationController.cancel:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.search = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const items = await VisitorPreauthorization.searchPending(req.communityId, {
      q: req.query.q || req.query.search,
      limit: req.query.limit,
      complex_id: req.query.complex_id || req.query.complexId || req.complexId,
    });
    res.json({ data: items });
  } catch (err) {
    console.error('Error en accessPreauthorizationController.search:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.use = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const result = await VisitorPreauthorization.use({
      id: parsePositiveInt(req.params.id),
      communityId: req.communityId,
      userId: req.user?.id,
    });
    if (!result) return res.status(404).json({ error: 'Preautorización no encontrada' });

    res.status(result.alreadyUsed ? 200 : 201).json({
      message: result.alreadyUsed
        ? 'La preautorización ya había sido usada.'
        : 'Ingreso registrado desde preautorización.',
      preauthorization: result.preauthorization,
      visit: result.visit,
    });
  } catch (err) {
    if (err.code === 'PREAUTH_EXPIRED') {
      return res.status(409).json({ error: 'La preautorización está vencida' });
    }
    if (err.code === 'PREAUTH_NOT_PENDING') {
      return res.status(409).json({ error: 'La preautorización no está pendiente' });
    }
    console.error('Error en accessPreauthorizationController.use:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
