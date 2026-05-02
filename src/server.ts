import express from 'express';
import cors from 'cors';
import path from 'path';
import { Database } from './database/Database';
import { WebSocketManager } from './services/WebSocketManager';
import { Alert, GaugeProfile } from './types';
import gaugeRoutes from './routes/gauges';
import uploadRoutes from './routes/upload';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
const database = new Database();

// Initialize WebSocket manager
const wsManager = new WebSocketManager();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Inject dependencies into requests
app.use((req: any, res, next) => {
  req.db = database;
  req.wsManager = wsManager;
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Calibration & Production Capacity Management System',
    database: 'SQLite'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Calibration & Production Capacity Management API',
    version: '1.0.0',
    status: 'Production Ready',
    database: 'SQLite',
    endpoints: {
      upload: {
        validate: 'POST /api/upload/validate',
        import: 'POST /api/upload/import',
        template: 'GET /api/upload/template',
        bulkUpdate: 'POST /api/upload/bulk-update',
        history: 'GET /api/upload/history'
      },
      gauges: {
        list: 'GET /api/gauges',
        get: 'GET /api/gauges/:id',
        create: 'POST /api/gauges',
        update: 'PUT /api/gauges/:id',
        delete: 'DELETE /api/gauges/:id',
        alerts: 'GET /api/gauges/:id/alerts',
        recalculate: 'POST /api/gauges/:id/recalculate',
        stats: 'GET /api/gauges/stats/summary'
      },
      dashboard: {
        stats: 'GET /api/dashboard/stats',
        alerts: 'GET /api/dashboard/alerts'
      },
      alerts: {
        list: 'GET /api/alerts',
        acknowledge: 'POST /api/alerts/:id/acknowledge'
      },
      admin: {
        thresholds: 'GET /api/admin/thresholds',
        updateThresholds: 'PUT /api/admin/thresholds',
        reset: 'POST /api/admin/reset'
      },
      export: {
        excel: 'GET /api/export/excel',
        audit: 'GET /api/export/audit'
      }
    }
  });
});

// API routes
app.use('/api/gauges', gaugeRoutes);
app.use('/api/upload', uploadRoutes);

// Dashboard routes
app.get('/api/dashboard/stats', async (req: any, res) => {
  try {
    const profiles = await req.db.getAllGaugeProfiles();
    const alerts = await req.db.getAllAlerts();
    const thresholds = await req.db.getCapacityThresholds();
    
    const { CapacityManager } = await import('./services/CapacityManager');
    
    const stats = {
      total_gauges: profiles.length,
      safe_count: 0,
      near_limit_count: 0,
      calibration_required_count: 0,
      overdue_count: 0,
      recent_alerts: alerts
        .filter((alert: Alert) => !alert.acknowledged)
        .sort((a: Alert, b: Alert) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10)
    };

    profiles.forEach((profile: GaugeProfile) => {
      const enriched = CapacityManager.enrichGaugeProfile(profile, thresholds);
      switch (enriched.status) {
        case 'safe': stats.safe_count++; break;
        case 'near_limit': stats.near_limit_count++; break;
        case 'calibration_required': stats.calibration_required_count++; break;
        case 'overdue': stats.overdue_count++; break;
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch dashboard stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Alerts routes
app.get('/api/alerts', async (req: any, res) => {
  try {
    const alerts = await req.db.getAllAlerts();
    
    let filteredAlerts = alerts;
    
    if (req.query.acknowledged !== undefined) {
      const acknowledgedFilter = req.query.acknowledged === 'true';
      filteredAlerts = filteredAlerts.filter((alert: Alert) => alert.acknowledged === acknowledgedFilter);
    }
    
    if (req.query.severity) {
      const severityFilter = req.query.severity as string;
      filteredAlerts = filteredAlerts.filter((alert: Alert) => alert.severity === severityFilter);
    }

    filteredAlerts.sort((a: Alert, b: Alert) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({ success: true, data: filteredAlerts });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/alerts/:id/acknowledge', async (req: any, res) => {
  try {
    const alertId = req.params.id;
    await req.db.acknowledgeAlert(alertId);
    
    req.wsManager.broadcastAlertAcknowledged(alertId);
    
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to acknowledge alert',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Admin routes
app.get('/api/admin/thresholds', async (req: any, res) => {
  try {
    const thresholds = await req.db.getCapacityThresholds();
    res.json({ success: true, data: thresholds });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch thresholds',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.put('/api/admin/thresholds', async (req: any, res) => {
  try {
    const thresholds = req.body;
    await req.db.updateCapacityThresholds(thresholds);
    
    req.wsManager.broadcastThresholdsUpdated(thresholds);
    
    res.json({ success: true, data: thresholds, message: 'Thresholds updated' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update thresholds',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/admin/reset', async (req: any, res) => {
  try {
    await req.db.deleteAllGaugeProfiles();
    await req.db.deleteAllAlerts();
    
    req.wsManager.broadcastSystemReset();
    
    res.json({ success: true, message: 'System reset completed' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset system',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Export routes
app.get('/api/export/excel', async (req: any, res) => {
  try {
    const profiles = await req.db.getAllGaugeProfiles();
    const thresholds = await req.db.getCapacityThresholds();
    
    const { CapacityManager } = await import('./services/CapacityManager');
    const { ExcelProcessor } = await import('./services/ExcelProcessor');
    
    const enrichedProfiles = profiles.map((profile: GaugeProfile) => 
      CapacityManager.enrichGaugeProfile(profile, thresholds)
    );
    
    const excelBuffer = ExcelProcessor.exportToExcel(enrichedProfiles);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="gauge-profiles-export.xlsx"');
    res.setHeader('Content-Length', excelBuffer.length);
    
    res.send(excelBuffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to export Excel',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/export/audit', async (req: any, res) => {
  try {
    const auditEntries = await req.db.getAllAuditEntries();
    res.json({ success: true, data: auditEntries });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to export audit trail',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Capacity Management System running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔧 API: http://localhost:${PORT}/api`);
  console.log(`💾 Database: SQLite (capacity_system.db)`);
  console.log(`📡 WebSocket: Available for real-time updates`);
});

// Initialize WebSocket server
wsManager.initialize(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  wsManager.shutdown();
  database.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  wsManager.shutdown();
  database.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export { app, server, database, wsManager };