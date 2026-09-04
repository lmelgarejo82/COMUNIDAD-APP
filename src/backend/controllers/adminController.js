const { Invite } = require('../models/Invite');
const { AdminComplex } = require('../models/AdminComplex');
const { pool } = require('../db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

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

    const inviteUrl = `${req.protocol}://${req.get('host')}/register?token=${invite.token}`;

    let emailSent = false;
    let deliveryWarning = null;
    try {
      const info = await transporter.sendMail({
        from: '"Comunidad App" <noreply@comunidad.app>',
        to: email,
        subject: 'Invitación a Comunidad App',
        html: `
          <h2>Fuiste invitado a Comunidad App</h2>
          <p>Hacé clic en el siguiente enlace para registrarte:</p>
          <a href="${inviteUrl}">${inviteUrl}</a>
          <p><strong>Unidad asignada:</strong> ${resolvedUnitNumber}</p>
          <p><strong>Tipo:</strong> ${ownership_type === 'owner' ? 'Propietario' : 'Inquilino'}</p>
          <p>Este enlace expira en 7 días.</p>
        `,
      });
      emailSent = true;
      console.log('Email invitación enviado:', nodemailer.getTestMessageUrl(info));
    } catch (emailError) {
      deliveryWarning = 'La invitación fue creada, pero no se pudo enviar el email.';
      console.error('Invitación persistida; falló el envío de email:', emailError);
    }

    res.status(201).json({
      message: emailSent ? 'Invitación enviada' : 'Invitación creada',
      token: invite.token,
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
