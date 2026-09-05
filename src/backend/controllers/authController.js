const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/accountEmail');
const { User, Community } = require('../models/User');
const { Invite } = require('../models/Invite');
const { pool } = require('../db');
const { getJwtSecret, getPublicAppOrigin } = require('../config/security');

const GENERIC_RESET_MESSAGE = 'Si el email existe, recibirás un enlace de restablecimiento';

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function scheduleResetEmail({ email, resetUrl }) {
  setImmediate(async () => {
    try {
      await sendPasswordResetEmail({ email, resetUrl });
    } catch {
      console.error('Falló la entrega de recuperación de contraseña.');
    }
  });
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      auth_version: Number.isInteger(user.auth_version) ? user.auth_version : 0,
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicRegistrationEnabled() {
  return process.env.PUBLIC_REGISTRATION_ENABLED === 'true';
}

async function rollback(client) {
  try {
    await client.query('ROLLBACK');
  } catch (err) {
    console.error('Error en rollback de registro:', err);
  }
}

async function registerFromInvite({ email, password_hash, inviteToken }) {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    const invite = await Invite.findForAcceptance(inviteToken, client);
    if (!invite || invite.email !== email) {
      await rollback(client);
      transactionOpen = false;
      return { status: 400, error: 'Token de invitación inválido o expirado' };
    }

    const existingUser = await User.findByEmail(email, client);
    if (existingUser) {
      await rollback(client);
      transactionOpen = false;
      return { status: 409, error: 'El email ya está registrado' };
    }

    const createdUser = await User.create({
      email,
      password_hash,
      role: 'residente',
      user_type: invite.ownership_type,
      unit_number: invite.resolved_unit_number,
      unit_id: invite.unit_id,
      community_id: invite.community_id,
    }, client);

    await client.query(
      `INSERT INTO unit_ownerships (unit_id, user_id, ownership_type, is_primary, start_date)
       VALUES ($1, $2, $3, TRUE, NOW())`,
      [invite.unit_id, createdUser.id, invite.ownership_type]
    );

    const user = await User.findById(createdUser.id, client);
    if (!(await Invite.markUsed(invite.id, client))) {
      throw new Error('INVITE_CONCURRENTLY_CONSUMED');
    }

    await client.query('COMMIT');
    transactionOpen = false;
    return { user };
  } catch (err) {
    if (transactionOpen) await rollback(client);
    throw err;
  } finally {
    client.release();
  }
}

exports.register = async (req, res) => {
  try {
    const { email, password, access_code, inviteToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    let user;
    if (inviteToken) {
      const password_hash = await bcrypt.hash(password, 10);
      const result = await registerFromInvite({ email, password_hash, inviteToken });
      if (result.error) return res.status(result.status).json({ error: result.error });
      user = result.user;
    } else {
      if (!publicRegistrationEnabled()) {
        return res.status(403).json({ error: 'El registro público está deshabilitado' });
      }
      if (!access_code) {
        return res.status(400).json({ error: 'Código de acceso requerido' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'El email ya está registrado' });
      }

      const community = await Community.findByAccessCode(access_code);
      if (!community) {
        return res.status(404).json({ error: 'Código de acceso inválido' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      user = await User.create({
        email,
        password_hash,
        role: 'residente',
        user_type: null,
        unit_number: null,
        unit_id: null,
        community_id: community.id,
      });
    }

    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
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

    const safeUser = await User.findById(user.id);
    const token = generateToken({ ...(safeUser || user), auth_version: user.auth_version });
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

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashResetToken(resetToken);
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hora

    const user = await User.setResetToken(email, resetTokenHash, resetTokenExpires);
    if (!user) {
      return res.json({ message: GENERIC_RESET_MESSAGE });
    }

    const resetUrl = new URL('/reset-password', `${getPublicAppOrigin()}/`);
    resetUrl.hash = `token=${encodeURIComponent(resetToken)}`;

    res.json({ message: GENERIC_RESET_MESSAGE });
    scheduleResetEmail({ email, resetUrl: resetUrl.toString() });
  } catch (err) {
    console.error('Error en forgotPassword:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

async function resetPasswordWithToken(token, password, res) {
  try {
    if (typeof token !== 'string' || token.length === 0) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const consumed = await User.consumeResetToken(hashResetToken(token), password_hash);
    if (!consumed) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch {
    console.error('Error en resetPassword');
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

exports.resetPasswordFromBody = async (req, res) => {
  const body = req.body || {};
  return resetPasswordWithToken(body.token, body.password, res);
};

exports.resetPassword = async (req, res) => {
  const body = req.body || {};
  return resetPasswordWithToken(req.params?.token, body.password, res);
};
