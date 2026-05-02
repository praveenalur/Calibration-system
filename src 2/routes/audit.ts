import express from 'express';
import { AuditRepository } from '../repositories/AuditRepository';

const router = express.Router();
const auditRepo = new AuditRepository();

// GET /api/audit - Get audit logs
router.get('/', async (req, res) => {
  try {
    const { gauge_id, user_id, action, limit = '100' } = req.query;
    
    let auditLogs;
    if (gauge_id) {
      auditLogs = await auditRepo.findByGaugeId(gauge_id as string, parseInt(limit as string));
    } else if (user_id) {
      auditLogs = await auditRepo.findByUserId(user_id as string, parseInt(limit as string));
    } else if (action) {
      auditLogs = await auditRepo.findByAction(action as string, parseInt(limit as string));
    } else {
      auditLogs = await auditRepo.findAll(parseInt(limit as string));
    }

    res.json({
      success: true,
      data: auditLogs,
      count: auditLogs.length
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs'
    });
  }
});

// GET /api/audit/statistics - Get audit statistics
router.get('/statistics', async (req, res) => {
  try {
    const stats = await auditRepo.getAuditStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching audit statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit statistics'
    });
  }
});

// GET /api/audit/date-range - Get audit logs by date range
router.get('/date-range', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'start_date and end_date are required'
      });
    }

    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    const auditLogs = await auditRepo.findByDateRange(startDate, endDate);

    res.json({
      success: true,
      data: auditLogs,
      count: auditLogs.length
    });
  } catch (error) {
    console.error('Error fetching audit logs by date range:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs'
    });
  }
});

export default router;