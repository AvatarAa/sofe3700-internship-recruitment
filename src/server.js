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
app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error.message);
  const status = error.type === 'entity.parse.failed' ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Request body must contain valid JSON.' : 'Unexpected server error.' });
});

const port = Number(process.env.PORT || 3000);
let server;
async function start() {
  await pool.query(`CREATE TABLE IF NOT EXISTS weather_observation (weather_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, requested_location VARCHAR(120) NOT NULL, resolved_location VARCHAR(255) NOT NULL, latitude NUMERIC(9,6) NOT NULL, longitude NUMERIC(9,6) NOT NULL, observed_at TIMESTAMP NOT NULL, temperature_c NUMERIC(6,2), apparent_temperature_c NUMERIC(6,2), humidity_percent INTEGER, precipitation_mm NUMERIC(8,2), wind_speed_kmh NUMERIC(7,2), weather_code INTEGER, source_payload JSONB NOT NULL, fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_weather_observation_location_fetched ON weather_observation (requested_location, fetched_at DESC)');
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
