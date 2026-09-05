const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sanitize } = require('../middleware/sanitize');
const { setCommunity } = require('../middleware/setCommunity');
const { logAudit } = require('../middleware/logAudit');
const { trackUploadedFile } = require('../middleware/uploadLifecycle');
const { UPLOAD_DIRECTORY } = require('../services/uploadFiles');

const storage = multer.diskStorage({
  destination: UPLOAD_DIRECTORY,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `ticket-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/', authenticate, authorize('residente'), setCommunity, sanitize('title', 'description'), upload.single('file'), trackUploadedFile, ticketController.create);
router.get('/', authenticate, authorize('admin'), setCommunity, ticketController.listAll);
router.get('/my', authenticate, authorize('residente'), setCommunity, ticketController.listMy);
router.put('/:id/status', authenticate, authorize('admin'), setCommunity,
  logAudit('UPDATE_TICKET_STATUS', (req) => ({ ticketId: req.params.id, status: req.body.status })),
  ticketController.updateStatus);
router.put('/:id', authenticate, authorize('admin', 'residente'), setCommunity, sanitize('title', 'description'), ticketController.update);
router.post('/:id/reply', authenticate, authorize('admin', 'residente'), setCommunity, sanitize('message'), upload.single('file'), trackUploadedFile, ticketController.addReply);

module.exports = router;
