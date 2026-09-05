import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRecoveryService } from '../src/services/accountRecovery.js';
import { consumeFragmentToken, subscribeFragmentToken } from '../src/utils/fragmentToken.js';
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

test('account recovery service sends the reset credential only in the JSON body', async () => {
  const calls = [];
  const service = createAccountRecoveryService({
    post: async (...args) => { calls.push(args); return { data: { message: 'updated' } }; },
  });

  const resetToken = 'token/with spaces';
  const password = 'Secure123!';
  await service.reset(resetToken, password);

  assert.equal(calls.length, 1);
  const [url, body] = calls[0];
  assert.equal(url === '/auth/reset-password', true, 'reset URL must not contain a credential');
  assert.deepEqual(Object.keys(body).sort(), ['password', 'token']);
  assert.equal(body.token === resetToken, true, 'reset body must contain the supplied credential');
  assert.equal(body.password === password, true, 'reset body must contain the supplied password');
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

test('fragment token is decoded once and sent in the reset request body', async () => {
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
  assert.equal(calls.length, 1);
  const [url, body] = calls[0];
  assert.equal(url === '/auth/reset-password', true, 'fragment credentials must not be placed in the URL');
  assert.deepEqual(Object.keys(body).sort(), ['password', 'token']);
  assert.equal(body.token === token, true, 'decoded fragment credential must be sent unchanged in the body');
  assert.equal(body.password === 'Secure123!', true);
});

function fragmentWindow(hash = '') {
  const events = new EventTarget();
  const replacements = [];
  let lastListener;
  const windowLike = {
    location: { hash, pathname: '/reset-password', search: '?source=email' },
    history: {
      replaceState: (...args) => {
        replacements.push(args);
        windowLike.location.hash = '';
        events.dispatchEvent(new Event('hashchange'));
      },
    },
    addEventListener: (type, listener) => {
      lastListener = listener;
      events.addEventListener(type, listener);
    },
    removeEventListener: (type, listener) => events.removeEventListener(type, listener),
    get localStorage() { assert.fail('must not access localStorage'); },
    get sessionStorage() { assert.fail('must not access sessionStorage'); },
  };
  return {
    windowLike,
    replacements,
    dispatchHashChange: () => events.dispatchEvent(new Event('hashchange')),
    dispatchQueuedListener: () => lastListener(),
  };
}

test('mounted fragment subscription synchronously cleans and delivers each new token once', () => {
  const browser = fragmentWindow();
  const delivered = [];
  const unsubscribe = subscribeFragmentToken(browser.windowLike, (token) => {
    assert.equal(browser.windowLike.location.hash, '', 'cleanup precedes memory callback');
    delivered.push(token);
    browser.dispatchHashChange();
  });

  assert.deepEqual(delivered, []);
  browser.windowLike.location.hash = '#token=next%2Ftoken%2B%252F';
  browser.dispatchHashChange();
  browser.dispatchHashChange();
  browser.windowLike.location.hash = '#token=another-token';
  browser.dispatchHashChange();

  assert.deepEqual(delivered, ['next/token+%2F', 'another-token']);
  assert.deepEqual(browser.replacements, [
    [null, '', '/reset-password?source=email'],
    [null, '', '/reset-password?source=email'],
  ]);
  unsubscribe();
});

test('fragment subscription consumes a router-updated fragment when installed without a hashchange event', () => {
  const browser = fragmentWindow('#token=router-token');
  const delivered = [];
  const unsubscribe = subscribeFragmentToken(browser.windowLike, token => delivered.push(token));

  assert.deepEqual(delivered, ['router-token']);
  assert.deepEqual(browser.replacements, [[null, '', '/reset-password?source=email']]);
  unsubscribe();
});

test('fragment unsubscribe blocks queued callbacks and leaves later fragments untouched', () => {
  const browser = fragmentWindow();
  const unsubscribe = subscribeFragmentToken(browser.windowLike, () => assert.fail('must not update unmounted component'));
  unsubscribe();
  unsubscribe();
  browser.windowLike.location.hash = '#token=after-unmount';
  browser.dispatchHashChange();
  browser.dispatchQueuedListener();

  assert.equal(browser.windowLike.location.hash, '#token=after-unmount');
  assert.deepEqual(browser.replacements, []);
});

test('fragment subscription does not consume another route token before unmount cleanup', () => {
  const browser = fragmentWindow();
  const unsubscribe = subscribeFragmentToken(browser.windowLike, () => assert.fail('must not consume another route token'));
  browser.windowLike.location.pathname = '/register';
  browser.windowLike.location.hash = '#token=invitation-token';
  browser.dispatchHashChange();

  assert.equal(browser.windowLike.location.hash, '#token=invitation-token');
  assert.deepEqual(browser.replacements, []);
  unsubscribe();
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
