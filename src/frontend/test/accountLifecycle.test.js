import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRecoveryService } from '../src/services/accountRecovery.js';
import {
  addResendingInvite,
  createInviteRequestTracker,
  inviteStatusLabel,
  partitionInvites,
  removeResendingInvite,
} from '../src/utils/invitePresentation.js';

test('account recovery service sends only the email on forgot request', async () => {
  const calls = [];
  const service = createAccountRecoveryService({
    post: async (...args) => { calls.push(args); return { data: { message: 'generic' } }; },
  });

  await service.request('resident@example.test');

  assert.deepEqual(calls, [['/auth/forgot-password', { email: 'resident@example.test' }]]);
});

test('account recovery service sends the encoded token only in the reset path', async () => {
  const calls = [];
  const service = createAccountRecoveryService({
    post: async (...args) => { calls.push(args); return { data: { message: 'updated' } }; },
  });

  await service.reset('token/with spaces', 'Secure123!');

  assert.deepEqual(calls, [[
    '/auth/reset-password/token%2Fwith%20spaces',
    { password: 'Secure123!' },
  ]]);
});

test('invite presentation separates pending from immutable history', () => {
  const rows = [
    { id: 1, status: 'pending' },
    { id: 2, status: 'used' },
    { id: 3, status: 'expired' },
  ];

  assert.deepEqual(partitionInvites(rows), {
    pending: [rows[0]],
    history: [rows[1], rows[2]],
  });
});

test('invite status labels expose only user-facing state', () => {
  assert.equal(inviteStatusLabel('pending'), 'Pendiente');
  assert.equal(inviteStatusLabel('used'), 'Usada');
  assert.equal(inviteStatusLabel('expired'), 'Vencida');
});

test('invite request tracking publishes only the latest load generation', () => {
  const tracker = createInviteRequestTracker();
  const initialLoad = tracker.begin();
  const refreshedLoad = tracker.begin();

  assert.equal(tracker.isCurrent(initialLoad), false);
  assert.equal(tracker.isCurrent(refreshedLoad), true);

  tracker.invalidate();
  assert.equal(tracker.isCurrent(refreshedLoad), false);
});

test('resend in-flight ids ignore duplicates and settle only their own row', () => {
  const firstRow = addResendingInvite(new Set(), 11);
  const duplicateFirstRow = addResendingInvite(firstRow, 11);
  const bothRows = addResendingInvite(duplicateFirstRow, 22);
  const firstSettled = removeResendingInvite(bothRows, 11);

  assert.equal(duplicateFirstRow, firstRow);
  assert.deepEqual([...bothRows], [11, 22]);
  assert.deepEqual([...firstSettled], [22]);
});
