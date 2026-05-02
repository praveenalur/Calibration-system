import cron from 'node-cron';
import { GaugeRepository } from '../repositories/GaugeRepository';
import { AlertService } from './AlertService';
import { NotificationService } from './NotificationService';
import { AuditRepository } from '../repositories/AuditRepository';
import { randomUUID } from 'crypto';

export class SchedulerService {
  private gaugeRepo: GaugeRepository;
  private alertService: AlertService;
  private notificationService: NotificationService;
  private auditRepo: AuditRepository;
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.gaugeRepo = new GaugeRepository();
    this.alertService = new AlertService();
    this.notificationService = new NotificationService();
    this.auditRepo = new AuditRepository();
  }

  start(): void {
    console.log('🕐 Starting scheduled tasks...');

    // Daily calibration check at 8:00 AM
    const dailyCalibrationCheck = cron.schedule('0 8 * * *', async () => {
      await this.checkUpcomingCalibrations();
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });

    // Hourly alert generation for critical gauges
    const hourlyAlertCheck = cron.schedule('0 * * * *', async () => {
      await this.generateCriticalAlerts();
    }, {
      scheduled: false
    });

    // Weekly system health report (Mondays at 9:00 AM)
    const weeklyHealthReport = cron.schedule('0 9 * * 1', async () => {
      await this.generateWeeklyHealthReport();
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });

    // Daily cleanup of old audit logs (keep last 90 days)
    const dailyCleanup = cron.schedule('0 2 * * *', async () => {
      await this.cleanupOldAuditLogs();
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });

    // Store jobs
    this.jobs.set('dailyCalibrationCheck', dailyCalibrationCheck);
    this.jobs.set('hourlyAlertCheck', hourlyAlertCheck);
    this.jobs.set('weeklyHealthReport', weeklyHealthReport);
    this.jobs.set('dailyCleanup', dailyCleanup);

    // Start all jobs
    this.jobs.forEach((job, name) => {
      job.start();
      console.log(`✅ Started scheduled task: ${name}`);
    });

    console.log('🕐 All scheduled tasks started successfully');
  }

  stop(): void {
    console.log('🛑 Stopping scheduled tasks...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`🛑 Stopped scheduled task: ${name}`);
    });

    this.jobs.clear();
    console.log('🛑 All scheduled tasks stopped');
  }

  private async checkUpcomingCalibrations(): Promise<void> {
    try {
      console.log('🔍 Running daily calibration check...');

      const gauges = await this.gaugeRepo.findAll();
      const now = new Date();
      const upcomingThreshold = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now

      const upcomingGauges = gauges.filter(gauge => {
        const calibrationDate = new Date(gauge.next_calibration_date);
        return calibrationDate <= upcomingThreshold && gauge.status !== 'safe';
      });

      if (upcomingGauges.length > 0) {
        console.log(`📅 Found ${upcomingGauges.length} gauges requiring calibration attention`);

        // Send daily report
        await this.notificationService.sendDailyCalibrationReport(upcomingGauges);

        // Create audit log
        await this.auditRepo.create({
          entry_id: randomUUID(),
          gauge_id: 'SYSTEM',
          user_id: 'scheduler',
          action: 'update',
          changes: {
            action: 'daily_calibration_check',
            gauges_found: upcomingGauges.length,
            gauge_ids: upcomingGauges.map(g => g.gauge_id)
          },
          previous_values: {},
          timestamp: new Date()
        });
      } else {
        console.log('✅ No gauges require immediate calibration attention');
      }

    } catch (error) {
      console.error('❌ Daily calibration check failed:', error);
    }
  }

  private async generateCriticalAlerts(): Promise<void> {
    try {
      console.log('🚨 Running hourly critical alert check...');

      const gauges = await this.gaugeRepo.findAll();
      const criticalGauges = gauges.filter(gauge => 
        gauge.status === 'overdue' || gauge.status === 'calibration_required'
      );

      let alertsGenerated = 0;

      for (const gauge of criticalGauges) {
        const alerts = await this.alertService.generateAlertsForGauge(gauge);
        alertsGenerated += alerts.length;

        // Send notifications for critical alerts
        for (const alert of alerts) {
          if (alert.severity === 'critical') {
            await this.notificationService.sendAlertNotification(alert, gauge);
          }
        }
      }

      if (alertsGenerated > 0) {
        console.log(`🚨 Generated ${alertsGenerated} critical alerts`);

        // Create audit log
        await this.auditRepo.create({
          entry_id: randomUUID(),
          gauge_id: 'SYSTEM',
          user_id: 'scheduler',
          action: 'update',
          changes: {
            action: 'hourly_alert_check',
            alerts_generated: alertsGenerated,
            critical_gauges: criticalGauges.length
          },
          previous_values: {},
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('❌ Hourly alert check failed:', error);
    }
  }

  private async generateWeeklyHealthReport(): Promise<void> {
    try {
      console.log('📊 Generating weekly health report...');

      const [gaugeStats, alertStats] = await Promise.all([
        this.gaugeRepo.getStatistics(),
        this.alertService.getAlertStatistics()
      ]);

      // Create comprehensive health report audit log
      await this.auditRepo.create({
        entry_id: randomUUID(),
        gauge_id: 'SYSTEM',
        user_id: 'scheduler',
        action: 'update',
        changes: {
          action: 'weekly_health_report',
          gauge_statistics: gaugeStats,
          alert_statistics: alertStats,
          report_date: new Date().toISOString()
        },
        previous_values: {},
        timestamp: new Date()
      });

      console.log('📊 Weekly health report generated successfully');

    } catch (error) {
      console.error('❌ Weekly health report failed:', error);
    }
  }

  private async cleanupOldAuditLogs(): Promise<void> {
    try {
      console.log('🧹 Running daily audit log cleanup...');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

      // Note: This would require adding a cleanup method to AuditRepository
      // For now, we'll just log the action
      console.log(`🧹 Would cleanup audit logs older than ${cutoffDate.toDateString()}`);

      // Create audit log for cleanup action
      await this.auditRepo.create({
        entry_id: randomUUID(),
        gauge_id: 'SYSTEM',
        user_id: 'scheduler',
        action: 'update',
        changes: {
          action: 'audit_log_cleanup',
          cutoff_date: cutoffDate.toISOString(),
          note: 'Cleanup simulation - implement actual cleanup in AuditRepository'
        },
        previous_values: {},
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Audit log cleanup failed:', error);
    }
  }

  // Manual trigger methods for testing
  async triggerCalibrationCheck(): Promise<void> {
    console.log('🔧 Manually triggering calibration check...');
    await this.checkUpcomingCalibrations();
  }

  async triggerAlertCheck(): Promise<void> {
    console.log('🔧 Manually triggering alert check...');
    await this.generateCriticalAlerts();
  }

  async triggerHealthReport(): Promise<void> {
    console.log('🔧 Manually triggering health report...');
    await this.generateWeeklyHealthReport();
  }

  getJobStatus(): Record<string, { running: boolean; nextRun?: Date }> {
    const status: Record<string, { running: boolean; nextRun?: Date }> = {};

    this.jobs.forEach((job, name) => {
      status[name] = {
        running: false, // node-cron doesn't expose running status
        nextRun: undefined // node-cron doesn't expose next run date
      };
    });

    return status;
  }
}

// Singleton instance
let schedulerService: SchedulerService | null = null;

export function initializeScheduler(): SchedulerService {
  if (!schedulerService) {
    schedulerService = new SchedulerService();
    schedulerService.start();
    console.log('🕐 Scheduler service initialized');
  }
  return schedulerService;
}

export function getSchedulerService(): SchedulerService | null {
  return schedulerService;
}