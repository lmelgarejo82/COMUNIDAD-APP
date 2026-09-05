async function handleUploadError(error, req, res, next) {
  if (res.headersSent) return next(error);

  const multerError = error?.name === 'MulterError';
  const malformedMultipart = error instanceof Error
    && /multipart|unexpected end of form/i.test(error.message);
  if (!multerError && !malformedMultipart) return next(error);

  try {
    await req.cleanupUploadedFile?.();
  } catch {
    console.error('No se pudo limpiar un archivo multipart rechazado.');
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido' });
  }
  return res.status(400).json({ error: 'Archivo multipart inválido' });
}

module.exports = { handleUploadError };
