import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRecoveryService } from '../src/services/accountRecovery.js';
import { consumeFragmentToken } from '../src/utils/fragmentToken.js';
import { validateResetPassword, resetPasswordErrorMessage } from '../src/utils/passwordReset.js';
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

test('fragment token is returned and immediately removed without storage access', () => {
  const replacements = [];
  const windowLike = {
    location: { hash: '#token=' + 'c'.repeat(64), pathname: '/reset-password', search: '?source=email' },
    history: { replaceState: (...args) => replacements.push(args) },
    get localStorage() { assert.fail('must not access localStorage'); },
    get sessionStorage() { assert.fail('must not access sessionStorage'); },
  };

  assert.equal(consumeFragmentToken(windowLike), 'c'.repeat(64));
  assert.deepEqual(replacements, [[null, '', '/reset-password?source=email']]);
});

test('missing fragment token returns null and leaves the URL untouched', () => {
  for (const hash of ['', '#source=email', '#token=']) {
    const windowLike = {
      location: { hash, pathname: '/reset-password', search: '' },
      history: { replaceState: () => assert.fail('must leave URL untouched') },
    };
    assert.equal(consumeFragmentToken(windowLike), null);
  }
});

test('fragment token is decoded once and safely encoded for the API path', async () => {
  const calls = [];
  const windowLike = {
    location: { hash: '#token=token%2Fwith%20spaces%2B%252F', pathname: '/reset-password', search: '' },
    history: { replaceState: () => { windowLike.location.hash = ''; } },
  };
  const service = createAccountRecoveryService({
    post: async (...args) => { calls.push(args); return { data: {} }; },
  });

  const token = consumeFragmentToken(windowLike);
  assert.equal(token, 'token/with spaces+%2F');
  assert.equal(consumeFragmentToken(windowLike), null);
  await service.reset(token, 'Secure123!');
  assert.deepEqual(calls, [[
    '/auth/reset-password/token%2Fwith%20spaces%2B%252F',
    { password: 'Secure123!' },
  ]]);
});

test('reset validation blocks missing token, empty fields, short and mismatched passwords', () => {
  assert.equal(validateResetPassword(null, 'Secure123!', 'Secure123!'), 'El enlace es inválido, venció o ya fue utilizado.');
  assert.equal(validateResetPassword('token', '', ''), 'Completá ambos campos de contraseña.');
  assert.equal(validateResetPassword('token', 'Secure123!', ''), 'Completá ambos campos de contraseña.');
  assert.equal(validateResetPassword('token', '12345', '12345'), 'La contraseña debe tener al menos 6 caracteres.');
  assert.equal(validateResetPassword('token', '123456', '654321'), 'Las contraseñas no coinciden.');
  assert.equal(validateResetPassword('token', '123456', '123456'), null);
});

test('reset errors use fixed messages without exposing backend error text', () => {
  assert.equal(resetPasswordErrorMessage({ response: { status: 400, data: { error: 'secret token' } } }), 'El enlace es inválido, venció o ya fue utilizado.');
  for (const error of [new Error('secret token'), { response: { status: 500, data: { error: 'secret token' } } }]) {
    assert.equal(resetPasswordErrorMessage(error), 'No pudimos actualizar la contraseña. Intentá nuevamente.');
  }
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
