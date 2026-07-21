(async () => {
  try {
    const password = process.env.TEST_ADMIN_PASSWORD;
    if (!password) throw new Error('TEST_ADMIN_PASSWORD is required');
    const authorization = `Basic ${Buffer.from(`${process.env.INIT_ADMIN_USERNAME || 'admin'}:${process.env.INIT_ADMIN_PASSWORD || ''}`).toString('base64')}`;
    const res = await fetch('http://localhost:3001/init/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ username: 'admin', password })
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();
