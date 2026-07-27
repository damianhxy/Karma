const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_DIR = path.join(__dirname, "..", "database");
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "karma.db");

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        _id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        hash TEXT NOT NULL,
        karma INTEGER DEFAULT 0,
        name TEXT DEFAULT '',
        subjects TEXT DEFAULT '[]',
        socket_id TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS questions (
        _id TEXT PRIMARY KEY,
        asker TEXT NOT NULL,
        askee TEXT DEFAULT '-1',
        photo TEXT DEFAULT '',
        messages TEXT DEFAULT '[]',
        state TEXT DEFAULT 'pending',
        subject TEXT DEFAULT '',
        time INTEGER DEFAULT 0
    );
`);

module.exports = db;
