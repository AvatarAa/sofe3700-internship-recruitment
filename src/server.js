require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const pool = require('./db');
const api = require('./routes/api');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.startsWith('replace_')) {
  console.error('Set SESSION_SECRET to a random value of at least 32 characters in .env.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  name: 'internship.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 4 },
}));

app.use('/vendor/chart.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js')));
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/reports', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'reports.html')));
app.get('/external-jobs', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'external-jobs.html')));
app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error.message);
  const status = error.type === 'entity.parse.failed' ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Request body must contain valid JSON.' : 'Unexpected server error.' });
});

const port = Number(process.env.PORT || 3000);
let server;
async function start() {
  await pool.query(`CREATE TABLE IF NOT EXISTS external_job_search (
    search_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER REFERENCES app_user(user_id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    keyword VARCHAR(120) NOT NULL,
    location VARCHAR(120) NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    searched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS external_job_result (
    result_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    search_id BIGINT NOT NULL REFERENCES external_job_search(search_id) ON DELETE CASCADE,
    source_job_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    location VARCHAR(255),
    description TEXT,
    salary_min NUMERIC(12,2),
    salary_max NUMERIC(12,2),
    redirect_url TEXT NOT NULL,
    category VARCHAR(120),
    published_at TIMESTAMPTZ,
    source_payload JSONB NOT NULL,
    UNIQUE(search_id, source_job_id)
  )`);
  await pool.query('ALTER TABLE external_job_search ADD COLUMN IF NOT EXISTS session_id VARCHAR(255)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_external_job_search_recent ON external_job_search (searched_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_external_job_result_search ON external_job_result (search_id)');
  if (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.startsWith('replace_')) throw new Error('Set a valid BOOTSTRAP_ADMIN_EMAIL and a private BOOTSTRAP_ADMIN_PASSWORD of at least 10 characters.');
    const existing = await pool.query('SELECT user_id FROM app_user WHERE lower(email)=$1', [email]);
    if (!existing.rowCount) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await scrypt(password, salt, 64);
      await pool.query("INSERT INTO app_user (email,password_hash,user_role) VALUES ($1,$2,'ADMIN')", [email, `scrypt$${salt}$${hash.toString('hex')}`]);
      console.log(`Created initial administrator account: ${email}`);
    }
  }
  server = app.listen(port, () => console.log(`Internship Recruitment app listening at http://localhost:${port}`));
}
start().catch(async (error) => { console.error('Could not start application:', error.message); await pool.end(); process.exit(1); });
async function shutdown() {
  server.close(async () => { await pool.end(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
