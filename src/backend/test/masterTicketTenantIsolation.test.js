const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../controllers/masterTicketController');
const masterTicketPath = require.resolve('../models/MasterTicket');
const cachePath = require.resolve('../cache');

function mockModule(path, exports) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
}

function loadController(masterTicketImpl) {
  delete require.cache[controllerPath];
  mockModule(masterTicketPath, { MasterTicket: masterTicketImpl });
  mockModule(cachePath, { invalidatePattern: async () => {} });
  return require('../controllers/masterTicketController');
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

function scopedLookup(resource) {
  return async (id, communityId) => {
    if (communityId === undefined) return resource;
    return resource.id === Number(id) && resource.community_id === communityId ? resource : null;
  };
}

test('master ticket creation keeps same-community scope and existing 202 contract', async () => {
  let received = null;
  const { create } = loadController({
    async createMasterTicket(data, affectedUnits) {
      received = { data, affectedUnits };
      return { id: 40, ...data };
    },
    async enqueueSubTicketGeneration() {
      return { enqueued: false, jobId: null };
    },
  });
  const res = createResponse();

  await create({
    communityId: 7,
    user: { id: 5 },
    body: { title: 'Ascensor', scope: { unit_ids: [1] } },
  }, res);

  assert.equal(res.statusCode, 202);
  assert.equal(received.data.community_id, 7);
  assert.deepEqual(received.affectedUnits, [{ unit_id: 1 }]);
});

test('master ticket creation rejects a foreign related ID without queueing', async () => {
  let enqueued = false;
  const scopeError = new Error('invalid scope');
  scopeError.code = 'MASTER_TICKET_SCOPE_INVALID';
  const { create } = loadController({
    async createMasterTicket() {
      throw scopeError;
    },
    async enqueueSubTicketGeneration() {
      enqueued = true;
    },
  });
  const res = createResponse();

  await create({
    communityId: 7,
    user: { id: 5 },
    body: { title: 'Ataque', scope: { unit_ids: [99] } },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'El alcance no pertenece a tu comunidad' });
  assert.equal(enqueued, false);
});

test('master ticket detail allows a resource from req.communityId', async () => {
  const resource = { id: 41, community_id: 7, title: 'Ascensor' };
  const calls = [];
  const { getById } = loadController({
    async getMasterTicket(id, communityId) {
      calls.push([id, communityId]);
      return scopedLookup(resource)(id, communityId);
    },
  });
  const res = createResponse();

  await getById({ params: { id: '41' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 41);
  assert.deepEqual(calls, [['41', 7]]);
});

test('master ticket detail hides a valid ID from another community', async () => {
  const foreign = { id: 41, community_id: 8, title: 'Privado' };
  const { getById } = loadController({ getMasterTicket: scopedLookup(foreign) });
  const res = createResponse();

  await getById({ params: { id: '41' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Master ticket no encontrado' });
});

test('master ticket update does not mutate a valid ID from another community', async () => {
  const foreign = { id: 52, community_id: 8, title: 'Privado' };
  let updated = false;
  const { update } = loadController({
    getMasterTicket: scopedLookup(foreign),
    async updateMasterTicket() {
      updated = true;
      return foreign;
    },
  });
  const res = createResponse();

  await update({ params: { id: '52' }, communityId: 7, body: { title: 'Ataque' } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(updated, false);
});

test('resolving a sub-ticket rechecks master and ticket scope', async () => {
  const own = {
    id: 61,
    community_id: 7,
    sub_tickets: [{ id: 610, master_ticket_id: 61, community_id: 7, status: 'open' }],
  };
  const calls = [];
  const { resolveSubTicket } = loadController({
    getMasterTicket: scopedLookup(own),
    async resolveSubTicket(masterId, ticketId, communityId) {
      calls.push([masterId, ticketId, communityId]);
      return { ticket: own.sub_tickets[0], master_closed: false };
    },
  });
  const res = createResponse();

  await resolveSubTicket({ params: { id: '61', ticketId: '610' }, communityId: 7 }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [['61', 610, 7]]);
});

test('resolve and notify reject a master ticket from another community without side effects', async () => {
  const foreign = {
    id: 62,
    community_id: 8,
    status: 'open',
    sub_tickets: [{ id: 620, master_ticket_id: 62, community_id: 8 }],
  };
  let resolved = false;
  let enqueued = false;
  const controller = loadController({
    getMasterTicket: scopedLookup(foreign),
    async resolveSubTicket() {
      resolved = true;
      return { ticket: foreign.sub_tickets[0], master_closed: false };
    },
    async enqueueSubTicketGeneration() {
      enqueued = true;
      return { enqueued: true, jobId: 'foreign' };
    },
  });

  const resolveRes = createResponse();
  await controller.resolveSubTicket(
    { params: { id: '62', ticketId: '620' }, communityId: 7 },
    resolveRes
  );
  const notifyRes = createResponse();
  await controller.notify({ params: { id: '62' }, communityId: 7 }, notifyRes);

  assert.equal(resolveRes.statusCode, 404);
  assert.equal(notifyRes.statusCode, 404);
  assert.equal(resolved, false);
  assert.equal(enqueued, false);
});
