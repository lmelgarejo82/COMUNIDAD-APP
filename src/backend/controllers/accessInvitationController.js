const { VisitorDigitalInvitation } = require('../models/VisitorDigitalInvitation');

function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requireCommunity(req, res) {
  if (!req.communityId) {
    res.status(400).json({ error: 'Contexto de comunidad requerido' });
    return false;
  }
  return true;
}

function buildInvitationUrl(req, token) {
  const configuredBase = process.env.PUBLIC_APP_URL || process.env.PUBLIC_INVITATION_BASE_URL;
  const baseUrl = configuredBase || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl.replace(/\/$/, '')}/invitacion/${token}`;
}

exports.list = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const items = await VisitorDigitalInvitation.list({
      preauthorizationId: parsePositiveInt(req.params.id),
      communityId: req.communityId,
    });

    res.json({ data: items });
  } catch (err) {
    console.error('Error en accessInvitationController.list:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.create = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const result = await VisitorDigitalInvitation.create({
      preauthorizationId: parsePositiveInt(req.params.id),
      communityId: req.communityId,
      userId: req.user?.id,
      expiresAt: req.body?.expires_at || null,
    });
    if (!result) return res.status(404).json({ error: 'Preautorización no encontrada' });

    const invitationUrl = buildInvitationUrl(req, result.token);
    res.status(201).json({
      message: 'Invitación digital generada correctamente.',
      invitation: result.invitation,
      token: result.token,
      invitation_url: invitationUrl,
    });
  } catch (err) {
    if (err.code === 'PREAUTH_NOT_PENDING') {
      return res.status(409).json({ error: 'Solo se pueden generar invitaciones para preautorizaciones pendientes y vigentes' });
    }
    if (err.code === 'INVITATION_EXPIRATION_INVALID') {
      return res.status(400).json({ error: 'La expiración de la invitación debe ser futura' });
    }
    console.error('Error en accessInvitationController.create:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.revoke = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const invitation = await VisitorDigitalInvitation.revoke({
      id: parsePositiveInt(req.params.invitationId),
      preauthorizationId: parsePositiveInt(req.params.id),
      communityId: req.communityId,
      userId: req.user?.id,
    });
    if (!invitation) return res.status(404).json({ error: 'Invitación no encontrada' });

    res.json({
      message: invitation.alreadyRevoked ? 'La invitación ya estaba revocada.' : 'Invitación revocada correctamente.',
      invitation,
    });
  } catch (err) {
    console.error('Error en accessInvitationController.revoke:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
