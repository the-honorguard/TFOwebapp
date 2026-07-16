export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('/api') ? endpoint : `/api${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (err) {
      throw new Error('Invalid JSON response from server');
    }
  }
  if (!res.ok) {
    // Clear stale token on unauthorized responses so the client stops retrying
    if (res.status === 401 && typeof window !== 'undefined' && window.localStorage) {
      try { window.localStorage.removeItem('token'); } catch (e) {}
    }
    const message = body && (body.error || body.message) ? (body.error || body.message) : `Server returned ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

export default apiFetch;
