import sqlite3 from 'sqlite3';
import { GaugeProfile, Alert, AuditEntry, CapacityThresholds } from '../types';

export class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string = './capacity_system.db') {
    this.db = new sqlite3.Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Gauge profiles table
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS gauge_profiles (
          id TEXT PRIMARY KEY,
          gauge_id TEXT UNIQUE NOT NULL,
          gauge_type TEXT NOT NULL,
          calibration_frequency INTEGER NOT NULL,
          last_calibration_date TEXT NOT NULL,
          monthly_usage REAL NOT NULL,
          produced_quantity REAL NOT NULL,
          max_capacity REAL NOT NULL,
          last_modified_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Alerts table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          gauge_id TEXT NOT NULL,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TEXT NOT NULL,
          acknowledged INTEGER DEFAULT 0,
          FOREIGN KEY (gauge_id) REFERENCES gauge_profiles (gauge_id)
        )
      `);

      // Audit entries table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_entries (
          id TEXT PRIMARY KEY,
          gauge_id TEXT NOT NULL,
          action TEXT NOT NULL,
          old_values TEXT,
          new_values TEXT,
          user TEXT NOT NULL,
          timestamp TEXT NOT NULL
        )
      `);

      // Capacity thresholds table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS capacity_thresholds (
          id INTEGER PRIMARY KEY,
          near_limit_percentage REAL NOT NULL DEFAULT 80,
          calibration_warning_months INTEGER NOT NULL DEFAULT 1
        )
      `);

      // Email settings table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS email_settings (
          id INTEGER PRIMARY KEY,
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
        )
      `);

      // Insert default thresholds if not exists
      this.db.run(`
        INSERT OR IGNORE INTO capacity_thresholds (id, near_limit_percentage, calibration_warning_months)
        VALUES (1, 80, 1)
      `);
    });
  }

  // Gauge Profile operations
  async createGaugeProfile(profile: GaugeProfile): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO gauge_profiles 
        (id, gauge_id, gauge_type, calibration_frequency, last_calibration_date, 
         monthly_usage, produced_quantity, max_capacity, last_modified_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        profile.id, profile.gauge_id, profile.gauge_type, profile.calibration_frequency,
        profile.last_calibration_date, profile.monthly_usage, profile.produced_quantity,
        profile.max_capacity, profile.last_modified_by, profile.created_at, profile.updated_at
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async getAllGaugeProfiles(): Promise<GaugeProfile[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM gauge_profiles ORDER BY gauge_id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows as GaugeProfile[]);
      });
    });
  }

  async getGaugeProfileById(gaugeId: string): Promise<GaugeProfile | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM gauge_profiles WHERE gauge_id = ?', [gaugeId], (err, row) => {
        if (err) reject(err);
        else resolve(row as GaugeProfile || null);
      });
    });
  }

  async updateGaugeProfile(gaugeId: string, updates: Partial<GaugeProfile>): Promise<void> {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'gauge_id');
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => (updates as any)[field]);
      values.push(gaugeId);

      this.db.run(
        `UPDATE gauge_profiles SET ${setClause} WHERE gauge_id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async deleteGaugeProfile(gaugeId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM gauge_profiles WHERE gauge_id = ?', [gaugeId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteAllGaugeProfiles(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM gauge_profiles', function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Alert operations
  async createAlert(alert: Alert): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO alerts (id, gauge_id, type, severity, message, created_at, acknowledged)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        alert.id, alert.gauge_id, alert.type, alert.severity, 
        alert.message, alert.created_at, alert.acknowledged ? 1 : 0
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async getAllAlerts(): Promise<Alert[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM alerts ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else {
          const alerts = (rows as any[]).map(row => ({
            ...row,
            acknowledged: row.acknowledged === 1
          }));
          resolve(alerts);
        }
      });
    });
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [alertId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteAlert(alertId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM alerts WHERE id = ?', [alertId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteAllAlerts(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM alerts', function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Audit operations
  async createAuditEntry(entry: AuditEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO audit_entries (id, gauge_id, action, old_values, new_values, user, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        entry.id, entry.gauge_id, entry.action,
        entry.old_values ? JSON.stringify(entry.old_values) : null,
        entry.new_values ? JSON.stringify(entry.new_values) : null,
        entry.user, entry.timestamp
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
      
      stmt.finalize();
    });
  }

  async getAllAuditEntries(): Promise<AuditEntry[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM audit_entries ORDER BY timestamp DESC', (err, rows) => {
        if (err) reject(err);
        else {
          const entries = (rows as any[]).map(row => ({
            ...row,
            old_values: row.old_values ? JSON.parse(row.old_values) : null,
            new_values: row.new_values ? JSON.parse(row.new_values) : null
          }));
          resolve(entries);
        }
      });
    });
  }

  // Capacity thresholds operations
  async getCapacityThresholds(): Promise<CapacityThresholds> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM capacity_thresholds WHERE id = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row as CapacityThresholds);
      });
    });
  }

  async updateCapacityThresholds(thresholds: CapacityThresholds): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE capacity_thresholds SET near_limit_percentage = ?, calibration_warning_months = ? WHERE id = 1',
        [thresholds.near_limit_percentage, thresholds.calibration_warning_months],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Email settings operations
  async getEmailSettings(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM email_settings WHERE id = 1', (err, row) => {
        if (err) reject(err);
        else {
          if (!row) {
            // Return default settings if none exist
            resolve({
              id: 1,
              enabled: 1,
              smtp_host: 'smtp.gmail.com',
              smtp_port: 587,
              smtp_secure: 0,
              smtp_user: '',
              smtp_password: '',
              from_email: '',
              recipients: '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          } else {
            resolve(row);
          }
        }
      });
    });
  }

  async updateEmailSettings(settings: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const db = this.db;
      
      // First try to update
      db.run(
        `UPDATE email_settings SET 
         enabled = ?, smtp_host = ?, smtp_port = ?, smtp_secure = ?,
         smtp_user = ?, smtp_password = ?, from_email = ?, recipients = ?, updated_at = ?
         WHERE id = 1`,
        [
          settings.enabled ? 1 : 0,
          settings.smtp_host,
          settings.smtp_port,
          settings.smtp_secure ? 1 : 0,
          settings.smtp_user,
          settings.smtp_password,
          settings.from_email,
          settings.recipients,
          now
        ],
        function(err) {
          if (err) {
            reject(err);
          } else if (this.changes === 0) {
            // No rows updated, insert new record
            const stmt = db.prepare(
              `INSERT INTO email_settings 
               (id, enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, recipients, created_at, updated_at)
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            
            stmt.run([
              settings.enabled ? 1 : 0,
              settings.smtp_host,
              settings.smtp_port,
              settings.smtp_secure ? 1 : 0,
              settings.smtp_user,
              settings.smtp_password,
              settings.from_email,
              settings.recipients,
              now,
              now
            ], function(insertErr: any) {
              stmt.finalize();
              if (insertErr) reject(insertErr);
              else resolve();
            });
          } else {
            resolve();
          }
        }
      );
    });
  }

  close(): void {
    this.db.close();
  }
}