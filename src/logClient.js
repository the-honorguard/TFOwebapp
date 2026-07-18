// Forward console errors/warnings from the browser to the backend log endpoint.
function send(level, message, meta) {
  try {
    navigator && fetch && fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, meta })
    }).catch(() => {});
  } catch (e) {
    // ignore
  }
}

// capture console
['error', 'warn', 'info', 'log'].forEach((lvl) => {
  const orig = console[lvl];
  console[lvl] = function (...args) {
    try { send(lvl === 'log' ? 'info' : lvl, args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '), { userAgent: navigator.userAgent }); } catch (e) {}
    if (orig && typeof orig === 'function') orig.apply(console, args);
  };
});

window.addEventListener('error', (ev) => {
  send('error', ev.message, { filename: ev.filename, lineno: ev.lineno, colno: ev.colno });
});

window.addEventListener('unhandledrejection', (ev) => {
  send('error', ev.reason ? (typeof ev.reason === 'string' ? ev.reason : JSON.stringify(ev.reason)) : 'unhandledrejection', {});
});

export default { send };
