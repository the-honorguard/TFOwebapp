import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, createRateLimiter, validatePassword } from './authSecurity.js';

test('password policy rejects missing, empty, short, long, and default passwords', () => {
  for (const password of [undefined, null, '', 'short', 'changeme', 'CHANGEme', 'admin', 'password']) {
    assert.equal(typeof validatePassword(password), 'string', String(password));
  }
  assert.equal(typeof validatePassword('x'.repeat(PASSWORD_MAX_LENGTH + 1)), 'string');
});

test('password policy accepts the inclusive length boundaries', () => {
  assert.equal(validatePassword('x'.repeat(PASSWORD_MIN_LENGTH)), null);
  assert.equal(validatePassword('x'.repeat(PASSWORD_MAX_LENGTH)), null);
});

test('rate limiter throttles repeated attempts and resets after its window', () => {
  let time = 1_000;
  const middleware = createRateLimiter({ windowMs: 10_000, max: 2, now: () => time });
  const req = { ip: '192.0.2.1' };
  const response = () => ({
    headers: {}, statusCode: 200,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });
  let calls = 0;
  assert.equal(middleware(req, response(), () => { calls += 1; }), undefined);
  assert.equal(middleware(req, response(), () => { calls += 1; }), undefined);
  const blocked = response();
  middleware(req, blocked, () => { calls += 1; });
  assert.equal(calls, 2);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '10');

  time = 11_000;
  middleware(req, response(), () => { calls += 1; });
  assert.equal(calls, 3);
});

test('rate limiter keeps clients in separate buckets', () => {
  const middleware = createRateLimiter({ windowMs: 1_000, max: 1, now: () => 0 });
  let calls = 0;
  middleware({ ip: 'client-a' }, { set() { return this; } }, () => { calls += 1; });
  middleware({ ip: 'client-b' }, { set() { return this; } }, () => { calls += 1; });
  assert.equal(calls, 2);
});

test('rate limiter can forget successful login checks', () => {
  const listeners = {};
  const response = () => ({
    statusCode: 200,
    set() { return this; },
    once(event, callback) { listeners[event] = callback; return this; }
  });
  const middleware = createRateLimiter({ windowMs: 10_000, max: 1, skipSuccessfulRequests: true });
  const req = { ip: 'recovery-client' };
  let calls = 0;

  const first = response();
  middleware(req, first, () => { calls += 1; });
  listeners.finish();
  middleware(req, response(), () => { calls += 1; });

  assert.equal(calls, 2);
});
