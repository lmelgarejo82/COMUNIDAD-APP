const { Invite } = require('../models/Invite');
const { AdminComplex } = require('../models/AdminComplex');
const { pool } = require('../db');
const { sendResidentInviteEmail } = require('../services/accountEmail');
const { getPublicAppOrigin } = require('../config/security');

const VALID_OWNERSHIP_TYPES = new Set(['owner', 'tenant']);

exports.invite = async (req, res) => {
  try {
    const { email, unit_id, ownership_type } = req.body;

    if (!email) return res.status(400).json({ error: 'email es requerido' });
    if (!unit_id) return res.status(400).json({ error: 'unit_id es requerido' });
    if (!VALID_OWNERSHIP_TYPES.has(ownership_type)) {
      return res.status(400).json({ error: 'ownership_type debe ser owner o tenant' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.unit_code FROM units u
       JOIN floors f ON u.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       JOIN complexes cx ON b.complex_id = cx.id
       WHERE u.id = $1
         AND cx.community_id = $2
         AND COALESCE(u.is_active, TRUE) = TRUE
         AND u.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND b.deleted_at IS NULL
         AND cx.deleted_at IS NULL`,
      [unit_id, req.communityId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Unidad no encontrada' });
    const resolvedUnitId = rows[0].id;
    const resolvedUnitNumber = rows[0].unit_code;

    const invite = await Invite.create({
      email,
      community_id: req.communityId,
      unit_id: resolvedUnitId,
      ownership_type,
      created_by: req.user.id,
    });
    if (!invite) return res.status(404).json({ error: 'Unidad no encontrada' });

    const inviteUrl = new URL('/register', getPublicAppOrigin());
    inviteUrl.hash = `token=${encodeURIComponent(invite.token)}`;

    let emailSent = false;
    let deliveryWarning = null;
    try {
      await sendResidentInviteEmail({
        email,
        inviteUrl: inviteUrl.toString(),
        unitNumber: resolvedUnitNumber,
        ownershipType: ownership_type,
      });
      emailSent = true;
    } catch {
      deliveryWarning = 'La invitación fue creada, pero no se pudo enviar el email.';
      console.error('Invitación persistida; falló el envío de email.');
    }

    res.status(201).json({
      message: emailSent ? 'Invitación enviada' : 'Invitación creada',
      unit_id: resolvedUnitId,
      unit_number: resolvedUnitNumber,
      ownership_type,
      email_sent: emailSent,
      delivery_warning: deliveryWarning,
    });
  } catch (err) {
    console.error('Error en invite:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listInvites = async (req, res) => {
  try {
    res.json(await Invite.listByCommunity(req.communityId));
  } catch (err) {
    console.error('Error en listInvites:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listCommunities = async (req, res) => {
  try {
    // New: multi-complex admin gets all complexes via admin_complexes
    if (req.user.role === 'admin') {
      const complexes = await AdminComplex.findComplexesByAdmin(req.user.id);
      if (complexes.length > 0) {
        return res.json(complexes.map(c => ({
          id: c.id,
          name: c.name,
          address: c.address,
          type: 'complex',
          community_id: c.community_id,
          community_name: c.community_name,
          organization_id: c.organization_id,
          organization_name: c.organization_name,
        })));
      }
    }

    // Legacy fallback
    const { rows } = await pool.query(
      `SELECT DISTINCT c.id, c.name, c.address, c.organization_id,
              o.name AS organization_name
       FROM communities c
       JOIN users u ON u.community_id = c.id
       LEFT JOIN organizations o ON o.id = c.organization_id
       WHERE u.id = $1 AND u.role = 'admin'`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error en listCommunities:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
