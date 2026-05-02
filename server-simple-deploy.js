// Simplified server for deployment with PostgreSQL and ML integration
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const { Resend } = require('resend');
const crypto = require('crypto');
const { execFile } = require('child_process');

// Simple token store (in-memory)
const activeSessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Default admin credentials
const DEFAULT_USERS = [
  { user_id: 'admin', username: 'admin', password: 'admin123', role: 'admin', email: 'admin@system.local', first_name: 'System', last_name: 'Administrator' }
];

const app = express();
const PORT = process.env.PORT || 10000;

// Hardcoded email configuration for automatic deployment
const EMAIL_CONFIG = {
  enabled: true,
  user: 'sushantds2003@gmail.com',
  from: 'onboarding@resend.dev',
  to: 'sushantds2003@gmail.com',
  resendApiKey: process.env.RESEND_API_KEY || ''
};

console.log('📦 Initializing PostgreSQL database...');

// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/capacity_system',
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

// Create tables
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS gauge_profiles (
      gauge_id TEXT PRIMARY KEY,
      gauge_type TEXT,
      calibration_frequency INTEGER,
      last_calibration_date TEXT,
      monthly_usage REAL,
      produced_quantity REAL,
      max_capacity REAL,
      remaining_capacity REAL,
      capacity_percentage REAL,
      status TEXT,
      next_calibration_date TEXT,
      location TEXT,
      notes TEXT,
      last_modified_by TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      gauge_id TEXT,
      type TEXT,
      severity TEXT,
      message TEXT,
      acknowledged INTEGER DEFAULT 0,
      created_at TEXT,
      FOREIGN KEY (gauge_id) REFERENCES gauge_profiles (gauge_id) ON DELETE CASCADE
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS email_settings (
      id SERIAL PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      smtp_host TEXT DEFAULT 'smtp.gmail.com',
      smtp_port INTEGER DEFAULT 587,
      smtp_secure INTEGER DEFAULT 0,
      smtp_user TEXT,
      smtp_password TEXT,
      from_email TEXT,
      recipients TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS email_recipients (
      email TEXT PRIMARY KEY
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS pipelines (
      pipeline_id SERIAL PRIMARY KEY,
      pipeline_name TEXT,
      cell_name TEXT,
      description TEXT,
      created_at TEXT
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS gauge_pipeline_allocation (
      allocation_id SERIAL PRIMARY KEY,
      gauge_id TEXT REFERENCES gauge_profiles(gauge_id) ON DELETE CASCADE,
      pipeline_id INTEGER REFERENCES pipelines(pipeline_id) ON DELETE CASCADE,
      allocation_pct REAL,
      effective_from TEXT,
      effective_to TEXT,
      is_active BOOLEAN DEFAULT true
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS gauge_monthly_log (
      log_id SERIAL PRIMARY KEY,
      gauge_id TEXT REFERENCES gauge_profiles(gauge_id) ON DELETE CASCADE,
      pipeline_id INTEGER REFERENCES pipelines(pipeline_id) ON DELETE CASCADE,
      year_month TEXT,
      production_plan REAL,
      actual_production REAL,
      variance_reason TEXT,
      resolution_status TEXT,
      utilisation_pct REAL,
      life_consumed_pct REAL,
      logged_at TEXT
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS ml_forecasts (
      forecast_id SERIAL PRIMARY KEY,
      gauge_id TEXT REFERENCES gauge_profiles(gauge_id) ON DELETE CASCADE,
      forecast_month TEXT,
      predicted_utilisation_pct REAL,
      predicted_life_consumed_pct REAL,
      predicted_expiry_date TEXT,
      confidence_score REAL,
      model_version TEXT,
      generated_at TEXT
    )`);

    // Seed default recipient if table is empty
    const res = await client.query('SELECT COUNT(*) as cnt FROM email_recipients');
    if (parseInt(res.rows[0].cnt) === 0) {
      await client.query('INSERT INTO email_recipients (email) VALUES ($1) ON CONFLICT DO NOTHING', [EMAIL_CONFIG.to]);
    }
    
    // Seed some default pipelines
    const p_res = await client.query('SELECT COUNT(*) as cnt FROM pipelines');
    if (parseInt(p_res.rows[0].cnt) === 0) {
      const now = new Date().toISOString();
      await client.query('INSERT INTO pipelines (pipeline_name, cell_name, created_at) VALUES ($1, $2, $3)', ['Alpha Line', 'Cell A', now]);
      await client.query('INSERT INTO pipelines (pipeline_name, cell_name, created_at) VALUES ($1, $2, $3)', ['Beta Line', 'Cell A', now]);
      await client.query('INSERT INTO pipelines (pipeline_name, cell_name, created_at) VALUES ($1, $2, $3)', ['Gamma Line', 'Cell B', now]);
    }

    console.log('📦 Database initialized successfully.');
  } catch (err) {
    console.error('📦 Database initialization error:', err);
  } finally {
    client.release();
  }
}
initDb();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Email service using Resend
async function sendEmail(alert) {
  try {
    if (!EMAIL_CONFIG.resendApiKey) {
      console.error('📧 ❌ RESEND_API_KEY not set');
      return { success: false, error: 'RESEND_API_KEY not configured.' };
    }
    const resend = new Resend(EMAIL_CONFIG.resendApiKey);

    const { rows } = await pool.query('SELECT email FROM email_recipients');
    const toList = rows.length > 0 ? rows.map(r => r.email) : [EMAIL_CONFIG.to];

    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: toList,
      subject: `⚠️ Calibration Alert: ${alert.gauge_id} - ${alert.type.toUpperCase()}`,
      html: `
        <h2>🚨 Calibration Alert</h2>
        <p><strong>Gauge ID:</strong> ${alert.gauge_id}</p>
        <p><strong>Alert Type:</strong> ${alert.type}</p>
        <p><strong>Severity:</strong> ${alert.severity}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Time:</strong> ${new Date(alert.created_at).toLocaleString()}</p>
        <p>Please take appropriate action to address this calibration issue.</p>
      `
    });

    if (error) throw new Error(error.message);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('📧 ❌ Email sending failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Helper: calculate gauge status
function calcGaugeFields(row) {
  const calibFreq = parseInt(row['Calibration frequency (months)'] || row.calibration_frequency || row['Calibration Interval (Months)'] || 12);
  const lastCalStr = row['Last calibration date'] || row.last_calibration_date || row['Last Calibration Date'] || '';
  const monthlyUsage = parseFloat(row['Monthly usage'] || row.monthly_usage || 0);
  const producedQty = parseFloat(row['Produced quantity'] || row.produced_quantity || 0);
  const maxCapacity = parseFloat(row['Maximum capacity'] || row.max_capacity || row['Max Capacity'] || 1);

  let nextCalDate = '';
  if (lastCalStr) {
    const lastCal = new Date(lastCalStr);
    if (!isNaN(lastCal.getTime())) {
      const next = new Date(lastCal);
      next.setMonth(next.getMonth() + calibFreq);
      nextCalDate = next.toISOString().split('T')[0];
    }
  }

  const remaining = Math.max(0, maxCapacity - producedQty);
  const capacityPct = maxCapacity > 0 ? (producedQty / maxCapacity) * 100 : 0;
  
  const today = new Date();
  const daysUntilCal = nextCalDate ? Math.ceil((new Date(nextCalDate) - today) / 86400000) : 999;
  let status = 'safe';
  if (daysUntilCal < 0) status = 'overdue';
  else if (daysUntilCal <= 30) status = 'calibration_required';
  else if (capacityPct >= 80) status = 'near_limit';

  return { calibFreq, lastCalStr, monthlyUsage, producedQty, maxCapacity, remaining, capacityPct, nextCalDate, status, daysUntilCal };
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Auth
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = DEFAULT_USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ success: false, error: 'Invalid username or password' });
  const token = generateToken();
  activeSessions.set(token, user);
  const { password: _, ...safeUser } = user;
  res.json({ success: true, data: { token, user: safeUser } });
});

app.get('/api/auth/me', (req, res) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token || !activeSessions.has(token)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const { password: _, ...safeUser } = activeSessions.get(token);
  res.json({ success: true, data: safeUser });
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (token) activeSessions.delete(token);
  res.json({ success: true });
});

// Gauges
app.get('/api/gauges', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM gauge_profiles ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gauges', async (req, res) => {
  const now = new Date().toISOString();
  const f = calcGaugeFields(req.body);
  const profile = {
    gauge_id: req.body.gauge_id,
    gauge_type: req.body.gauge_type,
    location: req.body.location || '',
    last_calibration_date: f.lastCalStr,
    calibration_frequency: f.calibFreq,
    next_calibration_date: f.nextCalDate,
    produced_quantity: f.producedQty,
    max_capacity: f.maxCapacity,
    remaining_capacity: f.remaining,
    capacity_percentage: f.capacityPct,
    status: f.status,
    notes: req.body.notes || '',
    last_modified_by: req.body.last_modified_by || 'Web Interface',
    created_at: now,
    updated_at: now
  };

  try {
    await pool.query(`
      INSERT INTO gauge_profiles 
      (gauge_id, gauge_type, location, last_calibration_date, calibration_frequency,
       next_calibration_date, produced_quantity, max_capacity, remaining_capacity,
       capacity_percentage, status, notes, last_modified_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (gauge_id) DO UPDATE SET
        gauge_type = EXCLUDED.gauge_type,
        location = EXCLUDED.location,
        last_calibration_date = EXCLUDED.last_calibration_date,
        calibration_frequency = EXCLUDED.calibration_frequency,
        next_calibration_date = EXCLUDED.next_calibration_date,
        produced_quantity = EXCLUDED.produced_quantity,
        max_capacity = EXCLUDED.max_capacity,
        remaining_capacity = EXCLUDED.remaining_capacity,
        capacity_percentage = EXCLUDED.capacity_percentage,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        last_modified_by = EXCLUDED.last_modified_by,
        updated_at = EXCLUDED.updated_at
    `, [profile.gauge_id, profile.gauge_type, profile.location, profile.last_calibration_date,
       profile.calibration_frequency, profile.next_calibration_date, profile.produced_quantity,
       profile.max_capacity, profile.remaining_capacity, profile.capacity_percentage,
       profile.status, profile.notes, profile.last_modified_by, profile.created_at, profile.updated_at]);

    if (f.daysUntilCal < 0) {
      const alert = {
        id: uuidv4(), gauge_id: profile.gauge_id, type: 'calibration_overdue', severity: 'high',
        message: `Gauge ${profile.gauge_id} calibration is ${Math.abs(f.daysUntilCal)} days overdue`, created_at: now
      };
      await pool.query('INSERT INTO alerts (id, gauge_id, type, severity, message, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [alert.id, alert.gauge_id, alert.type, alert.severity, alert.message, alert.created_at]);
      sendEmail(alert);
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/gauges/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gauge_profiles WHERE gauge_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM alerts ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/alerts/:id/acknowledge', async (req, res) => {
  try {
    await pool.query('UPDATE alerts SET acknowledged = 1 WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// NEW ENDPOINTS

// 1. Pipelines
app.get('/api/pipelines', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, 
             (SELECT COUNT(DISTINCT gauge_id) FROM gauge_pipeline_allocation WHERE pipeline_id = p.pipeline_id AND is_active = true) as active_gauges
      FROM pipelines p ORDER BY pipeline_name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Allocations
app.get('/api/gauges/:id/allocations', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, p.pipeline_name 
      FROM gauge_pipeline_allocation a
      JOIN pipelines p ON a.pipeline_id = p.pipeline_id
      WHERE a.gauge_id = $1 ORDER BY a.is_active DESC, a.allocation_pct DESC
    `, [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gauges/:id/allocations', async (req, res) => {
  const { pipeline_id, allocation_pct, effective_from } = req.body;
  try {
    await pool.query(`
      INSERT INTO gauge_pipeline_allocation (gauge_id, pipeline_id, allocation_pct, effective_from)
      VALUES ($1, $2, $3, $4)
    `, [req.params.id, pipeline_id, allocation_pct, effective_from]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Monthly Log
app.get('/api/gauges/:id/monthly-log', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.*, p.pipeline_name 
      FROM gauge_monthly_log l
      JOIN pipelines p ON l.pipeline_id = p.pipeline_id
      WHERE l.gauge_id = $1 ORDER BY l.year_month DESC
    `, [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gauges/:id/monthly-log', async (req, res) => {
  const { pipeline_id, year_month, production_plan, actual_production } = req.body;
  const utilisation_pct = production_plan > 0 ? (actual_production / production_plan) * 100 : 0;
  
  try {
    const { rows } = await pool.query(`
      INSERT INTO gauge_monthly_log 
      (gauge_id, pipeline_id, year_month, production_plan, actual_production, utilisation_pct, logged_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING log_id
    `, [req.params.id, pipeline_id, year_month, production_plan, actual_production, utilisation_pct, new Date().toISOString()]);
    
    // Trigger ML Inference asynchronously
    const pythonScript = path.join(__dirname, 'ml_pipeline', 'forecast.py');
    execFile('python3', [pythonScript, req.params.id], (error, stdout, stderr) => {
      if (error) {
        console.error('ML Script Error:', error.message);
        execFile('python', [pythonScript, req.params.id], (err2) => {
           if(err2) console.error('Fallback ML Script Error:', err2.message);
        });
      }
      if (stdout) console.log('ML Output:', stdout);
    });

    res.json({ success: true, log_id: rows[0].log_id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Variance Reason
app.put('/api/gauges/:id/monthly-log/:log_id/variance', async (req, res) => {
  const { variance_reason, resolution_status } = req.body;
  try {
    await pool.query(`
      UPDATE gauge_monthly_log 
      SET variance_reason = $1, resolution_status = $2 
      WHERE log_id = $3
    `, [variance_reason, resolution_status, req.params.log_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. ML Forecasts
app.get('/api/gauges/:id/forecast', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ml_forecasts WHERE gauge_id = $1 ORDER BY generated_at DESC LIMIT 1', [req.params.id]);
    res.json({ success: true, data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/forecasts/risk-summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, g.gauge_type, g.location 
      FROM ml_forecasts m
      JOIN gauge_profiles g ON m.gauge_id = g.gauge_id
      WHERE m.confidence_score > 0.5
      ORDER BY m.predicted_expiry_date ASC LIMIT 20
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/analytics/plan-vs-actual', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT year_month, SUM(production_plan) as total_plan, SUM(actual_production) as total_actual
      FROM gauge_monthly_log
      GROUP BY year_month
      ORDER BY year_month DESC LIMIT 12
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ML-Powered Capacity System running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', message: 'Real-time updates active' }));
});
