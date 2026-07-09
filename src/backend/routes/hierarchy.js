const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { setCommunity } = require('../middleware/setCommunity');
const { sanitize } = require('../middleware/sanitize');
const { logAudit } = require('../middleware/logAudit');
const hc = require('../controllers/hierarchyController');

// Tree
router.get('/tree', authenticate, setCommunity, hc.tree);

// Complexes
router.get('/complexes', authenticate, setCommunity, hc.getComplexes);
router.post('/complexes',
  authenticate, authorize('superadmin'), setCommunity,
  sanitize('name', 'address', 'access_code'),
  logAudit('CREATE_COMPLEX', (req, body) => ({ complex: body })),
  hc.createComplex
);
router.put('/complexes/:id',
  authenticate, authorize('admin'), setCommunity,
  sanitize('name', 'address'),
  logAudit('UPDATE_COMPLEX', (req) => ({ complex_id: req.params.id })),
  hc.updateComplex
);
router.delete('/complexes/:id',
  authenticate, authorize('superadmin'), setCommunity,
  logAudit('DELETE_COMPLEX', (req) => ({ complex_id: req.params.id })),
  hc.deleteComplex
);

// Buildings
router.get('/buildings', authenticate, setCommunity, hc.getBuildings);
router.post('/buildings',
  authenticate, authorize('admin'), setCommunity,
  sanitize('name', 'address'),
  logAudit('CREATE_BUILDING', (req, body) => ({ building: body })),
  hc.createBuilding
);
router.put('/buildings/:id',
  authenticate, authorize('admin'), setCommunity,
  sanitize('name', 'address'),
  logAudit('UPDATE_BUILDING', (req) => ({ building_id: req.params.id })),
  hc.updateBuilding
);
router.delete('/buildings/:id',
  authenticate, authorize('admin'), setCommunity,
  logAudit('DELETE_BUILDING', (req) => ({ building_id: req.params.id })),
  hc.deleteBuilding
);
router.patch('/buildings/:id/move',
  authenticate, authorize('admin'), setCommunity,
  logAudit('MOVE_BUILDING', (req) => ({ building_id: req.params.id, new_complex_id: req.body.new_complex_id })),
  hc.moveBuilding
);

// Floors
router.get('/floors', authenticate, setCommunity, hc.getFloors);
router.post('/floors',
  authenticate, authorize('admin'), setCommunity,
  sanitize('name'),
  logAudit('CREATE_FLOOR', (req, body) => ({ floor: body })),
  hc.createFloor
);
router.put('/floors/:id',
  authenticate, authorize('admin'), setCommunity,
  sanitize('name'),
  logAudit('UPDATE_FLOOR', (req) => ({ floor_id: req.params.id })),
  hc.updateFloor
);
router.delete('/floors/:id',
  authenticate, authorize('admin'), setCommunity,
  logAudit('DELETE_FLOOR', (req) => ({ floor_id: req.params.id })),
  hc.deleteFloor
);
router.patch('/floors/:id/move',
  authenticate, authorize('admin'), setCommunity,
  logAudit('MOVE_FLOOR', (req) => ({ floor_id: req.params.id, new_building_id: req.body.new_building_id })),
  hc.moveFloor
);

// Units
router.get('/units/search', authenticate, authorize('admin', 'access_operator'), setCommunity, hc.searchUnits);
router.get('/units', authenticate, setCommunity, hc.getUnits);
router.post('/units',
  authenticate, authorize('admin'), setCommunity,
  sanitize('unit_code'),
  logAudit('CREATE_UNIT', (req, body) => ({ unit: body })),
  hc.createUnit
);
router.put('/units/:id',
  authenticate, authorize('admin'), setCommunity,
  sanitize('unit_code'),
  logAudit('UPDATE_UNIT', (req) => ({ unit_id: req.params.id })),
  hc.updateUnit
);
router.delete('/units/:id',
  authenticate, authorize('admin'), setCommunity,
  logAudit('DELETE_UNIT', (req) => ({ unit_id: req.params.id })),
  hc.deleteUnit
);
router.patch('/units/:id/move',
  authenticate, authorize('admin'), setCommunity,
  logAudit('MOVE_UNIT', (req) => ({ unit_id: req.params.id, new_floor_id: req.body.new_floor_id })),
  hc.moveUnit
);
router.put('/units/reorganize',
  authenticate, authorize('admin'), setCommunity,
  logAudit('REORGANIZE_UNITS', (req) => ({ count: req.body.entries?.length })),
  hc.reorganizeUnits
);

// Unified move endpoint
router.put('/move',
  authenticate, authorize('admin'), setCommunity,
  logAudit('MOVE_NODE', (req) => ({ node_type: req.body.node_type, node_id: req.body.node_id, new_parent_id: req.body.new_parent_id })),
  hc.moveNode
);

// Admin complexes
router.get('/admin/complexes', authenticate, authorize('admin'), hc.getAdminComplexes);

// Bulk create
router.post('/bulk',
  authenticate, authorize('admin'), setCommunity,
  sanitize('building.name'),
  logAudit('BULK_CREATE', (req, body) => ({ building: req.body.building?.name, floors: req.body.floors?.length })),
  hc.bulkCreate
);

// Assign user to unit
router.post('/assign',
  authenticate, authorize('admin'), setCommunity,
  logAudit('ASSIGN_UNIT', (req) => ({ unit_id: req.body.unit_id, user_id: req.body.user_id })),
  hc.assignUnit
);
router.put('/assign/:id/end',
  authenticate, authorize('admin'), setCommunity,
  logAudit('END_ASSIGNMENT', (req) => ({ assignment_id: req.params.id })),
  hc.endAssignment
);

module.exports = router;
