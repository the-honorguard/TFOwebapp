(async () => {
  try {
    const res = await fetch('http://localhost:3001/init/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();
