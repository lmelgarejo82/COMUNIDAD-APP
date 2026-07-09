const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sanitize } = require('../middleware/sanitize');
const { setCommunity } = require('../middleware/setCommunity');
const { logAudit } = require('../middleware/logAudit');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowed.includes(ext));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/', authenticate, authorize('admin'), setCommunity, sanitize('description', 'period'),
  logAudit('CREATE_EXPENSE', (req, body) => ({ description: req.body.description, amount: req.body.fixedAmount + '+' + req.body.extraAmount, due: req.body.due_date })),
  expenseController.create);
router.put('/:id', authenticate, authorize('admin'), setCommunity, sanitize('description', 'period'),
  logAudit('UPDATE_EXPENSE', (req, body) => ({ id: req.params.id, description: req.body.description })),
  expenseController.update);
router.post('/:id/upload-file', authenticate, authorize('admin'), setCommunity, upload.single('file'), expenseController.uploadFile);
router.get('/units', authenticate, authorize('admin'), setCommunity, expenseController.listAllUnits);
router.get('/:id/units', authenticate, authorize('admin'), setCommunity, expenseController.listUnits);
router.put('/unit/:unitExpenseId/confirm', authenticate, authorize('admin'), setCommunity,
  logAudit('CONFIRM_PAYMENT', (req, body) => ({ unitExpenseId: req.params.unitExpenseId })),
  expenseController.confirmPayment);

router.get('/my', authenticate, authorize('residente'), setCommunity, expenseController.myExpenses);
router.get('/', authenticate, setCommunity, expenseController.listMyExpenses);
router.put('/unit/:unitExpenseId/pay', authenticate, authorize('residente'), setCommunity, expenseController.submitPayment);

module.exports = router;
