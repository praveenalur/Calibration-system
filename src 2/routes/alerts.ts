import express from 'express';
import { AlertRepository } from '../repositories/AlertRepository';
import { AlertService } from '../services/AlertService';
import { getWebSocketService } from '../services/WebSocketService';
import { randomUUID } from 'crypto';

const router = express.Router();
const alertRepo = new AlertRepository();
const alertService = new AlertService();

// GET /api/alerts/active - Get active alerts only
router.get('/active', async (req, res) => {
  try {
    const activeAlerts = await alertService.getActiveAlerts();
    
    res.json({
      success: true,
      data: activeAlerts,
      count: activeAlerts.length
    });
  } catch (error) {
    console.error('Error fetching active alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active alerts'
    });
  }
});

// GET /api/alerts - Get all alerts
router.get('/', async (req, res) => {
  try {
    const { active, severity, gauge_id } = req.query;
    
    let alerts;
    if (active === 'true') {
      alerts = await alertRepo.findActive();
    } else if (severity) {
      alerts = await alertRepo.findBySeverity(severity as string);
    } else if (gauge_id) {
      alerts = await alertRepo.findByGaugeId(gauge_id as string);
    } else {
      alerts = await alertRepo.findAll();
    }

    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts'
    });
  }
});

// POST /api/alerts - Create a new alert
router.post('/', async (req, res) => {
  try {
    const {
      gauge_id,
      alert_type,
      severity,
      message
    } = req.body;
    
    if (!gauge_id || !alert_type || !severity || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: gauge_id, alert_type, severity, message'
      });
    }

    const alertData = {
      alert_id: randomUUID(),
      gauge_id,
      alert_type,
      severity,
      message
    };

    const alert = await alertRepo.create(alertData);

    // Emit WebSocket event
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.emitAlertCreated(alert);
    }

    res.status(201).json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create alert'
    });
  }
});

// PUT /api/alerts/:id/acknowledge - Acknowledge an alert
router.put('/:id/acknowledge', async (req, res) => {
  try {
    const alertId = req.params.id;
    const { acknowledged_by } = req.body;

    if (!acknowledged_by) {
      return res.status(400).json({
        success: false,
        error: 'acknowledged_by is required'
      });
    }

    const alert = await alertRepo.acknowledge(alertId, acknowledged_by);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    // Emit WebSocket event
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.emitAlertAcknowledged(alert);
    }

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge alert'
    });
  }
});

// DELETE /api/alerts/gauge/:gaugeId - Delete alerts for a specific gauge
router.delete('/gauge/:gaugeId', async (req, res) => {
  try {
    const gaugeId = req.params.gaugeId;
    const deletedCount = await alertRepo.deleteByGaugeId(gaugeId);

    res.json({
      success: true,
      message: `Deleted ${deletedCount} alerts for gauge ${gaugeId}`,
      deleted_count: deletedCount
    });
  } catch (error) {
    console.error('Error deleting alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete alerts'
    });
  }
});

// GET /api/alerts/statistics - Get alert statistics
router.get('/statistics', async (req, res) => {
  try {
    const stats = await alertRepo.getAlertCounts();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching alert statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert statistics'
    });
  }
});

export default router;