export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const DEFAULT_PASSWORDS = new Set([
  'admin',
  'changeme',
  'default',
  'letmein',
  'password',
  'password1',
  'welcome'
]);

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (DEFAULT_PASSWORDS.has(password.trim().toLowerCase())) {
    return 'Password is too common';
  }
  return null;
}

export function createRateLimiter({ windowMs, max, now = Date.now, skipSuccessfulRequests = false }) {
  const clients = new Map();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const currentTime = now();
    let entry = clients.get(key);
    if (!entry || currentTime >= entry.resetAt) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      clients.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000))));
      return res.status(429).json({ error: 'Too many attempts, please try again later' });
    }
    if (skipSuccessfulRequests && typeof res.once === 'function') {
      res.once('finish', () => {
        if (res.statusCode < 400) clients.delete(key);
      });
    }
    return next();
  };
}
