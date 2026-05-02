import { AlertRepository } from '../repositories/AlertRepository';
import { GaugeRepository } from '../repositories/GaugeRepository';
import { IGauge } from '../models/Gauge';
import { IAlert } from '../models/Alert';
import { NotificationService } from './NotificationService';
import { randomUUID } from 'crypto';

export class AlertService {
  private alertRepo: AlertRepository;
  private gaugeRepo: GaugeRepository;
  private notificationService: NotificationService;

  constructor() {
    this.alertRepo = new AlertRepository();
    this.gaugeRepo = new GaugeRepository();
    this.notificationService = new NotificationService();
  }

  async generateAlertsForGauge(gauge: IGauge): Promise<IAlert[]> {
    const alerts: IAlert[] = [];

    // Clear existing alerts for this gauge first
    await this.alertRepo.deleteByGaugeId(gauge.gauge_id);

    // Generate alerts based on gauge status
    switch (gauge.status) {
      case 'overdue':
        alerts.push(await this.createAlert(
          gauge.gauge_id,
          'overdue_calibration',
          'critical',
          `Gauge ${gauge.gauge_id} (${gauge.gauge_type}) calibration is overdue. Next calibration was due: ${gauge.next_calibration_date.toDateString()}`
        ));
        break;

      case 'calibration_required':
        alerts.push(await this.createAlert(
          gauge.gauge_id,
          'upcoming_calibration',
          'warning',
          `Gauge ${gauge.gauge_id} (${gauge.gauge_type}) requires calibration soon. Remaining capacity: ${gauge.remaining_capacity}/${gauge.max_capacity}`
        ));
        break;

      case 'near_limit':
        alerts.push(await this.createAlert(
          gauge.gauge_id,
          'capacity_exhaustion',
          'warning',
          `Gauge ${gauge.gauge_id} (${gauge.gauge_type}) is nearing capacity limit. Remaining: ${gauge.remaining_capacity}/${gauge.max_capacity} (${Math.round(gauge.capacity_utilization)}% used)`
        ));
        break;

      case 'safe':
        // No alerts needed for safe gauges
        break;
    }

    return alerts;
  }

  async generateAlertsForAllGauges(): Promise<{
    total_gauges: number;
    alerts_generated: number;
    alerts_by_type: Record<string, number>;
  }> {
    const gauges = await this.gaugeRepo.findAll();
    let totalAlerts = 0;
    const alertsByType: Record<string, number> = {
      overdue_calibration: 0,
      upcoming_calibration: 0,
      capacity_exhaustion: 0
    };

    for (const gauge of gauges) {
      const alerts = await this.generateAlertsForGauge(gauge);
      totalAlerts += alerts.length;
      
      alerts.forEach(alert => {
        alertsByType[alert.alert_type] = (alertsByType[alert.alert_type] || 0) + 1;
      });
    }

    return {
      total_gauges: gauges.length,
      alerts_generated: totalAlerts,
      alerts_by_type: alertsByType
    };
  }

  async getActiveAlerts(): Promise<IAlert[]> {
    return await this.alertRepo.findActive();
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<IAlert | null> {
    return await this.alertRepo.acknowledge(alertId, acknowledgedBy);
  }

  async getAlertsForGauge(gaugeId: string): Promise<IAlert[]> {
    return await this.alertRepo.findByGaugeId(gaugeId);
  }

  private async createAlert(
    gaugeId: string,
    alertType: 'upcoming_calibration' | 'overdue_calibration' | 'capacity_exhaustion',
    severity: 'info' | 'warning' | 'critical',
    message: string
  ): Promise<IAlert> {
    const alertData = {
      alert_id: randomUUID(),
      gauge_id: gaugeId,
      alert_type: alertType,
      severity,
      message
    };

    const alert = await this.alertRepo.create(alertData);

    // Send notifications for critical and warning alerts
    if (severity === 'critical' || severity === 'warning') {
      try {
        const gauge = await this.gaugeRepo.findById(gaugeId);
        if (gauge) {
          await this.notificationService.sendAlertNotification(alert, gauge);
        }
      } catch (error) {
        console.error('Failed to send alert notification:', error);
      }
    }

    return alert;
  }

  async resolveAlertsForGauge(gaugeId: string, resolvedBy: string): Promise<number> {
    const activeAlerts = await this.alertRepo.findByGaugeId(gaugeId);
    let resolvedCount = 0;

    for (const alert of activeAlerts) {
      if (!alert.acknowledged_at) {
        await this.alertRepo.acknowledge(alert.alert_id, resolvedBy);
        resolvedCount++;
      }
    }

    return resolvedCount;
  }

  async getAlertStatistics(): Promise<{
    total: number;
    active: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
    recent_alerts: IAlert[];
  }> {
    const [allAlerts, activeAlerts, alertCounts] = await Promise.all([
      this.alertRepo.findAll(),
      this.alertRepo.findActive(),
      this.alertRepo.getAlertCounts()
    ]);

    const bySeverity = allAlerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byType = allAlerts.reduce((acc, alert) => {
      acc[alert.alert_type] = (acc[alert.alert_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: alertCounts.total,
      active: alertCounts.active,
      by_severity: bySeverity,
      by_type: byType,
      recent_alerts: activeAlerts.slice(0, 10) // Last 10 active alerts
    };
  }
}