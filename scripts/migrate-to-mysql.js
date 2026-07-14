import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const configPath = process.argv[2] || path.join('config', 'mysql.json');

async function loadConfig(p) {
  try {
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load config from', p, err.message);
    process.exit(1);
  }
}

async function ensureSchema(conn) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(255),
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      \`rank\` VARCHAR(255),
      \`status\` VARCHAR(100),
      \`permissions\` JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INT PRIMARY KEY,
      display_name VARCHAR(255),
      bio TEXT,
      avatar_url VARCHAR(1024),
      settings JSON,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(1024) NOT NULL,
      pathname VARCHAR(1024) NOT NULL,
      mimetype VARCHAR(255),
      size BIGINT,
      owner_id INT,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id INT,
      description TEXT,
      data JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS ops (
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS recurrences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      op_id INT NOT NULL,
      rule JSON NOT NULL,
      next_run DATETIME,
      FOREIGN KEY (op_id) REFERENCES ops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id INT,
      data JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS ranks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      abbreviation VARCHAR(32),
      order_index INT DEFAULT 0
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS modlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id INT,
      mods JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      data JSON NOT NULL
    ) ENGINE=InnoDB;`
  ];

  for (const s of stmts) {
    await conn.query(s);
  }
}

async function main() {
  const cfg = await loadConfig(configPath);

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || cfg.host,
    user: process.env.MYSQL_USER || cfg.user,
    password: process.env.MYSQL_PASSWORD || cfg.password,
    database: process.env.MYSQL_DATABASE || cfg.database,
    port: Number(process.env.MYSQL_PORT || cfg.port || 3306),
    waitForConnections: true,
    connectionLimit: 10
  });

  const conn = await pool.getConnection();
  try {
    console.log('Ensuring schema...');
    await ensureSchema(conn);
    // Ensure legacy columns exist (in case the table was created previously without these)
    try {
      await conn.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS `rank` VARCHAR(255)');
      await conn.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS `status` VARCHAR(100)');
      await conn.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS `permissions` JSON');
    } catch (e) {
      // ignore alter errors
    }
    console.log('Schema ensured.');

    // Optional: read existing JSON and report counts
    const dataPath = path.join('data', 'app-data.json');
    try {
      const raw = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(raw);
      console.log('Found data sections:');
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (Array.isArray(v)) console.log(`  ${k}: ${v.length} items`);
        else if (v && typeof v === 'object') console.log(`  ${k}: object`);
        else console.log(`  ${k}: ${typeof v}`);
      }

      // Perform migration: naive full-replace strategy preserving IDs where provided
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Users and profiles (handle very large legacy IDs by mapping)
        const userIdMap = new Map();
        function fitsInt(v) {
          if (v === null || typeof v === 'undefined') return false;
          const n = Number(v);
          return Number.isInteger(n) && Math.abs(n) <= 2147483647;
        }
        if (Array.isArray(data.users)) {
          await conn.query('DELETE FROM user_profiles');
          await conn.query('DELETE FROM users');
          const usernameSet = new Set();
          for (const u of data.users) {
            const oldId = (typeof u.id !== 'undefined' && u.id !== null) ? Number(u.id) : null;
            const password_hash = u.password || u.password_hash || '';
            // ensure username uniqueness under case-insensitive collation
            const baseName = (u.username || 'user').toString().trim();
            let cand = baseName;
            let idx = 1;
            while (usernameSet.has(cand.toLowerCase())) {
              cand = `${baseName}_${idx++}`;
            }
            usernameSet.add(cand.toLowerCase());

            if (oldId !== null && fitsInt(oldId)) {
              await conn.query('INSERT INTO users (id, username, email, password_hash, role, `rank`, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [oldId, cand, u.email || null, password_hash, u.role || 'member', u.rank || null, u.status || null, JSON.stringify(u.permissions || {})]);
              userIdMap.set(oldId, oldId);
            } else {
              const [r] = await conn.query('INSERT INTO users (username, email, password_hash, role, `rank`, status, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)', [cand, u.email || null, password_hash, u.role || 'member', u.rank || null, u.status || null, JSON.stringify(u.permissions || {})]);
              userIdMap.set(oldId, r.insertId);
            }
            const newId = userIdMap.get(oldId);
            if (u.profile) {
              await conn.query('INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, settings) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), bio=VALUES(bio), avatar_url=VALUES(avatar_url), settings=VALUES(settings)', [newId, u.profile.displayName || null, u.profile.bio || null, u.profile.avatarUrl || null, JSON.stringify(u.profile.settings || {})]);
            }
          }
        }

        // Ranks
        if (Array.isArray(data.ranks)) {
          await conn.query('DELETE FROM ranks');
          for (const r of data.ranks) {
            await conn.query('INSERT INTO ranks (id, name, abbreviation, order_index) VALUES (?, ?, ?, ?)', [r.id || null, r.name, r.short || r.abbreviation || null, r.order || 0]);
          }
        }

        // Templates (handle large IDs via mapping)
        const templateIdMap = new Map();
        if (Array.isArray(data.templates)) {
          await conn.query('DELETE FROM templates');
          for (const t of data.templates) {
            const oldTemplateId = (typeof t.id !== 'undefined' && t.id !== null) ? Number(t.id) : null;
            const payload = t.data || { sections: t.sections || [] };
            const ownerId = (typeof t.ownerId !== 'undefined' && t.ownerId !== null) ? (userIdMap.get(Number(t.ownerId)) || null) : null;
            if (oldTemplateId !== null && fitsInt(oldTemplateId)) {
              await conn.query('INSERT INTO templates (id, name, owner_id, description, data) VALUES (?, ?, ?, ?, ?)', [oldTemplateId, t.name || 'Untitled', ownerId, t.description || null, JSON.stringify(payload)]);
              templateIdMap.set(oldTemplateId, oldTemplateId);
            } else {
              const [r] = await conn.query('INSERT INTO templates (name, owner_id, description, data) VALUES (?, ?, ?, ?)', [t.name || 'Untitled', ownerId, t.description || null, JSON.stringify(payload)]);
              templateIdMap.set(oldTemplateId, r.insertId);
            }
          }
        }

        // Ops (handle op ID mapping similar to users)
        const opIdMap = new Map();
        if (Array.isArray(data.ops)) {
          await conn.query('DELETE FROM recurrences');
          await conn.query('DELETE FROM ops');
          for (const o of data.ops) {
            const oldOpId = (typeof o.id !== 'undefined' && o.id !== null) ? Number(o.id) : null;
            const ownerId = (typeof o.ownerId !== 'undefined' && o.ownerId !== null) ? (userIdMap.get(Number(o.ownerId)) || null) : null;
            const oldTpl = o.templateId || null;
            const tplId = oldTpl !== null ? (templateIdMap.get(Number(oldTpl)) || null) : null;
            const scheduledAt = (o.date && o.time) ? `${o.date}T${o.time}:00` : (o.scheduled_at || null);
            if (oldOpId !== null && fitsInt(oldOpId)) {
              await conn.query('INSERT INTO ops (id, template_id, title, owner_id, scheduled_at, timezone, recurrence, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [oldOpId, tplId || null, o.name || o.title || null, ownerId, scheduledAt, o.timezone || 'UTC', JSON.stringify(o.recurrence || null), JSON.stringify(o), o.status || 'scheduled']);
              opIdMap.set(oldOpId, oldOpId);
            } else {
              const [r] = await conn.query('INSERT INTO ops (template_id, title, owner_id, scheduled_at, timezone, recurrence, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [tplId || null, o.name || o.title || null, ownerId, scheduledAt, o.timezone || 'UTC', JSON.stringify(o.recurrence || null), JSON.stringify(o), o.status || 'scheduled']);
              opIdMap.set(oldOpId, r.insertId);
            }
          }
        }

        // Recurrences (map op references)
        if (Array.isArray(data.recurrences)) {
          const recurrenceIdMap = new Map();
          for (const r of data.recurrences) {
            const oldOp = r.opId || r.op_id || null;
            const newOp = oldOp !== null ? (opIdMap.get(Number(oldOp)) || null) : null;
            const oldRecId = (typeof r.id !== 'undefined' && r.id !== null) ? Number(r.id) : null;
            if (oldRecId !== null && fitsInt(oldRecId)) {
              await conn.query('INSERT INTO recurrences (id, op_id, rule, next_run) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE rule=VALUES(rule), next_run=VALUES(next_run)', [oldRecId, newOp || null, JSON.stringify(r), r.nextDateTime || r.next_run || null]);
              recurrenceIdMap.set(oldRecId, oldRecId);
            } else {
              const [res] = await conn.query('INSERT INTO recurrences (op_id, rule, next_run) VALUES (?, ?, ?)', [newOp || null, JSON.stringify(r), r.nextDateTime || r.next_run || null]);
              recurrenceIdMap.set(oldRecId, res.insertId);
            }
          }
        }

        // Campaigns
        if (Array.isArray(data.campaigns)) {
          await conn.query('DELETE FROM campaigns');
          for (const c of data.campaigns) {
            const ownerId = (typeof c.missionmakerUserId !== 'undefined' && c.missionmakerUserId !== null) ? (userIdMap.get(Number(c.missionmakerUserId)) || null) : (c.ownerId || null);
            const mappedDefaultTemplate = (typeof c.defaultTemplateId !== 'undefined' && c.defaultTemplateId !== null) ? (templateIdMap.get(Number(c.defaultTemplateId)) || null) : null;
            const out = { ...c, defaultTemplateId: mappedDefaultTemplate };
            const oldId = (typeof c.id !== 'undefined' && c.id !== null) ? Number(c.id) : null;
            if (oldId !== null && fitsInt(oldId)) {
              await conn.query('INSERT INTO campaigns (id, name, owner_id, data) VALUES (?, ?, ?, ?)', [oldId, c.name || 'Campaign', ownerId, JSON.stringify(out)]);
            } else {
              await conn.query('INSERT INTO campaigns (name, owner_id, data) VALUES (?, ?, ?)', [c.name || 'Campaign', ownerId, JSON.stringify(out)]);
            }
          }
        }

        // Modlists
        if (Array.isArray(data.modlists)) {
          await conn.query('DELETE FROM modlists');
          for (const m of data.modlists) {
            const ownerId = (typeof m.ownerId !== 'undefined' && m.ownerId !== null) ? (userIdMap.get(Number(m.ownerId)) || null) : null;
            await conn.query('INSERT INTO modlists (id, name, owner_id, mods) VALUES (?, ?, ?, ?)', [m.id || null, m.name || 'mods', ownerId, JSON.stringify(m.mods || [])]);
          }
        }

        // Files: scan uploads directory and insert metadata
          try {
            const uploadsDir = path.join(process.cwd(), 'uploads');
            const items = await fs.readdir(uploadsDir);
            await conn.query('DELETE FROM files');
            for (const fname of items) {
              const stat = await fs.stat(path.join(uploadsDir, fname));
              await conn.query('INSERT INTO files (filename, pathname, mimetype, size, metadata) VALUES (?, ?, ?, ?, ?)', [fname, `/uploads/${fname}`, null, stat.size, JSON.stringify({})]);
            }
          } catch (err) {
            console.log('No uploads folder or failed to scan uploads:', err.message);
          }

        await conn.commit();
        console.log('Migration insert complete.');
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.log('No data/app-data.json found or failed to parse; skipping import preview.');
      console.error(err);
    }

    console.log('Migration complete.');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
