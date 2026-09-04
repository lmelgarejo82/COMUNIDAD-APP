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
  mockModule(userPath, { User: { findById: async () => ({ id: 5, user_type: 'owner' }) } });
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

function loadAdminController({ onQuery, inviteImpl }) {
  clear([adminControllerPath, invitePath, adminComplexPath, dbPath, nodemailerPath]);
  mockModule(invitePath, { Invite: inviteImpl });
  mockModule(adminComplexPath, { AdminComplex: {} });
  mockModule(dbPath, { pool: { query: onQuery } });
  mockModule(nodemailerPath, {
    createTransport: () => ({ sendMail: async () => ({}) }),
    getTestMessageUrl: () => null,
  });
  return require('../controllers/adminController');
}

function inviteRequest(unitId) {
  return {
    body: { email: 'invitee@example.test', unit_id: unitId },
    user: { id: 2 },
    communityId: 7,
    protocol: 'http',
    get: () => 'localhost:3000',
  };
}

test('admin invites a unit from req.communityId without a second mutation', async () => {
  const queries = [];
  let created = null;
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
  });
  const res = createResponse();

  await invite(inviteRequest(11), res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(queries[0][1], [11, 7]);
  assert.match(queries[0][0], /cx\.community_id\s*=\s*\$2/);
  assert.equal(queries.length, 1);
  assert.equal(created.unit_id, 11);
  assert.equal(created.community_id, 7);
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
