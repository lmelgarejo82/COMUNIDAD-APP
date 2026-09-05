// Explicit opt-in integration QA: run inside the existing backend container.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pool } = require('../db');
const { Booking } = require('../models/Booking');
const { Notification } = require('../models/Notification');
const controller = require('../controllers/bookingController');
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
const baseline = process.argv.includes('--baseline');
(async () => {
  const database = new URL(process.env.DATABASE_URL || 'http://unconfigured');
  assert.equal(database.hostname, 'db', 'run only inside the coordinated Docker backend');
  assert.equal(database.pathname, '/comunidad');
  assert.equal(process.env.UPLOAD_DIR, '/app/uploads');
  const marker = `qa5b-${crypto.randomUUID()}`;
  const communities = [], users = [], amenities = [], complexes = [];
  const originalOverlap = Booking.findOverlapping, originalNotification = Notification.create;
  try {
    console.log('database', (await pool.query('SELECT current_database() AS database, inet_server_addr() AS address')).rows[0]);
    for (let n = 0; n < 2; n++) {
      const c = (await pool.query('INSERT INTO communities(name,access_code) VALUES($1,$2) RETURNING id', [marker, `${marker}-${n}`])).rows[0].id; communities.push(c);
      const u = (await pool.query("INSERT INTO users(email,password_hash,role,unit_number,community_id) VALUES($1,'unused','residente','QA5B',$2) RETURNING id", [`${marker}-${n}@example.test`, c])).rows[0].id; users.push(u);
      const cx = (await pool.query('INSERT INTO complexes(name,community_id) VALUES($1,$2) RETURNING id', [marker, c])).rows[0].id; complexes.push(cx);
      const building = (await pool.query('INSERT INTO buildings(name,complex_id) VALUES($1,$2) RETURNING id', [marker, cx])).rows[0].id;
      const floor = (await pool.query('INSERT INTO floors(number,building_id) VALUES(1,$1) RETURNING id', [building])).rows[0].id;
      const unit = (await pool.query("INSERT INTO units(unit_code,floor_id) VALUES('QA5B',$1) RETURNING id", [floor])).rows[0].id;
      await pool.query('INSERT INTO unit_ownerships(unit_id,user_id) VALUES($1,$2)', [unit, u]);
      await pool.query('UPDATE users SET unit_id=$1 WHERE id=$2', [unit, u]);
      amenities.push((await pool.query('INSERT INTO amenities(community_id,name,rules) VALUES($1,$2,$3) RETURNING id', [c, marker, { max_hours: 4, advance_hours: 48, deposit: 123 }])).rows[0].id);
    }
    await pool.query("INSERT INTO users(email,password_hash,role,community_id) VALUES($1,'unused','admin',$2) RETURNING id", [`${marker}-admin@example.test`, communities[0]]).then(r => users.push(r.rows[0].id));
    const from = new Date(Date.now() + 96 * 3600000), to = new Date(from.getTime() + 3600000);
    const request = () => ({ body: { amenity_id: amenities[0], date_from: from.toISOString(), date_to: to.toISOString() }, user: { id: users[0], email: `${marker}@example.test` }, communityId: communities[0] });
    if (baseline) {
      let checks = 0, release;
      const barrier = new Promise(resolve => { release = resolve; });
      Booking.findOverlapping = async (...args) => { const result = await originalOverlap.apply(Booking, args); if (++checks === 2) release(); await barrier; return result; };
    }
    const creates = [response(), response()];
    await Promise.all(creates.map(res => controller.createBooking(request(), res)));
    Booking.findOverlapping = originalOverlap;
    const createCodes = creates.map(r => r.statusCode).sort(); console.log('overlapping create status', createCodes);
    const persisted = await pool.query('SELECT id,status,deposit_amount FROM bookings WHERE amenity_id=$1 ORDER BY id', [amenities[0]]);
    console.log('persisted overlap count', persisted.rowCount);
    if (!baseline) { assert.deepEqual(createCodes, [201, 409]); assert.equal(persisted.rowCount, 1); assert.equal(Number(persisted.rows[0].deposit_amount), 123); }
    const id = persisted.rows[0].id;
    const updates = [response(), response()];
    await Promise.all(['active', 'cancelled'].map((status, i) => controller.updateBookingStatus({ params: { id }, body: { status, expected_status: 'pending' }, communityId: communities[0] }, updates[i])));
    console.log('racing status codes', updates.map(r => r.statusCode).sort());
    if (!baseline) assert.deepEqual(updates.map(r => r.statusCode).sort(), [200, 409]);
    await pool.query("UPDATE bookings SET status='pending' WHERE id=$1", [id]);
    const before = Number((await pool.query('SELECT count(*) FROM notifications WHERE reference_id=$1 AND type=$2', [id, 'booking'])).rows[0].count);
    let notificationSqlState;
    const failNotificationInsert = async (payload, client) => {
      try { return await originalNotification.call(Notification, { ...payload, user_id: -2147483648 }, client); }
      catch (err) { notificationSqlState = err.code; throw err; }
    };
    Notification.create = failNotificationInsert;
    const failed = response(); const originalError = console.error; console.error = () => {};
    try { await controller.updateBookingStatus({ params: { id }, body: { status: 'active', expected_status: 'pending' }, communityId: communities[0] }, failed); } finally { console.error = originalError; Notification.create = originalNotification; }
    const after = (await pool.query('SELECT status FROM bookings WHERE id=$1', [id])).rows[0].status;
    console.log('notification failure', { code: failed.statusCode, status: after, sqlState: notificationSqlState });
    if (!baseline) { assert.equal(notificationSqlState, '23503'); assert.equal(failed.statusCode, 500); assert.equal(after, 'pending'); assert.equal(Number((await pool.query('SELECT count(*) FROM notifications WHERE reference_id=$1 AND type=$2', [id, 'booking'])).rows[0].count), before); }
    if (!baseline) {
      const createRequest = request();
      createRequest.body.date_from = new Date(from.getTime() + 86400000).toISOString();
      createRequest.body.date_to = new Date(to.getTime() + 86400000).toISOString();
      const countBefore = (await pool.query('SELECT count(*) FROM bookings WHERE amenity_id=$1', [amenities[0]])).rows[0].count;
      Notification.create = failNotificationInsert;
      const createFailure = response(); console.error = () => {};
      try { await controller.createBooking(createRequest, createFailure); }
      finally { console.error = originalError; Notification.create = originalNotification; }
      const countAfter = (await pool.query('SELECT count(*) FROM bookings WHERE amenity_id=$1', [amenities[0]])).rows[0].count;
      assert.equal(createFailure.statusCode, 500); assert.equal(countAfter, countBefore);
      console.log('create notification failure rollback', { code: createFailure.statusCode, sqlState: notificationSqlState, unchanged: countAfter === countBefore });
    }
    const foreign = response(); await controller.updateBookingStatus({ params: { id }, body: { status: 'active', expected_status: 'pending' }, communityId: communities[1] }, foreign); assert.equal(foreign.statusCode, 404);
    console.log('foreign status', foreign.statusCode);
    if (baseline) assert.deepEqual(createCodes, [201, 409], 'baseline must reproduce simultaneous overlap defect');
    console.log('PostgreSQL booking QA PASS');
  } finally {
    Booking.findOverlapping = originalOverlap; Notification.create = originalNotification;
    await pool.query('DELETE FROM notifications WHERE user_id=ANY($1::int[])', [users]);
    await pool.query('DELETE FROM bookings WHERE amenity_id=ANY($1::int[])', [amenities]);
    await pool.query('DELETE FROM amenities WHERE id=ANY($1::int[])', [amenities]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
    await pool.query('DELETE FROM complexes WHERE id=ANY($1::int[])', [complexes]);
    await pool.query('DELETE FROM communities WHERE id=ANY($1::int[])', [communities]);
    const residue = await pool.query('SELECT (SELECT count(*) FROM communities WHERE id=ANY($1::int[])) + (SELECT count(*) FROM users WHERE id=ANY($2::int[])) + (SELECT count(*) FROM amenities WHERE id=ANY($3::int[])) + (SELECT count(*) FROM bookings WHERE amenity_id=ANY($3::int[])) + (SELECT count(*) FROM notifications WHERE user_id=ANY($2::int[])) AS count', [communities, users, amenities]);
    console.log('cleanup', { communities, users, amenities, complexes, residue: Number(residue.rows[0].count) });
    assert.equal(Number(residue.rows[0].count), 0); await pool.end();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
