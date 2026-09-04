const { removeUploadedFile } = require('../services/uploadFiles');

function trackUploadedFile(req, res, next) {
  if (!req.file) return next();

  let retained = false;
  let settled = false;
  req.retainUploadedFile = () => {
    retained = true;
  };

  const settle = () => {
    if (settled) return;
    settled = true;
    if (!retained) {
      removeUploadedFile(req.file).catch(error => {
        console.error('Error limpiando archivo no asociado:', {
          filename: req.file.filename,
          error: error.message,
        });
      });
    }
  };

  res.once('finish', settle);
  res.once('close', () => {
    if (res.writableFinished) settle();
  });
  return next();
}

module.exports = { trackUploadedFile };
