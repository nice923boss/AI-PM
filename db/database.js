const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'ai-pm.db');

let db = null;

function saveToDisk() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function startAutoSave() {
  setInterval(saveToDisk, 30000);
  process.on('exit', saveToDisk);
  process.on('SIGINT', () => { saveToDisk(); process.exit(); });
  process.on('SIGTERM', () => { saveToDisk(); process.exit(); });
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  // Create all tables
  const schemas = [
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT,
      line_group_id TEXT UNIQUE, line_user_id TEXT,
      contact_email TEXT, contact_phone TEXT, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, display_name TEXT NOT NULL,
      category TEXT NOT NULL, description TEXT, demo_url TEXT,
      pricing_tier TEXT DEFAULT 'standard', base_price INTEGER,
      features_json TEXT, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'collecting', requirement_json TEXT,
      skill_id TEXT, price INTEGER, price_note TEXT, delivery_url TEXT,
      admin_notes TEXT, priority TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      quoted_at DATETIME, paid_at DATETIME, delivered_at DATETIME, closed_at DATETIME,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT,
      line_group_id TEXT, line_user_id TEXT, user_name TEXT,
      role TEXT, message TEXT NOT NULL, metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT,
      type TEXT NOT NULL, content TEXT NOT NULL, is_read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    )`
  ];
  schemas.forEach(sql => db.run(sql));

  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_line_group_id ON conversations(line_group_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)',
    'CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)'
  ];
  indexes.forEach(sql => db.run(sql));

  saveToDisk();
  startAutoSave();
  return db;
}

// Query helpers — bridge sql.js to a familiar API

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveToDisk();
}

module.exports = { initDatabase, all, get, run };
