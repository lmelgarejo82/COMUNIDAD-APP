const express = require('express');
const { uploadsAuth } = require('../middleware/uploadsAuth');
const { setCommunity } = require('../middleware/setCommunity');
const { authorizeUploadedFile } = require('../middleware/uploadAccess');
const { UPLOAD_DIRECTORY } = require('../services/uploadFiles');

const router = express.Router();

router.use(uploadsAuth);
router.use(setCommunity);
router.use(authorizeUploadedFile);
router.use(express.static(UPLOAD_DIRECTORY));
router.use((req, res) => res.status(404).json({ error: 'Archivo no encontrado' }));

module.exports = router;
