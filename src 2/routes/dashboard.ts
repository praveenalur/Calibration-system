import express from 'express';
import { GaugeRepository } from '../repositories/GaugeRepository';
import { AlertRepository } from '../repositories/AlertRepository';

const router = express.Router();
const gaugeRepo = new GaugeRepository();
const alertRepo = new AlertRepository();

// GET /api/dashboard - Get dashboard data
router.get('/', async (req, res) => {
  try {
    const [gaugeStats, alertCounts, recentGauges] = await Promise.all([
      gaugeRepo.getStatistics(),
      alertRepo.getAlertCounts(),
      gaugeRepo.findAll()
    ]);

    // Get gauges nearing capacity limits
    const nearingLimits = recentGauges.filter(gauge => 
      gauge.status === 'near_limit' || gauge.status === 'calibration_required'
    ).slice(0, 10);

    // Get overdue gauges
    const overdueGauges = recentGauges.filter(gauge => 
      gauge.status === 'overdue'
    ).slice(0, 10);

    res.json({
      success: true,
      data: {
        gauge_statistics: gaugeStats,
        alert_counts: alertCounts,
        gauges_nearing_limits: nearingLimits,
        overdue_gauges: overdueGauges,
        total_capacity_utilization: calculateAverageUtilization(recentGauges)
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
});

// GET /api/dashboard/alerts - Get active alerts
router.get('/alerts', async (req, res) => {
  try {
    const activeAlerts = await alertRepo.findActive();
    
    res.json({
      success: true,
      data: activeAlerts
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts'
    });
  }
});

function calculateAverageUtilization(gauges: any[]): number {
  if (gauges.length === 0) return 0;
  
  const totalUtilization = gauges.reduce((sum, gauge) => sum + (gauge.capacity_utilization || 0), 0);
  return Math.round((totalUtilization / gauges.length) * 100) / 100;
}

export default router;