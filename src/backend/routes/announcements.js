const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sanitize } = require('../middleware/sanitize');
const { setCommunity } = require('../middleware/setCommunity');
const { logAudit } = require('../middleware/logAudit');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `announcement-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
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

router.post('/', authenticate, authorize('admin'), setCommunity, sanitize('title', 'message'),
  logAudit('CREATE_ANNOUNCEMENT', (req) => ({ title: req.body.title })),
  upload.single('file'), announcementController.create);
router.get('/admin', authenticate, authorize('admin'), setCommunity, announcementController.listForAdmin);
router.get('/', authenticate, authorize('admin', 'residente'), setCommunity, announcementController.listForResident);
router.put('/:id/read', authenticate, authorize('admin', 'residente'), announcementController.markAsRead);
router.delete('/:id', authenticate, authorize('admin'), setCommunity,
  logAudit('DELETE_ANNOUNCEMENT', (req) => ({ id: req.params.id })),
  announcementController.delete);

module.exports = router;
