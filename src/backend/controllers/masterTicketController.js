const { MasterTicket } = require('../models/MasterTicket');
const { invalidatePattern } = require('../cache');

function buildAffectedUnits(scope) {
  if (!scope) return [];
  const entries = [];
  if (scope.unit_ids?.length) {
    scope.unit_ids.forEach(id => entries.push({ unit_id: id }));
  }
  if (scope.floor_ids?.length) {
    scope.floor_ids.forEach(id => entries.push({ floor_id: id }));
  }
  if (scope.building_ids?.length) {
    scope.building_ids.forEach(id => entries.push({ building_id: id }));
  }
  return entries;
}

function formatDescription(description, severity, estimated_resolution) {
  let desc = description || '';
  if (severity) desc = `[Severidad: ${severity}] ${desc}`;
  if (estimated_resolution) desc += `\n\nResolución estimada: ${estimated_resolution}`;
  return desc.trim() || null;
}

exports.create = async (req, res) => {
  try {
    const { title, description, category, severity, file_url, scope } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido' });
    if (!scope) return res.status(400).json({ error: 'scope es requerido (unit_ids, floor_ids o building_ids)' });

    const affectedUnits = buildAffectedUnits(scope);
    if (affectedUnits.length === 0) {
      return res.status(400).json({ error: 'scope debe contener al menos una unidad, piso o edificio' });
    }

    const master = await MasterTicket.createMasterTicket({
      community_id: req.communityId,
      title,
      description: formatDescription(description, severity, req.body.estimated_resolution),
      type: category || 'general',
      file_url: file_url || null,
      created_by: req.user.id,
    }, affectedUnits);

    const result = await MasterTicket.enqueueSubTicketGeneration(master.id);

    res.status(202).json({
      master,
      job: { enqueued: result.enqueued, jobId: result.jobId },
      affected_units_count: affectedUnits.length,
    });
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    console.error('Error en create master ticket:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.list = async (req, res) => {
  try {
    const { status, type, page, limit } = req.query;
    const result = await MasterTicket.listMasterTickets(req.communityId, { status, type, page, limit });
    res.json(result);
  } catch (err) {
    console.error('Error en list master tickets:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getById = async (req, res) => {
  try {
    const detail = await MasterTicket.getMasterTicket(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Master ticket no encontrado' });
    res.json(detail);
  } catch (err) {
    console.error('Error en get master ticket:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, severity, status, file_url } = req.body;

    const existing = await MasterTicket.getMasterTicket(id);
    if (!existing) return res.status(404).json({ error: 'Master ticket no encontrado' });

    const updated = await MasterTicket.updateMasterTicket(id, {
      title,
      description: description !== undefined
        ? formatDescription(description, severity, req.body.estimated_resolution)
        : undefined,
      type: category,
      status,
      file_url,
    });

    res.json(updated);
  } catch (err) {
    console.error('Error en update master ticket:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.resolveSubTicket = async (req, res) => {
  try {
    const { id, ticketId } = req.params;
    const ticketIdNum = parseInt(ticketId);

    const detail = await MasterTicket.getMasterTicket(id);
    if (!detail) return res.status(404).json({ error: 'Master ticket no encontrado' });

    const subTicket = detail.sub_tickets?.find(t => t.id === ticketIdNum);
    if (!subTicket) return res.status(404).json({ error: 'Sub-ticket no encontrado en este master ticket' });

    const result = await MasterTicket.resolveSubTicket(ticketIdNum);
    if (!result.ticket) return res.status(404).json({ error: 'Sub-ticket no encontrado o ya resuelto' });

    res.json({
      ticket: result.ticket,
      master_closed: result.master_closed,
    });
    invalidatePattern('dashboard:*').catch(() => {});
  } catch (err) {
    console.error('Error en resolveSubTicket:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.notify = async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await MasterTicket.getMasterTicket(id);
    if (!detail) return res.status(404).json({ error: 'Master ticket no encontrado' });
    if (detail.status !== 'open') {
      return res.status(400).json({ error: 'Solo se pueden reenviar notificaciones de tickets en estado open' });
    }

    const result = await MasterTicket.enqueueSubTicketGeneration(detail.id);
    res.status(202).json({
      message: 'Notificaciones reencoladas',
      enqueued: result.enqueued,
      jobId: result.jobId,
    });
  } catch (err) {
    console.error('Error en notify master ticket:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
