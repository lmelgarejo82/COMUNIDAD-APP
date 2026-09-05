import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionInvites, inviteStatusLabel } from '../src/utils/invitePresentation.js';

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
