const { removeUploadedFile } = require('../services/uploadFiles');

function trackUploadedFile(req, res, next) {
  if (!req.file) return next();

  let retained = false;
  let settled = false;
  let cleanupPromise = null;
  req.retainUploadedFile = () => {
    retained = true;
  };

  const settle = () => {
    if (settled) return cleanupPromise;
    settled = true;
    if (!retained) {
      cleanupPromise = removeUploadedFile(req.file).catch(error => {
        console.error('Error limpiando archivo no asociado:', {
          filename: req.file.filename,
          error: error.message,
        });
      });
    }
    return cleanupPromise;
  };

  req.cleanupUploadedFile = settle;

  res.once('finish', settle);
  res.once('close', () => {
    if (res.writableFinished) settle();
  });
  return next();
}

module.exports = { trackUploadedFile };
