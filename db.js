import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

let host = process.env.DB_HOST;
let user = process.env.DB_USER;
let password = process.env.DB_PASSWORD;
let database = process.env.DB_NAME;
let port = Number(process.env.DB_PORT) || 3306;

// Fallback to config/mysql.json when env vars are not set
if (!host || !user || !password || !database) {
    try {
        const cfgPath = path.join(process.cwd(), 'config', 'mysql.json');
        if (fs.existsSync(cfgPath)) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            host = host || cfg.host;
            user = user || cfg.user;
            password = password || cfg.password;
            database = database || cfg.database;
            port = cfg.port || port;
        }
    } catch (e) {
        // ignore and continue with whatever env vars are present
    }
}

const pool = mysql.createPool({
        host: host || '127.0.0.1',
        user: user || 'tfo',
        password: password || 'tfo_pass',
        database: database || 'tfowebapp',
        port: port || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
});

export default pool;