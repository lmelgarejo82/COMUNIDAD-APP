const { UploadAccess } = require('../models/UploadAccess');
const { resolveRequestedUpload } = require('../services/uploadFiles');

const NOT_FOUND = { error: 'Archivo no encontrado' };

async function authorizeUploadedFile(req, res, next) {
  const requested = resolveRequestedUpload(req.path);
  if (!requested) return res.status(404).json(NOT_FOUND);

  try {
    const authorized = await UploadAccess.isAuthorized(requested.fileUrl, {
      communityId: req.communityId,
      userId: req.user?.id,
      role: req.user?.role,
    });
    if (!authorized) return res.status(404).json(NOT_FOUND);

    req.authorizedUpload = requested;
    return next();
  } catch (error) {
    console.error('Error autorizando archivo:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { authorizeUploadedFile };
