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

// Older DBs may have been created with INT id/foreign-key columns before the
// app started using Date.now() (13-digit ms timestamps) as ids, which overflow
// INT's ~2.1 billion max. This upgrades any lingering INT columns to BIGINT.
async function migrateIdColumnsToBigInt(conn) {
  const targets = [
    ['users', 'id'],
    ['user_profiles', 'user_id'],
    ['ranks', 'id'],
    ['templates', 'id'],
    ['templates', 'owner_id'],
    ['ops', 'id'],
    ['ops', 'template_id'],
    ['ops', 'owner_id'],
    ['recurrences', 'id'],
    ['recurrences', 'op_id'],
    ['campaigns', 'id'],
    ['campaigns', 'owner_id'],
    ['modlists', 'id'],
    ['modlists', 'owner_id'],
    ['files', 'id'],
    ['files', 'owner_id'],
    ['backups', 'id'],
    ['roles', 'id']
  ];

  const [rows] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?) AND DATA_TYPE = 'int'`,
    [targets.map(([table]) => table)]
  );
  if (rows.length === 0) return;

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const row of rows) {
      const isTarget = targets.some(([table, column]) => table === row.TABLE_NAME && column === row.COLUMN_NAME);
      if (!isTarget) continue;
      const nullability = row.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL';
      const extra = row.EXTRA && row.EXTRA.includes('auto_increment') ? 'AUTO_INCREMENT' : '';
      await conn.query(`ALTER TABLE \`${row.TABLE_NAME}\` MODIFY COLUMN \`${row.COLUMN_NAME}\` BIGINT ${nullability} ${extra}`.trim());
    }
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function ensureSchema() {
  const conn = await db.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
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
      user_id BIGINT PRIMARY KEY,
      display_name VARCHAR(255),
      bio TEXT,
      avatar_url VARCHAR(1024),
      settings JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS ranks (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      abbreviation VARCHAR(32),
      order_index INT DEFAULT 0,
      icon VARCHAR(1024),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS templates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id BIGINT,
      description TEXT,
      data JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS ops (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      template_id BIGINT,
      title VARCHAR(255),
      owner_id BIGINT,
      scheduled_at DATETIME NULL,
      timezone VARCHAR(64) DEFAULT 'UTC',
      recurrence JSON NULL,
      payload JSON NOT NULL,
      status VARCHAR(50) DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS recurrences (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      op_id BIGINT NOT NULL,
      rule JSON NOT NULL,
      next_run DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (op_id) REFERENCES ops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS campaigns (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id BIGINT,
      data JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS modlists (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id BIGINT,
      mods JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS files (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(1024) NOT NULL,
      pathname VARCHAR(1024) NOT NULL,
      mimetype VARCHAR(255),
      size BIGINT,
      owner_id BIGINT,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS backups (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      data JSON NOT NULL
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS roles (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      is_system TINYINT(1) DEFAULT 0,
      occupied JSON,
      slots JSON,
      allowed JSON,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await migrateIdColumnsToBigInt(conn);
  } finally {
    conn.release();
  }
}

async function ensureInitialized() {
  await ensureSchema();
  const [rows] = await db.query('SELECT COUNT(*) as c FROM users');
  if (rows[0].c === 0) {
    // create default admin user (ignore duplicate-key races)
    try {
      await db.query('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [1, 'admin', null, 'admin-disabled', 'admin']);
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') {
        // another process seeded concurrently; continue
      } else throw e;
    }
  }

  // If there are no ops/templates yet, insert a tiny demo template and demo op
  // so public visitors see something on the Overview page by default. This
  // behavior can be disabled by setting SKIP_DEMO_SEED=1 in the environment.
  const [opsCount] = await db.query('SELECT COUNT(*) as c FROM ops');
  // Only seed demo data when explicitly enabled. Use environment variable
  // `ENABLE_DEMO_SEED=1` to opt-in. This prevents demo data appearing by
  // default when running `POST /init`.
  if (opsCount[0].c === 0 && process.env.ENABLE_DEMO_SEED === '1') {
    const demoTemplateId = Date.now();
    const demoSectionId = demoTemplateId + 1;
    const demoSlotId1 = demoTemplateId + 11;
    const demoSlotId2 = demoTemplateId + 12;
    const demoTemplateData = {
      sections: [
        {
          id: demoSectionId,
          title: 'Alpha',
          lrChannel: 1,
          srChannel: 1,
          marker: null,
          markerIconUrl: null,
          slots: [
            { id: demoSlotId1, name: 'Alpha Lead', role: 'Leader', allowedRoles: [], notes: '', assignedUserId: null },
            { id: demoSlotId2, name: 'Alpha Rifleman', role: 'Rifleman', allowedRoles: [], notes: '', assignedUserId: null }
          ]
        }
      ]
    };

    try {
      await db.query('INSERT INTO templates (id, name, owner_id, description, data) VALUES (?, ?, ?, ?, ?)', [demoTemplateId, 'Demo Template', null, 'Demo template for public overview', JSON.stringify(demoTemplateData)]);
      const now = new Date();
      const demoOpId = Date.now() + 5;
      const demoDate = now.toISOString().slice(0, 10);
      const demoTime = '20:00';
      const demoPayload = {
        id: demoOpId,
        name: 'Demo Operation',
        templateId: demoTemplateId,
        date: demoDate,
        time: demoTime,
        serverName: 'Demo Server',
        tsAddress: '',
        sections: demoTemplateData.sections.map((s) => ({ id: s.id, title: s.title, slots: s.slots }))
      };
      const scheduledAt = `${demoDate} 20:00:00`;
      await db.query('INSERT INTO ops (id, template_id, title, owner_id, scheduled_at, timezone, recurrence, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [demoOpId, demoTemplateId, demoPayload.name, null, scheduledAt, 'UTC', JSON.stringify(null), JSON.stringify(demoPayload), 'scheduled']);
    } catch (err) {
      // ignore seeding errors (e.g., concurrent init); this is purely convenience
      console.error('Demo seed error', err && err.message ? err.message : err);
    }
  }
}

async function readData() {
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

  const [rolesRows] = await db.query('SELECT * FROM roles');
  data.customRoles = rolesRows.map((r) => ({
    id: r.id,
    name: r.name,
    system: !!r.is_system,
    occupied: r.occupied ? JSON.parse(typeof r.occupied === 'string' ? r.occupied : JSON.stringify(r.occupied)) : null,
    slots: r.slots ? JSON.parse(typeof r.slots === 'string' ? r.slots : JSON.stringify(r.slots)) : [],
    allowed: r.allowed ? JSON.parse(typeof r.allowed === 'string' ? r.allowed : JSON.stringify(r.allowed)) : [],
    metadata: r.metadata ? JSON.parse(typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata)) : {}
  }));

  return data;
}

async function writeData(data) {
  // naive full-replace strategy inside a transaction
  const conn = await db.getConnection();
  function formatSqlDatetime(val) {
    if (!val) return null;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  try {
    await conn.beginTransaction();

    if (data.users) {
      await conn.query('DELETE FROM user_profiles');
      await conn.query('DELETE FROM users');
      for (const u of data.users) {
        const id = u.id || null;
        await conn.query('INSERT INTO users (id, username, email, password_hash, role, `rank`, `status`, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, u.username, u.email || null, u.password || '', u.role || 'member', u.rank || null, u.status || null, JSON.stringify(u.permissions || {})]);
        if (u.profile) {
          await conn.query('INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), bio=VALUES(bio), avatar_url=VALUES(avatar_url), settings=VALUES(settings)', [u.id, u.profile.displayName || null, u.profile.bio || null, u.profile.avatarUrl || null, JSON.stringify(u.profile.settings || {})]);
        }
      }
    }

    if (data.ranks) {
      await conn.query('DELETE FROM ranks');
      for (const r of data.ranks) {
        await conn.query('INSERT INTO ranks (id, name, abbreviation, order_index, icon) VALUES (?, ?, ?, ?, ?)', [r.id || null, r.name, r.short || r.abbreviation || null, r.order || 0, r.icon || null]);
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
        const scheduledAt = formatSqlDatetime(o.scheduled_at) || null;
        await conn.query('INSERT INTO ops (id, template_id, title, owner_id, scheduled_at, timezone, recurrence, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [o.id || null, o.templateId || null, o.name || o.title || null, o.ownerId || null, scheduledAt, o.timezone || 'UTC', JSON.stringify(o.recurrence || null), JSON.stringify(o), o.status || 'scheduled']);
      }
    }

    if (data.recurrences) {
      for (const r of data.recurrences) {
        const nextRun = formatSqlDatetime(r.nextDateTime || r.nextRun) || null;
        await conn.query('INSERT INTO recurrences (id, op_id, rule, next_run) VALUES (?, ?, ?, ?)', [r.id || null, r.opId || null, JSON.stringify(r.rule || {}), nextRun]);
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
      await conn.query('DELETE FROM roles');
      for (const r of data.customRoles) {
        await conn.query('INSERT INTO roles (id, name, is_system, occupied, slots, allowed, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            r.id || null,
            r.name,
            r.system ? 1 : 0,
            r.occupied ? JSON.stringify(r.occupied) : null,
            r.slots ? JSON.stringify(r.slots) : JSON.stringify([]),
            r.allowed ? JSON.stringify(r.allowed) : JSON.stringify([]),
            r.metadata ? JSON.stringify(r.metadata) : JSON.stringify({})
          ]);
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

async function resetDatabase() {
  const conn = await db.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    // Drop in safe order
    const tables = ['recurrences', 'ops', 'templates', 'roles', 'files', 'modlists', 'backups', 'campaigns', 'ranks', 'user_profiles', 'users'];
    for (const t of tables) {
      try { await conn.query(`DROP TABLE IF EXISTS \`${t}\``); } catch (e) { /* ignore */ }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    // Recreate empty schema (tables) but do not seed data here so reset can produce an empty DB
    try {
      await ensureSchema();
    } catch (e) {
      // If ensureSchema fails, surface original error handling to caller
      throw e;
    }
  } finally {
    conn.release();
  }
}

async function seedEssential() {
  // Seed admin and ranks (idempotent)
  const [rows] = await db.query('SELECT COUNT(*) as c FROM users');
  if (rows[0].c === 0) {
    try { await db.query('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [1, 'admin', null, 'admin-disabled', 'admin']); } catch (e) { if (!(e && e.code === 'ER_DUP_ENTRY')) throw e; }
  }
}

async function seedDemo() {
  // Seed ranks as part of demo data so demo is self-contained. This ensures
  // running `POST /init` without demo does not populate ranks.
  const [ranksCount] = await db.query('SELECT COUNT(*) as c FROM ranks');
  if (ranksCount[0].c === 0) {
    for (const r of DEFAULT_RANKS) {
      try { await db.query('INSERT INTO ranks (id, name, abbreviation, order_index, icon) VALUES (?, ?, ?, ?, ?)', [r.id, r.name, r.short || r.abbreviation || null, r.order, r.icon || null]); } catch (e) { if (!(e && e.code === 'ER_DUP_ENTRY')) throw e; }
    }
  }
  const [opsCount] = await db.query('SELECT COUNT(*) as c FROM ops');
  if (opsCount[0].c === 0) {
    const demoTemplateId = Date.now();
    const demoSectionId = demoTemplateId + 1;
    const demoSlotId1 = demoTemplateId + 11;
    const demoSlotId2 = demoTemplateId + 12;
    const demoTemplateData = {
      sections: [
        {
          id: demoSectionId,
          title: 'Alpha',
          lrChannel: 1,
          srChannel: 1,
          marker: null,
          markerIconUrl: null,
          slots: [
            { id: demoSlotId1, name: 'Alpha Lead', role: 'Leader', allowedRoles: [], notes: '', assignedUserId: null },
            { id: demoSlotId2, name: 'Alpha Rifleman', role: 'Rifleman', allowedRoles: [], notes: '', assignedUserId: null }
          ]
        }
      ]
    };
    try {
      await db.query('INSERT INTO templates (id, name, owner_id, description, data) VALUES (?, ?, ?, ?, ?)', [demoTemplateId, 'Demo Template', null, 'Demo template for public overview', JSON.stringify(demoTemplateData)]);
      const now = new Date();
      const demoOpId = Date.now() + 5;
      const demoDate = now.toISOString().slice(0, 10);
      const demoTime = '20:00';
      const demoPayload = {
        id: demoOpId,
        name: 'Demo Operation',
        templateId: demoTemplateId,
        date: demoDate,
        time: demoTime,
        serverName: 'Demo Server',
        tsAddress: '',
        sections: demoTemplateData.sections.map((s) => ({ id: s.id, title: s.title, slots: s.slots }))
      };
      const scheduledAt = `${demoDate} 20:00:00`;
      await db.query('INSERT INTO ops (id, template_id, title, owner_id, scheduled_at, timezone, recurrence, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [demoOpId, demoTemplateId, demoPayload.name, null, scheduledAt, 'UTC', JSON.stringify(null), JSON.stringify(demoPayload), 'scheduled']);
    } catch (err) {
      console.error('Demo seed error', err && err.message ? err.message : err);
    }
  }
}

export { readData, writeData, ensureInitialized, ensureSchema, resetDatabase, seedEssential, seedDemo };
