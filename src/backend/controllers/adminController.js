const { Invite } = require('../models/Invite');
const { AdminComplex } = require('../models/AdminComplex');
const { pool } = require('../db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

exports.invite = async (req, res) => {
  try {
    const { email, unit_number, unit_id } = req.body;

    if (!email) return res.status(400).json({ error: 'email es requerido' });

    let resolvedUnitNumber = unit_number || null;
    let resolvedUnitId = unit_id || null;

    // If unit_id is provided, resolve unit_number from the units table
    if (resolvedUnitId) {
      const { rows } = await pool.query('SELECT unit_code FROM units WHERE id = $1', [resolvedUnitId]);
      if (!rows[0]) return res.status(404).json({ error: 'Unidad no encontrada' });
      resolvedUnitNumber = rows[0].unit_code;
    } else if (resolvedUnitNumber) {
      // Legacy: resolve unit_id from unit_number if possible
      const { rows } = await pool.query(
        `SELECT u.id FROM units u
         JOIN floors f ON u.floor_id = f.id
         JOIN buildings b ON f.building_id = b.id
         JOIN complexes cx ON b.complex_id = cx.id
         WHERE cx.community_id = $1 AND u.unit_code = $2 LIMIT 1`,
        [req.communityId, String(resolvedUnitNumber).trim()]
      );
      if (rows[0]) resolvedUnitId = rows[0].id;
    }

    if (!resolvedUnitNumber) return res.status(400).json({ error: 'unit_id o unit_number es requerido' });

    const invite = await Invite.create({
      email,
      community_id: req.communityId,
      unit_number: resolvedUnitNumber,
      created_by: req.user.id,
    });

    // Additionally update the invite's unit_id directly if resolved
    if (resolvedUnitId) {
      await pool.query('UPDATE invites SET unit_id = $1 WHERE id = $2', [resolvedUnitId, invite.id]);
    }

    const inviteUrl = `${req.protocol}://${req.get('host')}/register?token=${invite.token}`;

    const info = await transporter.sendMail({
      from: '"Comunidad App" <noreply@comunidad.app>',
      to: email,
      subject: 'Invitación a Comunidad App',
      html: `
        <h2>Fuiste invitado a Comunidad App</h2>
        <p>Hacé clic en el siguiente enlace para registrarte:</p>
        <a href="${inviteUrl}">${inviteUrl}</a>
        <p><strong>Unidad asignada:</strong> ${resolvedUnitNumber}</p>
        <p>Este enlace expira en 7 días.</p>
      `,
    });

    console.log('Email invitación enviado:', nodemailer.getTestMessageUrl(info));

    res.status(201).json({ message: 'Invitación enviada', token: invite.token, unit_id: resolvedUnitId, unit_number: resolvedUnitNumber });
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
        })));
      }
    }

    // Legacy fallback
    const { rows } = await pool.query(
      "SELECT DISTINCT c.id, c.name, c.address FROM communities c JOIN users u ON u.community_id = c.id WHERE u.id = $1 AND u.role = 'admin'",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error en listCommunities:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
