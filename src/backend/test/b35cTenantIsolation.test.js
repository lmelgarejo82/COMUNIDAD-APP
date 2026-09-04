const test = require('node:test');
const assert = require('node:assert/strict');

const pollControllerPath = require.resolve('../controllers/pollsController');
const pollPath = require.resolve('../models/Poll');
const userPath = require.resolve('../models/User');
const bookingControllerPath = require.resolve('../controllers/bookingController');
const bookingPath = require.resolve('../models/Booking');
const notificationPath = require.resolve('../models/Notification');
const dbPath = require.resolve('../db');
const announcementControllerPath = require.resolve('../controllers/announcementController');
const announcementPath = require.resolve('../models/Announcement');
const adminControllerPath = require.resolve('../controllers/adminController');
const invitePath = require.resolve('../models/Invite');
const adminComplexPath = require.resolve('../models/AdminComplex');
const nodemailerPath = require.resolve('nodemailer');

function mockModule(path, exports) {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}

function clear(paths) {
  for (const path of paths) delete require.cache[path];
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function loadPollController(pollImpl) {
  clear([pollControllerPath, pollPath, userPath]);
  mockModule(pollPath, { Poll: pollImpl });
  mockModule(userPath, { User: { hasActiveOwnership: async () => true } });
  return require('../controllers/pollsController');
}

test('owner votes in a poll from req.communityId', async () => {
  const calls = [];
  const { vote } = loadPollController({
    async findById(id, communityId) {
      calls.push(['find', id, communityId]);
      return communityId === 7 ? { id: 41, community_id: 7, options: ['Si', 'No'] } : null;
    },
    async hasVoted(id, userId, communityId) {
      calls.push(['hasVoted', id, userId, communityId]);
      return false;
    },
    async vote(id, userId, optionIndex, communityId) {
      calls.push(['vote', id, userId, optionIndex, communityId]);
      return { id: 90, poll_id: id, user_id: userId, option_index: optionIndex };
    },
  });
  const res = createResponse();

  await vote({ params: { id: '41' }, body: { option_index: 0 }, user: { id: 5 }, communityId: 7 }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls, [
    ['find', '41', 7],
    ['hasVoted', '41', 5, 7],
    ['vote', '41', 5, 0, 7],
  ]);
});

test('owner cannot vote in a valid poll from another community', async () => {
  let mutated = false;
  const { vote } = loadPollController({
    async findById(id, communityId) {
      if (communityId === undefined) return { id: Number(id), community_id: 8, options: ['Si', 'No'] };
      return null;
    },
    async hasVoted() {
      return false;
    },
    async vote() {
      mutated = true;
      return { id: 91 };
    },
  });
  const res = createResponse();

  await vote({ params: { id: '52' }, body: { option_index: 0 }, user: { id: 5 }, communityId: 7 }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Votación no encontrada' });
  assert.equal(mutated, false);
});

function loadBookingController(bookingImpl) {
  clear([bookingControllerPath, bookingPath, notificationPath, userPath, dbPath]);
  mockModule(bookingPath, { Booking: bookingImpl });
  mockModule(notificationPath, { Notification: { create: async () => ({}) } });
  mockModule(userPath, { User: { findById: async () => ({ id: 5, unit_number: 'A-101', community_id: 7 }) } });
  mockModule(dbPath, { pool: { query: async () => ({ rows: [] }) } });
  return require('../controllers/bookingController');
}

function futureRange() {
  const from = new Date(Date.now() + 72 * 3600000);
  const to = new Date(from.getTime() + 3600000);
  return { date_from: from.toISOString(), date_to: to.toISOString() };
}

test('resident creates a booking for an amenity in req.communityId', async () => {
  let created = null;
  const { createBooking } = loadBookingController({
    async getAmenityById(id, communityId) {
      return communityId === 7 ? { id: Number(id), community_id: 7, name: 'SUM', rules: { advance_hours: 0 } } : null;
    },
    async findOverlapping() {
      return false;
    },
    async create(payload) {
      created = payload;
      return { id: 70, ...payload };
    },
  });
  const res = createResponse();

  await createBooking({
    body: { amenity_id: 12, ...futureRange() },
    user: { id: 5, email: 'resident@example.test' },
    communityId: 7,
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created.community_id, 7);
});

test('resident cannot create a booking for a foreign amenity', async () => {
  let mutated = false;
  const { createBooking } = loadBookingController({
    async getAmenityById(id, communityId) {
      if (communityId === undefined) return { id: Number(id), community_id: 8, name: 'SUM extranjero', rules: { advance_hours: 0 } };
      return null;
    },
    async findOverlapping() {
      return false;
    },
    async create() {
      mutated = true;
      return { id: 71 };
    },
  });
  const res = createResponse();

  await createBooking({
    body: { amenity_id: 99, ...futureRange() },
    user: { id: 5, email: 'resident@example.test' },
    communityId: 7,
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Amenity no encontrado' });
  assert.equal(mutated, false);
});

test('admin updates a booking in req.communityId', async () => {
  const calls = [];
  const { updateBookingStatus } = loadBookingController({
    async findById(id, communityId) {
      calls.push(['find', id, communityId]);
      return communityId === 7 ? { id: 61, user_id: 5, amenity_name: 'SUM' } : null;
    },
    async updateStatus(id, status, communityId) {
      calls.push(['update', id, status, communityId]);
      return { id: Number(id), status };
    },
  });
  const res = createResponse();

  await updateBookingStatus({ params: { id: '61' }, body: { status: 'cancelled' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [['find', '61', 7], ['update', '61', 'cancelled', 7]]);
});

test('admin cannot update or cancel a booking from another community', async () => {
  let mutated = false;
  const { updateBookingStatus } = loadBookingController({
    async findById(id, communityId) {
      if (communityId === undefined) return { id: Number(id), user_id: 6, amenity_name: 'Pileta extranjera' };
      return null;
    },
    async updateStatus() {
      mutated = true;
      return { id: 62, status: 'cancelled' };
    },
  });
  const res = createResponse();

  await updateBookingStatus({ params: { id: '62' }, body: { status: 'cancelled' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Reserva no encontrada' });
  assert.equal(mutated, false);
});

test('my bookings remains scoped to user and req.communityId', async () => {
  let received = null;
  const { myBookings } = loadBookingController({
    async findByUser(userId, communityId) {
      received = [userId, communityId];
      return [];
    },
  });
  const res = createResponse();

  await myBookings({ user: { id: 5 }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, [5, 7]);
});

function loadAnnouncementController(announcementImpl) {
  clear([announcementControllerPath, announcementPath, notificationPath]);
  mockModule(announcementPath, { Announcement: announcementImpl });
  mockModule(notificationPath, { Notification: {} });
  return require('../controllers/announcementController');
}

test('resident marks a same-community announcement as read', async () => {
  let received = null;
  const { markAsRead } = loadAnnouncementController({
    async markAsRead(id, userId, communityId) {
      received = [id, userId, communityId];
      return { announcement_id: Number(id), user_id: userId };
    },
  });
  const res = createResponse();

  await markAsRead({ params: { id: '31' }, user: { id: 5 }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, ['31', 5, 7]);
});

test('resident cannot create a read receipt for a foreign announcement', async () => {
  const { markAsRead } = loadAnnouncementController({ markAsRead: async () => null });
  const res = createResponse();

  await markAsRead({ params: { id: '32' }, user: { id: 5 }, communityId: 7 }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Anuncio no encontrado' });
});

test('admin deletes a same-community announcement', async () => {
  let received = null;
  const { delete: remove } = loadAnnouncementController({
    async softDelete(id, communityId) {
      received = [id, communityId];
      return { id: Number(id), community_id: communityId };
    },
  });
  const res = createResponse();

  await remove({ params: { id: '33' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, ['33', 7]);
});

test('admin cannot delete a valid announcement from another community', async () => {
  const { delete: remove } = loadAnnouncementController({ softDelete: async () => null });
  const res = createResponse();

  await remove({ params: { id: '34' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Anuncio no encontrado' });
});

function loadAdminController({ onQuery, inviteImpl, sendMail = async () => ({}) }) {
  clear([adminControllerPath, invitePath, adminComplexPath, dbPath, nodemailerPath]);
  mockModule(invitePath, { Invite: inviteImpl });
  mockModule(adminComplexPath, { AdminComplex: {} });
  mockModule(dbPath, { pool: { query: onQuery } });
  mockModule(nodemailerPath, {
    createTransport: () => ({ sendMail }),
    getTestMessageUrl: () => null,
  });
  return require('../controllers/adminController');
}

function inviteRequest(unitId) {
  return {
    body: { email: 'invitee@example.test', unit_id: unitId, ownership_type: 'owner' },
    user: { id: 2 },
    communityId: 7,
    protocol: 'https',
    headers: { host: 'host-attacker.example', 'x-forwarded-host': 'forwarded-attacker.example' },
    get: () => 'host-attacker.example',
  };
}

test('admin invites a unit from req.communityId without a second mutation', async () => {
  const queries = [];
  let created = null;
  let sentMail = null;
  const { invite } = loadAdminController({
    async onQuery(sql, params) {
      queries.push([sql, params]);
      return { rows: [{ id: 11, unit_code: 'A-101' }] };
    },
    inviteImpl: {
      async create(payload) {
        created = payload;
        return { id: 80, token: 'safe-token', unit_id: 11, ...payload };
      },
    },
    sendMail: async (mail) => { sentMail = mail; return {}; },
  });
  const res = createResponse();

  await invite(inviteRequest(11), res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(queries[0][1], [11, 7]);
  assert.match(queries[0][0], /cx\.community_id\s*=\s*\$2/);
  assert.equal(queries.length, 1);
  assert.equal(created.unit_id, 11);
  assert.equal(created.community_id, 7);
  assert.equal(created.ownership_type, 'owner');
  assert.equal(res.body.message, 'Invitación enviada');
  assert.equal(res.body.email_sent, true);
  assert.equal(res.body.delivery_warning, null);
  assert.equal(Object.hasOwn(res.body, 'token'), false);
  assert.equal(Object.hasOwn(res.body, 'token_hash'), false);
  assert.match(sentMail.html, /http:\/\/localhost\.test\/register#token=safe-token/);
  assert.doesNotMatch(sentMail.html, /register\?token=/);
  assert.doesNotMatch(sentMail.html, /host-attacker|forwarded-attacker/);
});

test('SMTP failure after persistence returns success with a delivery warning and creates once', async () => {
  let createCalls = 0;
  const { invite } = loadAdminController({
    async onQuery() {
      return { rows: [{ id: 11, unit_code: 'A-101' }] };
    },
    inviteImpl: {
      async create(payload) {
        createCalls += 1;
        return { id: 82, token: 'persisted-token', unit_id: 11, ...payload };
      },
    },
    sendMail: async () => { throw new Error('SMTP unavailable'); },
  });
  const res = createResponse();
  const originalError = console.error;
  console.error = () => {};

  try {
    await invite(inviteRequest(11), res);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 201);
  assert.equal(createCalls, 1);
  assert.equal(res.body.message, 'Invitación creada');
  assert.equal(res.body.email_sent, false);
  assert.match(res.body.delivery_warning, /creada.*no se pudo enviar/i);
  assert.equal(Object.hasOwn(res.body, 'token'), false);
  assert.equal(Object.hasOwn(res.body, 'token_hash'), false);
});

test('invite persistence failure remains a real server failure and does not attempt email', async () => {
  let emailAttempts = 0;
  const { invite } = loadAdminController({
    async onQuery() {
      return { rows: [{ id: 11, unit_code: 'A-101' }] };
    },
    inviteImpl: {
      async create() {
        throw new Error('database failure');
      },
    },
    sendMail: async () => { emailAttempts += 1; },
  });
  const res = createResponse();
  const originalError = console.error;
  console.error = () => {};

  try {
    await invite(inviteRequest(11), res);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.equal(emailAttempts, 0);
  assert.deepEqual(res.body, { error: 'Error interno del servidor' });
});

test('admin cannot invite a valid unit from another community', async () => {
  let created = false;
  const { invite } = loadAdminController({
    async onQuery(sql, params) {
      if (/cx\.community_id\s*=\s*\$2/.test(sql) && params[1] === 7) return { rows: [] };
      return { rows: [{ id: 99, unit_code: 'FOREIGN' }] };
    },
    inviteImpl: {
      async create() {
        created = true;
        return { id: 81, token: 'foreign-token' };
      },
    },
  });
  const res = createResponse();

  await invite(inviteRequest(99), res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Unidad no encontrada' });
  assert.equal(created, false);
});

test('admin invitation requires an explicit ownership type before unit lookup', async () => {
  let queried = false;
  let created = false;
  const { invite } = loadAdminController({
    async onQuery() {
      queried = true;
      return { rows: [{ id: 11, unit_code: 'A-101' }] };
    },
    inviteImpl: {
      async create() {
        created = true;
      },
    },
  });
  const req = inviteRequest(11);
  delete req.body.ownership_type;
  const res = createResponse();

  await invite(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
  assert.equal(created, false);
});
