(async()=>{
  try{
    const res = await fetch('http://localhost:3001/api/public-data');
    const text = await res.text();
    try { const j = JSON.parse(text); console.log(JSON.stringify({ usersCount: j.users.length, containsTest: j.users.some(u => u.username && u.username.startsWith('smoke_test_user_')) }, null, 2)); }
    catch(e){ console.log('RESPONSE_TEXT:\n', text); }
  }catch(e){ console.error(e); process.exit(1); }
})();
