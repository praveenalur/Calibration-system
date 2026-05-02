import express from 'express';
import { CapacityThresholdsRepository } from '../repositories/CapacityThresholdsRepository';
import { GaugeRepository } from '../repositories/GaugeRepository';
import { AlertRepository } from '../repositories/AlertRepository';
import { AuditRepository } from '../repositories/AuditRepository';
import { AlertService } from '../services/AlertService';
import { CapacityService } from '../services/CapacityService';
import { getWebSocketService } from '../services/WebSocketService';

const router = express.Router();
const thresholdsRepo = new CapacityThresholdsRepository();
const gaugeRepo = new GaugeRepository();
const alertRepo = new AlertRepository();
const auditRepo = new AuditRepository();
const alertService = new AlertService();

// GET /api/admin/thresholds - Get current capacity thresholds
router.get('/thresholds', async (req, res) => {
  try {
    const thresholds = await thresholdsRepo.getOrCreateDefault();
    
    res.json({
      success: true,
      data: thresholds
    });
  } catch (error) {
    console.error('Error fetching thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch thresholds'
    });
  }
});

// PUT /api/admin/thresholds - Update capacity thresholds
router.put('/thresholds', async (req, res) => {
  try {
    const {
      calibration_required_threshold,
      near_limit_threshold,
      overdue_capacity_threshold,
      updated_by = 'admin'
    } = req.body;

    // Validate threshold values
    const thresholds = {
      calibration_required_threshold,
      near_limit_threshold,
      overdue_capacity_threshold
    };

    for (const [key, value] of Object.entries(thresholds)) {
      if (value !== undefined) {
        if (typeof value !== 'number' || value < 0 || value > 1) {
          return res.status(400).json({
            success: false,
            error: `${key} must be a number between 0 and 1`
          });
        }
      }
    }

    // Update thresholds
    const updatedThresholds = await thresholdsRepo.update(thresholds, updated_by);

    // Recalculate all gauge statuses with new thresholds
    const gauges = await gaugeRepo.findAll();
    let updatedGauges = 0;

    for (const gauge of gauges) {
      const gaugeData = gauge.toObject();
      const newStatus = CapacityService.determineGaugeStatus(gaugeData, {
        calibration_required_threshold: updatedThresholds.calibration_required_threshold,
        near_limit_threshold: updatedThresholds.near_limit_threshold,
        overdue_capacity_threshold: updatedThresholds.overdue_capacity_threshold
      });

      if (newStatus !== gauge.status) {
        await gaugeRepo.update(gauge.gauge_id, { status: newStatus });
        
        // Generate new alerts for updated gauge
        await alertService.generateAlertsForGauge({ ...gaugeData, status: newStatus } as any);
        
        updatedGauges++;

        // Emit WebSocket event
        const wsService = getWebSocketService();
        if (wsService) {
          wsService.emitGaugeUpdated({ ...gaugeData, status: newStatus } as any, { status: newStatus });
        }
      }
    }

    res.json({
      success: true,
      data: {
        thresholds: updatedThresholds,
        gauges_updated: updatedGauges,
        message: `Thresholds updated successfully. ${updatedGauges} gauges had status changes.`
      }
    });

  } catch (error) {
    console.error('Error updating thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update thresholds'
    });
  }
});

// POST /api/admin/thresholds/reset - Reset thresholds to default values
router.post('/thresholds/reset', async (req, res) => {
  try {
    const { updated_by = 'admin' } = req.body;
    
    const defaultThresholds = await thresholdsRepo.reset(updated_by);

    res.json({
      success: true,
      data: defaultThresholds,
      message: 'Thresholds reset to default values'
    });

  } catch (error) {
    console.error('Error resetting thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset thresholds'
    });
  }
});

// GET /api/admin/system-status - Get overall system status
router.get('/system-status', async (req, res) => {
  try {
    const [gaugeStats, alertStats, auditStats, thresholds] = await Promise.all([
      gaugeRepo.getStatistics(),
      alertRepo.getAlertCounts(),
      auditRepo.getAuditStatistics(),
      thresholdsRepo.get()
    ]);

    const wsService = getWebSocketService();
    const wsStatus = wsService ? wsService.getStatus() : null;

    res.json({
      success: true,
      data: {
        gauges: gaugeStats,
        alerts: alertStats,
        audit: auditStats,
        thresholds: thresholds || 'Not configured',
        websocket: wsStatus,
        system: {
          uptime: process.uptime(),
          memory_usage: process.memoryUsage(),
          node_version: process.version,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error fetching system status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system status'
    });
  }
});

// POST /api/admin/regenerate-alerts - Regenerate all alerts based on current gauge status
router.post('/regenerate-alerts', async (req, res) => {
  try {
    const { user_id = 'admin' } = req.body;

    // Clear all existing alerts
    await alertRepo.deleteAll();

    // Regenerate alerts for all gauges
    const result = await alertService.generateAlertsForAllGauges();

    res.json({
      success: true,
      data: {
        ...result,
        message: `Regenerated alerts for ${result.total_gauges} gauges. Created ${result.alerts_generated} alerts.`
      }
    });

  } catch (error) {
    console.error('Error regenerating alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate alerts'
    });
  }
});

// DELETE /api/admin/data/all - Delete all system data (DANGEROUS)
router.delete('/data/all', async (req, res) => {
  try {
    const { confirmation, user_id = 'admin' } = req.body;

    if (confirmation !== 'DELETE_ALL_DATA') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. Send { "confirmation": "DELETE_ALL_DATA" }'
      });
    }

    // Delete all data
    const [deletedGauges, deletedAlerts, deletedAudit] = await Promise.all([
      gaugeRepo.deleteAll(),
      alertRepo.deleteAll(),
      auditRepo.deleteAll()
    ]);

    // Emit WebSocket event
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcastMessage('system_reset', {
        deleted_gauges: deletedGauges,
        deleted_alerts: deletedAlerts,
        deleted_audit: deletedAudit,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        deleted_gauges: deletedGauges,
        deleted_alerts: deletedAlerts,
        deleted_audit: deletedAudit,
        message: 'All system data deleted successfully'
      }
    });

  } catch (error) {
    console.error('Error deleting all data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all data'
    });
  }
});

export default router;