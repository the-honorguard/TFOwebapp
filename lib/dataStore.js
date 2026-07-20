import db from '../db.js';
import { readFileSync } from 'node:fs';

const DEMO_DATA = JSON.parse(readFileSync(new URL('../data/demo-data.json', import.meta.url), 'utf8'));

// Some databases created by older versions contain scalar values such as
// `none` in columns that are JSON-backed today. Keep those values readable;
// the next write will serialize them as valid JSON automatically.
function parseStoredJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const DEFAULT_PERMISSION_GROUPS = [
  { slug: 'admin', name: 'Admin', permissions: {
    view_overview: true, view_operations: true, edit_operations: true,
    view_templates: true, edit_templates: true, view_campaigns: true, edit_campaigns: true,
    view_players: true, edit_players: true, view_settings: true, edit_settings: true,
    edit_roles: true, edit_ranks: true, edit_squad_types: true,
    manage_backups: true, manage_permissions: true, assign_players: true,
    view_training: true, view_training_mine: true, view_training_queue: true, view_training_sessions: true, view_training_history: true, manage_training: true, manage_training_admin: true
  } },
  { slug: 'missionmaker', name: 'Missionmaker', permissions: {
    view_overview: true, view_operations: true, edit_operations: true,
    view_templates: true, edit_templates: true, view_campaigns: true, edit_campaigns: true,
    view_players: true, edit_players: false, view_settings: false, edit_settings: false,
    edit_roles: false, edit_ranks: false, edit_squad_types: false,
    manage_backups: false, manage_permissions: false, assign_players: true,
    view_training: true, view_training_mine: true, view_training_queue: false, view_training_sessions: true, view_training_history: true, manage_training: false, manage_training_admin: false
  } },
  { slug: 'member', name: 'Member', permissions: {
    view_overview: true, view_operations: false, edit_operations: false,
    view_templates: false, edit_templates: false, view_campaigns: false, edit_campaigns: false,
    view_players: false, edit_players: false, view_settings: false, edit_settings: false,
    edit_roles: false, edit_ranks: false, edit_squad_types: false,
    manage_backups: false, manage_permissions: false, assign_players: false,
    view_training: true, view_training_mine: true, view_training_queue: false, view_training_sessions: true, view_training_history: true, manage_training: false, manage_training_admin: false
  } }
];

const DEFAULT_RANKS = [
  { id: 1,  name: 'Recruit',                short: 'RCT.',  order: 1,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/RCT.png' },
  { id: 2,  name: 'Private',                short: 'PVT.',  order: 2,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/PVT.png' },
  { id: 3,  name: 'Private First Class',    short: 'PFC.',  order: 3,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/PFC.png' },
  { id: 4,  name: 'Specialist First Class', short: 'SPC1.', order: 4,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/SPC1.png' },
  { id: 5,  name: 'Specialist Second Class',short: 'SPC2.', order: 5,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/SPC2.png' },
  { id: 6,  name: 'Specialist Third Class', short: 'SPC3.', order: 6,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/SPC3.png' },
  { id: 7,  name: 'Master Specialist',      short: 'MSP.',  order: 7,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/MSP.png' },
  { id: 8,  name: 'Corporal',               short: 'CPL.',  order: 8,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/CPL.png' },
  { id: 9,  name: 'Sergeant',               short: 'SGT.',  order: 9,  icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/SGT.png' },
  { id: 10, name: 'Staff Sergeant',         short: 'SSG.',  order: 10, icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/SSG.png' },
  { id: 11, name: 'Master Sergeant',        short: 'MSG.',  order: 11, icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/MSG.png' },
  { id: 12, name: 'Second Lieutenant',      short: '2LT.',  order: 12, icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/2LT.png' },
  { id: 13, name: 'First Lieutenant',       short: '1LT.',  order: 13, icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/1LT.png' },
  { id: 14, name: 'Captain',                short: 'CPT.',  order: 14, icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/CPT.png' },
  { id: 15, name: 'Major',                  short: 'MAJ.',  order: 15, icon: 'https://raw.githubusercontent.com/task-force-omega/mkdocs/main/docs/assets/images/Ranks/MAJ.png' }
];

const DEFAULT_SQUAD_TYPES = [
  { id: 1001, name: 'Infantry', icon: '/markers/infantry.svg' },
  { id: 1002, name: 'Armor', icon: '/markers/armor.svg' },
  { id: 1003, name: 'Engineer', icon: '/markers/engineer.svg' },
  { id: 1004, name: 'Medic', icon: '/markers/medic.svg' },
  { id: 1005, name: 'Recon', icon: '/markers/recon.svg' },
  { id: 1006, name: 'Artillery', icon: '/markers/artillery.svg' },
  { id: 1007, name: 'Logistics', icon: '/markers/logistics.svg' },
  { id: 1008, name: 'HQ', icon: '/markers/hq.svg' }
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
      is_drill_sergeant TINYINT(1) NOT NULL DEFAULT 0,
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

    await conn.query(`CREATE TABLE IF NOT EXISTS squad_types (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      icon VARCHAR(1024),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);
    try { await conn.query('ALTER TABLE users ADD COLUMN is_drill_sergeant TINYINT(1) NOT NULL DEFAULT 0 AFTER permissions'); } catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }

    await conn.query(`CREATE TABLE IF NOT EXISTS permission_groups (
      slug VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      is_system TINYINT(1) DEFAULT 0,
      permissions JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      actor_id BIGINT NULL,
      type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      entity_type VARCHAR(64) NULL,
      entity_id BIGINT NULL,
      metadata JSON NULL,
      read_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX notifications_user_created (user_id, created_at),
      INDEX notifications_user_read (user_id, read_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS training_settings (
      id TINYINT PRIMARY KEY DEFAULT 1,
      basic_role VARCHAR(255) NOT NULL DEFAULT 'Rifleman',
      cooldown_months INT NOT NULL DEFAULT 3,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);
    await conn.query("INSERT IGNORE INTO training_settings (id, basic_role, cooldown_months) VALUES (1, 'Rifleman', 3)");

    await conn.query(`CREATE TABLE IF NOT EXISTS trainer_role_rights (
      user_id BIGINT NOT NULL,
      role_name VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS training_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      role_name VARCHAR(255) NOT NULL,
      source ENUM('signup','self','staff') NOT NULL DEFAULT 'self',
      status ENUM('requested','claimed','planning','scheduled','completed','cancelled') NOT NULL DEFAULT 'requested',
      priority ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
      notes TEXT NULL,
      claimed_by BIGINT NULL,
      created_by BIGINT NULL,
      completed_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX training_requests_queue (status, role_name, created_at),
      INDEX training_requests_user (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS training_sessions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      role_name VARCHAR(255) NOT NULL,
      trainer_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      starts_at DATETIME NOT NULL,
      ends_at DATETIME NULL,
      capacity INT NOT NULL DEFAULT 1,
      is_open TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
      notes TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS training_participants (
      session_id BIGINT NOT NULL,
      request_id BIGINT NOT NULL,
      outcome ENUM('pending','passed','not_yet','absent') NOT NULL DEFAULT 'pending',
      assessment_notes TEXT NULL,
      assessed_by BIGINT NULL,
      assessed_at DATETIME NULL,
      PRIMARY KEY (session_id, request_id),
      FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (request_id) REFERENCES training_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (assessed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS training_proposals (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      request_id BIGINT NOT NULL,
      proposed_by BIGINT NOT NULL,
      starts_at DATETIME NOT NULL,
      ends_at DATETIME NULL,
      message TEXT NULL,
      status ENUM('pending','accepted','declined','superseded') NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME NULL,
      FOREIGN KEY (request_id) REFERENCES training_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (proposed_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`);

    await conn.query(`CREATE TABLE IF NOT EXISTS training_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      request_id BIGINT NULL,
      actor_id BIGINT NULL,
      action VARCHAR(64) NOT NULL,
      details JSON NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX training_audit_request (request_id, created_at),
      FOREIGN KEY (request_id) REFERENCES training_requests(id) ON DELETE SET NULL,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`);

    for (const group of DEFAULT_PERMISSION_GROUPS) {
      await conn.query(
        'INSERT IGNORE INTO permission_groups (slug, name, is_system, permissions) VALUES (?, ?, 1, ?)',
        [group.slug, group.name, JSON.stringify(group.permissions)]
      );
    }
    await conn.query("UPDATE permission_groups SET permissions=JSON_SET(COALESCE(permissions, JSON_OBJECT()), '$.view_training', true, '$.manage_training', false, '$.manage_training_admin', false) WHERE slug IN ('member','missionmaker')");
    await conn.query("UPDATE permission_groups SET permissions=JSON_SET(COALESCE(permissions, JSON_OBJECT()), '$.view_training_mine', true, '$.view_training_queue', false, '$.view_training_sessions', true, '$.view_training_history', true) WHERE slug IN ('member','missionmaker')");
    await conn.query("UPDATE permission_groups SET permissions=JSON_SET(COALESCE(permissions, JSON_OBJECT()), '$.view_training', true, '$.manage_training', true, '$.manage_training_admin', true) WHERE slug = 'admin'");
    await conn.query("UPDATE permission_groups SET permissions=JSON_SET(COALESCE(permissions, JSON_OBJECT()), '$.view_training_mine', true, '$.view_training_queue', true, '$.view_training_sessions', true, '$.view_training_history', true) WHERE slug = 'admin'");

    await migrateIdColumnsToBigInt(conn);
  } finally {
    conn.release();
  }
}

function buildDemoTemplateData(templateId) {
  let nextId = templateId + 1;
  return {
    defaultSettings: { ...DEMO_DATA.operationSettings },
    squads: DEMO_DATA.template.squads.map((squad) => ({
      id: nextId++,
      title: squad.title,
      lrChannel: squad.lrChannel ?? 1,
      srChannel: squad.srChannel,
      marker: squad.marker,
      markerIconUrl: `/markers/${squad.marker}.svg`,
      slots: squad.slots.map((slot) => ({
        id: nextId++,
        name: slot.name,
        role: slot.role,
        allowedRoles: [slot.allowedRole || slot.role],
        notes: slot.notes || '',
        assignedUserId: null
      }))
    }))
  };
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
  if (opsCount[0].c === 0 && process.env.ENABLE_DEMO_SEED === '1') await seedDemo();
}

async function readData() {
  const data = {};
  const [usersRows] = await db.query('SELECT u.*, up.display_name, up.bio, up.avatar_url, up.settings FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id');
  data.users = usersRows.map((u) => ({ id: u.id, username: u.username, email: u.email, password: u.password_hash, role: u.role, rank: u.rank, status: u.status, permissions: u.permissions || {}, isDrillSergeant: !!u.is_drill_sergeant, profile: { displayName: u.display_name, bio: u.bio, avatarUrl: u.avatar_url, settings: u.settings || {} } }));

  const [templates] = await db.query('SELECT * FROM templates');
  data.templates = templates.map((t) => ({ id: t.id, name: t.name, description: t.description, ... (t.data ? JSON.parse(typeof t.data === 'string' ? t.data : JSON.stringify(t.data)) : {}) }));

  const [ops] = await db.query('SELECT * FROM ops');
  data.ops = ops.map((o) => ({ id: o.id, title: o.title, templateId: o.template_id, ownerId: o.owner_id, scheduled_at: o.scheduled_at, timezone: o.timezone, recurrence: parseStoredJson(o.recurrence), ... (o.payload ? JSON.parse(typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload)) : {}) }));

  const [rec] = await db.query('SELECT * FROM recurrences');
  data.recurrences = rec.map((r) => ({ id: r.id, opId: r.op_id, rule: r.rule ? JSON.parse(typeof r.rule === 'string' ? r.rule : JSON.stringify(r.rule)) : null, nextRun: r.next_run }));

  const [campaigns] = await db.query('SELECT * FROM campaigns');
  data.campaigns = campaigns.map((c) => ({ id: c.id, name: c.name, data: c.data ? JSON.parse(typeof c.data === 'string' ? c.data : JSON.stringify(c.data)) : {} }));

  const [ranksRows] = await db.query('SELECT * FROM ranks');
  data.ranks = ranksRows.map((r) => ({ id: r.id, name: r.name, short: r.abbreviation || '', order: r.order_index || 0, icon: r.icon || null }));

  const [squadRows] = await db.query('SELECT * FROM squad_types');
  data.squadTypes = squadRows.map((s) => ({ id: s.id, name: s.name, icon: s.icon || null }));

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

    if (data.squadTypes) {
      await conn.query('DELETE FROM squad_types');
      for (const s of data.squadTypes) {
        await conn.query('INSERT INTO squad_types (id, name, icon) VALUES (?, ?, ?)', [s.id || null, s.name || null, s.icon || null]);
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
    const tables = ['training_audit', 'training_proposals', 'training_participants', 'training_sessions', 'training_requests', 'trainer_role_rights', 'training_settings', 'notifications', 'recurrences', 'ops', 'templates', 'roles', 'permission_groups', 'files', 'modlists', 'backups', 'campaigns', 'ranks', 'squad_types', 'user_profiles', 'users'];
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
  // Demo data is additive and idempotent: existing accounts/data are kept,
  // while a fresh database receives the complete spreadsheet-backed demo.
  const [ranksCount] = await db.query('SELECT COUNT(*) as c FROM ranks');
  if (ranksCount[0].c === 0) {
    for (const r of DEFAULT_RANKS) {
      try { await db.query('INSERT INTO ranks (id, name, abbreviation, order_index, icon) VALUES (?, ?, ?, ?, ?)', [r.id, r.name, r.short || r.abbreviation || null, r.order, r.icon || null]); } catch (e) { if (!(e && e.code === 'ER_DUP_ENTRY')) throw e; }
    }
  }
  const [squadCount] = await db.query('SELECT COUNT(*) as c FROM squad_types');
  if (squadCount[0].c === 0) {
    for (const s of DEFAULT_SQUAD_TYPES) {
      try { await db.query('INSERT INTO squad_types (id, name, icon) VALUES (?, ?, ?)', [s.id, s.name, s.icon || null]); } catch (e) { if (!(e && e.code === 'ER_DUP_ENTRY')) throw e; }
    }
  }

  const rankIds = Object.fromEntries(DEFAULT_RANKS.flatMap((rank) => {
    const abbreviation = (rank.short || '').replace('.', '');
    const entries = [[abbreviation, rank.id]];
    if (abbreviation === 'SPC1') entries.push(['SPC', rank.id]);
    return entries;
  }));

  for (const [username, rank, status, discordId, lastPromotion, lastTraining, eligibleForTraining, roleIndexes] of DEMO_DATA.players) {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    const permissions = Object.fromEntries(roleIndexes.map((index) => [DEMO_DATA.roleNames[index], true]));
    let userId;
    if (existing.length > 0) {
      userId = existing[0].id;
      await db.query(
        'UPDATE users SET `rank` = ?, status = ?, permissions = ? WHERE id = ?',
        [rankIds[rank] || null, status, JSON.stringify(permissions), userId]
      );
    } else {
      const [result] = await db.query(
        'INSERT INTO users (username, email, password_hash, role, `rank`, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, null, 'demo-login-disabled', 'member', rankIds[rank] || null, status, JSON.stringify(permissions)]
      );
      userId = result.insertId;
    }
    await db.query(
      `INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), settings = VALUES(settings)`,
      [userId, username, null, null, JSON.stringify({ discordId, lastPromotion, lastTraining, eligibleForTraining })]
    );
  }

  const roleBaseId = Date.now();
  for (const [index, name] of DEMO_DATA.roleNames.entries()) {
    const allowed = DEMO_DATA.players
      .filter((player) => player[7].includes(index))
      .map((player) => player[0]);
    await db.query(
      `INSERT INTO roles (id, name, is_system, occupied, slots, allowed, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), metadata = VALUES(metadata)`,
      [roleBaseId + index, name, 0, null, JSON.stringify([]), JSON.stringify(allowed), JSON.stringify({ source: 'TFO main docs / Playerlist' })]
    );
  }

  const [templateRows] = await db.query(
    'SELECT id, name, data FROM templates WHERE name IN (?, ?) ORDER BY name = ? DESC LIMIT 1',
    [DEMO_DATA.template.name, 'Demo Template', DEMO_DATA.template.name]
  );
  let demoTemplateId;
  let demoTemplateData;
  if (templateRows.length === 0) {
    demoTemplateId = Date.now() + 100;
    demoTemplateData = buildDemoTemplateData(demoTemplateId);
    await db.query(
      'INSERT INTO templates (id, name, owner_id, description, data) VALUES (?, ?, ?, ?, ?)',
      [demoTemplateId, DEMO_DATA.template.name, null, DEMO_DATA.template.description, JSON.stringify(demoTemplateData)]
    );
  } else {
    demoTemplateId = templateRows[0].id;
    demoTemplateData = buildDemoTemplateData(demoTemplateId);
    await db.query(
      'UPDATE templates SET name = ?, description = ?, data = ? WHERE id = ?',
      [DEMO_DATA.template.name, DEMO_DATA.template.description, JSON.stringify(demoTemplateData), demoTemplateId]
    );
  }

  const [demoOps] = await db.query('SELECT id, payload FROM ops WHERE title IN (?, ?) ORDER BY title = ? DESC LIMIT 1', [
    'Thursday Operation Demo',
    'Demo Operation',
    'Thursday Operation Demo'
  ]);
  if (demoOps.length === 0) {
    const now = new Date();
    const demoDate = now.toISOString().slice(0, 10);
    const demoOpId = Date.now() + 200;
    const squads = demoTemplateData.squads || demoTemplateData.sections || [];
    const demoPayload = {
      id: demoOpId,
      name: 'Thursday Operation Demo',
      templateId: demoTemplateId,
      date: demoDate,
      ...DEMO_DATA.operationSettings,
      squads: squads.map((squad) => ({ ...squad, slots: squad.slots.map((slot) => ({ ...slot })) }))
    };
    const scheduledAt = `${demoDate} ${DEMO_DATA.operationSettings.time}:00`;
    await db.query(
      'INSERT INTO ops (id, template_id, title, owner_id, scheduled_at, timezone, recurrence, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [demoOpId, demoTemplateId, demoPayload.name, null, scheduledAt, 'Europe/Amsterdam', JSON.stringify(null), JSON.stringify(demoPayload), 'scheduled']
    );
  } else {
    const demoOpId = demoOps[0].id;
    let existingPayload = {};
    try {
      existingPayload = typeof demoOps[0].payload === 'string' ? JSON.parse(demoOps[0].payload) : (demoOps[0].payload || {});
    } catch (error) { /* keep the safe empty fallback */ }
    const demoDate = existingPayload.date || new Date().toISOString().slice(0, 10);
    const squads = demoTemplateData.squads || demoTemplateData.sections || [];
    const demoPayload = {
      ...existingPayload,
      id: demoOpId,
      name: 'Thursday Operation Demo',
      templateId: demoTemplateId,
      date: demoDate,
      ...DEMO_DATA.operationSettings,
      squads: squads.map((squad) => ({ ...squad, slots: squad.slots.map((slot) => ({ ...slot })) }))
    };
    const scheduledAt = `${demoDate} ${DEMO_DATA.operationSettings.time}:00`;
    await db.query(
      'UPDATE ops SET template_id = ?, title = ?, scheduled_at = ?, timezone = ?, payload = ? WHERE id = ?',
      [demoTemplateId, demoPayload.name, scheduledAt, 'Europe/Amsterdam', JSON.stringify(demoPayload), demoOpId]
    );
  }

  return {
    defaultOpSettings: {
      ...DEMO_DATA.operationSettings,
      templateId: demoTemplateId
    }
  };
}

export { readData, writeData, ensureInitialized, ensureSchema, resetDatabase, seedEssential, seedDemo };
