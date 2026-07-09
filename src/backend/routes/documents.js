const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const documentsController = require('../controllers/documentsController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    cb(null, path.extname(file.originalname).toLowerCase() === '.pdf');
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/', authenticate, authorize('admin'), setCommunity, upload.single('file'), documentsController.upload);
router.get('/', authenticate, setCommunity, documentsController.list);

module.exports = router;
