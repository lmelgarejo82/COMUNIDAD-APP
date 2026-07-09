const { VisitorDigitalInvitation } = require('../models/VisitorDigitalInvitation');

const GENERIC_INVITATION_ERROR = 'Invitación inválida o vencida.';

function normalizeToken(value) {
  if (value === undefined || value === null) return null;
  const token = String(value).trim();
  return token || null;
}

function requireCommunity(req, res) {
  if (!req.communityId) {
    res.status(400).json({ error: 'Contexto de comunidad requerido' });
    return false;
  }
  return true;
}

function handleInvitationError(err, res) {
  if (err.code === 'INVITATION_INVALID' || err.code === 'PREAUTH_EXPIRED' || err.code === 'PREAUTH_NOT_PENDING') {
    res.status(404).json({ error: GENERIC_INVITATION_ERROR });
    return true;
  }
  return false;
}

exports.validate = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const token = normalizeToken(req.body?.token);
    if (!token) return res.status(400).json({ error: 'Token requerido' });

    const invitation = await VisitorDigitalInvitation.validateToken({
      token,
      communityId: req.communityId,
    });

    res.json({ invitation });
  } catch (err) {
    if (handleInvitationError(err, res)) return;
    console.error('Error en accessInvitationValidationController.validate:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.use = async (req, res) => {
  try {
    if (!requireCommunity(req, res)) return;

    const token = normalizeToken(req.body?.token);
    if (!token) return res.status(400).json({ error: 'Token requerido' });

    const result = await VisitorDigitalInvitation.useToken({
      token,
      communityId: req.communityId,
      userId: req.user?.id,
    });

    res.status(result.alreadyUsed ? 200 : 201).json({
      message: result.alreadyUsed
        ? 'La invitación ya había sido usada.'
        : 'Ingreso registrado desde invitación.',
      invitation: result.invitation,
      visit: result.visit,
      preauthorization: result.preauthorization,
    });
  } catch (err) {
    if (handleInvitationError(err, res)) return;
    console.error('Error en accessInvitationValidationController.use:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
