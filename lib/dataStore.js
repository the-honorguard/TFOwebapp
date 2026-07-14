import db from '../db.js';

const DEFAULT_RANKS = [
  { id: 1,  name: 'Recruit',                short: 'RCT.',  order: 1,  icon: null },
  { id: 2,  name: 'Private',                short: 'PVT.',  order: 2,  icon: null },
  { id: 3,  name: 'Private First Class',    short: 'PFC.',  order: 3,  icon: null },
  { id: 4,  name: 'Specialist First Class', short: 'SPC1.', order: 4,  icon: null },
  { id: 5,  name: 'Specialist Second Class',short: 'SPC2.', order: 5,  icon: null },
  { id: 6,  name: 'Specialist Third Class', short: 'SPC3.', order: 6,  icon: null },
  { id: 7,  name: 'Master Specialist',      short: 'MSP.',  order: 7,  icon: null },
  { id: 8,  name: 'Corporal',               short: 'CPL.',  order: 8,  icon: null },
  { id: 9,  name: 'Sergeant',               short: 'SGT.',  order: 9,  icon: null },
  { id: 10, name: 'Staff Sergeant',         short: 'SSG.',  order: 10, icon: null },
  { id: 11, name: 'Master Sergeant',        short: 'MSG.',  order: 11, icon: null },
  { id: 12, name: 'Second Lieutenant',      short: '2LT.',  order: 12, icon: null },
  { id: 13, name: 'First Lieutenant',       short: '1LT.',  order: 13, icon: null },
  { id: 14, name: 'Captain',                short: 'CPT.',  order: 14, icon: null },
  { id: 15, name: 'Major',                  short: 'MAJ.',  order: 15, icon: null }
];

async function ensureSchema() {
  const conn = await db.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(255),
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      \`rank\` VARCHAR(255),
      status VARCHAR(100),
      permissions JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INT PRIMARY KEY,
      display_name VARCHAR(255),
      bio TEXT,
      avatar_url VARCHAR(1024),
      settings JSON,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS ranks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      abbreviation VARCHAR(32),
      order_index INT DEFAULT 0
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id INT,
      description TEXT,
      data JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS ops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      template_id INT,
      title VARCHAR(255),
      owner_id INT,
      scheduled_at DATETIME NULL,
      timezone VARCHAR(64) DEFAULT 'UTC',
      recurrence JSON NULL,
      payload JSON NOT NULL,
      status VARCHAR(50) DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS recurrences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      op_id INT NOT NULL,
      rule JSON NOT NULL,
      next_run DATETIME,
      FOREIGN KEY (op_id) REFERENCES ops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id INT,
      data JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS modlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id INT,
      mods JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(1024) NOT NULL,
      pathname VARCHAR(1024) NOT NULL,
      mimetype VARCHAR(255),
      size BIGINT,
      owner_id INT,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      data JSON NOT NULL
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS custom_roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    ) ENGINE=InnoDB;`);
  } finally {
    conn.release();
  }
}

async function ensureInitialized() {
  await ensureSchema();
  const [rows] = await db.query('SELECT COUNT(*) as c FROM users');
  if (rows[0].c === 0) {
    // create default admin user
    await db.query('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [1, 'admin', null, 'admin-disabled', 'admin']);
  }
  const [ranks] = await db.query('SELECT COUNT(*) as c FROM ranks');
  if (ranks[0].c === 0) {
    for (const r of DEFAULT_RANKS) {
      await db.query('INSERT INTO ranks (id, name, abbreviation, order_index) VALUES (?, ?, ?, ?)', [r.id, r.name, r.short || r.abbreviation || null, r.order]);
    }
  }
}

async function readData() {
  await ensureInitialized();
  const data = {};
  const [usersRows] = await db.query('SELECT u.*, up.display_name, up.bio, up.avatar_url, up.settings FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id');
  data.users = usersRows.map((u) => ({ id: u.id, username: u.username, email: u.email, password: u.password_hash, role: u.role, rank: u.rank, status: u.status, permissions: u.permissions || {}, profile: { displayName: u.display_name, bio: u.bio, avatarUrl: u.avatar_url, settings: u.settings || {} } }));

  const [templates] = await db.query('SELECT * FROM templates');
  data.templates = templates.map((t) => ({ id: t.id, name: t.name, description: t.description, ... (t.data ? JSON.parse(typeof t.data === 'string' ? t.data : JSON.stringify(t.data)) : {}) }));

  const [ops] = await db.query('SELECT * FROM ops');
  data.ops = ops.map((o) => ({ id: o.id, title: o.title, templateId: o.template_id, ownerId: o.owner_id, scheduled_at: o.scheduled_at, timezone: o.timezone, recurrence: o.recurrence ? JSON.parse(typeof o.recurrence === 'string' ? o.recurrence : JSON.stringify(o.recurrence)) : null, ... (o.payload ? JSON.parse(typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload)) : {}) }));

  const [rec] = await db.query('SELECT * FROM recurrences');
  data.recurrences = rec.map((r) => ({ id: r.id, opId: r.op_id, rule: r.rule ? JSON.parse(typeof r.rule === 'string' ? r.rule : JSON.stringify(r.rule)) : null, nextRun: r.next_run }));

  const [campaigns] = await db.query('SELECT * FROM campaigns');
  data.campaigns = campaigns.map((c) => ({ id: c.id, name: c.name, data: c.data ? JSON.parse(typeof c.data === 'string' ? c.data : JSON.stringify(c.data)) : {} }));

  const [ranksRows] = await db.query('SELECT * FROM ranks');
  data.ranks = ranksRows.map((r) => ({ id: r.id, name: r.name, short: r.abbreviation || '', order: r.order_index || 0, icon: r.icon || null }));

  const [modlists] = await db.query('SELECT * FROM modlists');
  data.modlists = modlists.map((m) => ({ id: m.id, name: m.name, ownerId: m.owner_id, mods: m.mods ? JSON.parse(typeof m.mods === 'string' ? m.mods : JSON.stringify(m.mods)) : [] }));

  const [customRoles] = await db.query('SELECT * FROM custom_roles');
  data.customRoles = customRoles.map((r) => ({ id: r.id, name: r.name }));

  return data;
}

async function writeData(data) {
  // naive full-replace strategy inside a transaction
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (data.users) {
      await conn.query('DELETE FROM user_profiles');
      await conn.query('DELETE FROM users');
      for (const u of data.users) {
        const id = u.id || null;
        await conn.query('INSERT INTO users (id, username, email, password_hash, role, rank, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, u.username, u.email || null, u.password || '', u.role || 'member', u.rank || null, u.status || null, JSON.stringify(u.permissions || {})]);
        if (u.profile) {
          await conn.query('INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), bio=VALUES(bio), avatar_url=VALUES(avatar_url), settings=VALUES(settings)', [u.id, u.profile.displayName || null, u.profile.bio || null, u.profile.avatarUrl || null, JSON.stringify(u.profile.settings || {})]);
        }
      }
    }

    if (data.ranks) {
      await conn.query('DELETE FROM ranks');
      for (const r of data.ranks) {
        await conn.query('INSERT INTO ranks (id, name, abbreviation, order_index) VALUES (?, ?, ?, ?)', [r.id || null, r.name, r.short || r.abbreviation || null, r.order || 0]);
      }
    }

    if (data.templates) {
      await conn.query('DELETE FROM templates');
      for (const t of data.templates) {
        const payload = t.data || (() => { const copy = { sections: t.sections || [] }; return copy; })();
        await conn.query('INSERT INTO templates (id, name, owner_id, description, data) VALUES (?, ?, ?, ?, ?)', [t.id || null, t.name || 'Untitled', t.ownerId || null, t.description || null, JSON.stringify(payload)]);
      }
    }

    if (data.ops) {
      await conn.query('DELETE FROM recurrences');
      await conn.query('DELETE FROM ops');
      for (const o of data.ops) {
        await conn.query('INSERT INTO ops (id, template_id, title, owner_id, scheduled_at, timezone, recurrence, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [o.id || null, o.templateId || null, o.name || o.title || null, o.ownerId || null, o.scheduled_at || null, o.timezone || 'UTC', JSON.stringify(o.recurrence || null), JSON.stringify(o), o.status || 'scheduled']);
      }
    }

    if (data.recurrences) {
      for (const r of data.recurrences) {
        await conn.query('INSERT INTO recurrences (id, op_id, rule, next_run) VALUES (?, ?, ?, ?)', [r.id || null, r.opId || null, JSON.stringify(r.rule || {}), r.nextDateTime || r.nextRun || null]);
      }
    }

    if (data.campaigns) {
      await conn.query('DELETE FROM campaigns');
      for (const c of data.campaigns) {
        await conn.query('INSERT INTO campaigns (id, name, owner_id, data) VALUES (?, ?, ?, ?)', [c.id || null, c.name || 'Campaign', c.missionmakerUserId || c.ownerId || null, JSON.stringify(c)]);
      }
    }

    if (data.modlists) {
      await conn.query('DELETE FROM modlists');
      for (const m of data.modlists) {
        await conn.query('INSERT INTO modlists (id, name, owner_id, mods) VALUES (?, ?, ?, ?)', [m.id || null, m.name || 'mods', m.ownerId || null, JSON.stringify(m.mods || [])]);
      }
    }

    if (data.customRoles) {
      await conn.query('DELETE FROM custom_roles');
      for (const r of data.customRoles) {
        await conn.query('INSERT INTO custom_roles (id, name) VALUES (?, ?)', [r.id || null, r.name]);
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export { readData, writeData, ensureInitialized, ensureSchema };
