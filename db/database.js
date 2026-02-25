// ─── PostgreSQL Database (Supabase) ───

const { Pool, types } = require('pg');

// Parse bigint (COUNT(*) returns bigint) as JavaScript number
types.setTypeParser(20, (val) => parseInt(val, 10));

let pool = null;

/**
 * Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
 * This lets all existing queries work without modification.
 */
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function initDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Test connection
  await pool.query('SELECT NOW()');

  // Create all tables
  const schemas = [
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT,
      line_group_id TEXT UNIQUE, line_user_id TEXT,
      contact_email TEXT, contact_phone TEXT, notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, display_name TEXT NOT NULL,
      category TEXT NOT NULL, description TEXT, demo_url TEXT,
      pricing_tier TEXT DEFAULT 'standard', base_price INTEGER,
      features_json TEXT, is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'collecting', requirement_json TEXT,
      skill_id TEXT, price INTEGER, price_note TEXT, delivery_url TEXT,
      admin_notes TEXT, priority TEXT DEFAULT 'normal',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      quoted_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY, client_id TEXT,
      line_group_id TEXT, line_user_id TEXT, user_name TEXT,
      role TEXT, message TEXT NOT NULL, metadata_json TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, ticket_id TEXT,
      type TEXT NOT NULL, content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    )`,
  ];

  for (const sql of schemas) {
    await pool.query(sql);
  }

  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_conversations_line_group_id ON conversations(line_group_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)',
    'CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)',
  ];

  for (const sql of indexes) {
    await pool.query(sql);
  }

  console.log('PostgreSQL connected and schema ready');
}

// ── Query helpers (same API as before, now async) ──

async function all(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const { rows } = await pool.query(pgSql, params);
  return rows;
}

async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  await pool.query(pgSql, params);
}

module.exports = { initDatabase, all, get, run };
