const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { User, Community } = require('../models/User');
const { Invite } = require('../models/Invite');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

exports.register = async (req, res) => {
  try {
    const { email, password, access_code, unit_number, inviteToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    let communityId;
    let assignedUnit = unit_number || null;

    // Registro con token de invitación (multi-tenant profesional)
    if (inviteToken) {
      const invite = await Invite.findByToken(inviteToken);
      if (!invite) {
        return res.status(400).json({ error: 'Token de invitación inválido o expirado' });
      }
      if (invite.email !== email) {
        return res.status(400).json({ error: 'El email no coincide con la invitación' });
      }
      communityId = invite.community_id;
      assignedUnit = invite.unit_number;
      await Invite.markUsed(inviteToken);
    } else if (access_code) {
      // Registro con código de acceso (legacy)
      const community = await Community.findByAccessCode(access_code);
      if (!community) {
        return res.status(404).json({ error: 'Código de acceso inválido' });
      }
      communityId = community.id;
    } else {
      return res.status(400).json({ error: 'Token de invitación o código de acceso son requeridos' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password_hash,
      role: 'residente',
      user_type: req.body.user_type || 'owner',
      unit_number: assignedUnit,
      community_id: communityId,
    });

    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Error en register:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son requeridos' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken(user);
    const { password_hash, reset_token, reset_token_expires, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email es requerido' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.json({ message: 'Si el email existe, recibirás un enlace de restablecimiento' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hora

    await User.setResetToken(email, resetToken, resetTokenExpires);

    const resetUrl = `${req.protocol}://${req.get('host')}/api/auth/reset-password/${resetToken}`;

    const info = await transporter.sendMail({
      from: '"Comunidad App" <noreply@comunidad.app>',
      to: email,
      subject: 'Restablecer contraseña',
      html: `
        <h2>Restablecimiento de contraseña</h2>
        <p>Hacé clic en el siguiente enlace para restablecer tu contraseña:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Este enlace expira en 1 hora.</p>
        <p>Si no solicitaste este cambio, ignorá este mensaje.</p>
      `,
    });

    console.log('Email enviado:', nodemailer.getTestMessageUrl(info));
    res.json({ message: 'Si el email existe, recibirás un enlace de restablecimiento' });
  } catch (err) {
    console.error('Error en forgotPassword:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const user = await User.findByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await User.updatePassword(user.id, password_hash);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error en resetPassword:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
