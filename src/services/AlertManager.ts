import { GaugeProfile, Alert, CapacityThresholds } from '../types';
import { CapacityManager } from './CapacityManager';
import { v4 as uuidv4 } from 'uuid';

export class AlertManager {
  
  /**
   * Generate alerts for a gauge based on its current status
   */
  static generateAlertsForGauge(profile: GaugeProfile, thresholds: CapacityThresholds): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date().toISOString();
    
    const remainingCapacity = CapacityManager.calculateRemainingCapacity(profile);
    const status = CapacityManager.determineGaugeStatus(profile, thresholds);
    const capacityPercentage = (profile.produced_quantity / profile.max_capacity) * 100;
    
    // Capacity-based alerts
    if (remainingCapacity <= 0) {
      alerts.push({
        id: uuidv4(),
        gauge_id: profile.gauge_id,
        type: 'capacity',
        severity: 'high',
        message: `Gauge ${profile.gauge_id} has exceeded maximum capacity (${profile.produced_quantity}/${profile.max_capacity})`,
        created_at: now,
        acknowledged: false
      });
    } else if (capacityPercentage >= thresholds.near_limit_percentage) {
      alerts.push({
        id: uuidv4(),
        gauge_id: profile.gauge_id,
        type: 'capacity',
        severity: 'medium',
        message: `Gauge ${profile.gauge_id} is near capacity limit (${capacityPercentage.toFixed(1)}% used)`,
        created_at: now,
        acknowledged: false
      });
    }
    
    // Calibration-based alerts
    const lastCalibration = new Date(profile.last_calibration_date);
    const now_date = new Date();
    const monthsSinceCalibration = this.getMonthsDifference(lastCalibration, now_date);
    
    if (monthsSinceCalibration >= profile.calibration_frequency) {
      alerts.push({
        id: uuidv4(),
        gauge_id: profile.gauge_id,
        type: 'calibration',
        severity: 'high',
        message: `Gauge ${profile.gauge_id} calibration is overdue (${monthsSinceCalibration} months since last calibration)`,
        created_at: now,
        acknowledged: false
      });
    } else {
      const monthsUntilCalibration = profile.calibration_frequency - monthsSinceCalibration;
      if (monthsUntilCalibration <= thresholds.calibration_warning_months) {
        alerts.push({
          id: uuidv4(),
          gauge_id: profile.gauge_id,
          type: 'calibration',
          severity: 'medium',
          message: `Gauge ${profile.gauge_id} calibration due in ${monthsUntilCalibration} month(s)`,
          created_at: now,
          acknowledged: false
        });
      }
    }
    
    return alerts;
  }
  
  /**
   * Process gauge update and generate appropriate alerts
   */
  static processGaugeUpdate(oldProfile: GaugeProfile, newProfile: GaugeProfile, thresholds: CapacityThresholds): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date().toISOString();
    
    // Check if capacity changed significantly
    const oldCapacityPercentage = (oldProfile.produced_quantity / oldProfile.max_capacity) * 100;
    const newCapacityPercentage = (newProfile.produced_quantity / newProfile.max_capacity) * 100;
    
    // Alert if capacity crossed threshold
    if (oldCapacityPercentage < thresholds.near_limit_percentage && 
        newCapacityPercentage >= thresholds.near_limit_percentage) {
      alerts.push({
        id: uuidv4(),
        gauge_id: newProfile.gauge_id,
        type: 'capacity',
        severity: 'medium',
        message: `Gauge ${newProfile.gauge_id} has crossed capacity threshold (${newCapacityPercentage.toFixed(1)}% used)`,
        created_at: now,
        acknowledged: false
      });
    }
    
    // Alert if capacity exceeded maximum
    if (oldProfile.produced_quantity <= oldProfile.max_capacity && 
        newProfile.produced_quantity > newProfile.max_capacity) {
      alerts.push({
        id: uuidv4(),
        gauge_id: newProfile.gauge_id,
        type: 'capacity',
        severity: 'high',
        message: `Gauge ${newProfile.gauge_id} has exceeded maximum capacity`,
        created_at: now,
        acknowledged: false
      });
    }
    
    // Check calibration date changes
    if (oldProfile.last_calibration_date !== newProfile.last_calibration_date) {
      const newLastCalibration = new Date(newProfile.last_calibration_date);
      const now_date = new Date();
      const monthsSinceCalibration = this.getMonthsDifference(newLastCalibration, now_date);
      
      if (monthsSinceCalibration < 0) {
        // Future calibration date
        alerts.push({
          id: uuidv4(),
          gauge_id: newProfile.gauge_id,
          type: 'calibration',
          severity: 'low',
          message: `Gauge ${newProfile.gauge_id} calibration date updated to future date`,
          created_at: now,
          acknowledged: false
        });
      } else if (monthsSinceCalibration >= newProfile.calibration_frequency) {
        alerts.push({
          id: uuidv4(),
          gauge_id: newProfile.gauge_id,
          type: 'calibration',
          severity: 'high',
          message: `Gauge ${newProfile.gauge_id} calibration is still overdue after update`,
          created_at: now,
          acknowledged: false
        });
      }
    }
    
    return alerts;
  }
  
  /**
   * Check all gauges and generate system-wide alerts
   */
  static generateSystemAlerts(profiles: GaugeProfile[], thresholds: CapacityThresholds): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date().toISOString();
    
    // Count gauges by status
    let overdueCount = 0;
    let nearLimitCount = 0;
    let calibrationRequiredCount = 0;
    
    profiles.forEach(profile => {
      const status = CapacityManager.determineGaugeStatus(profile, thresholds);
      switch (status) {
        case 'overdue':
          overdueCount++;
          break;
        case 'near_limit':
          nearLimitCount++;
          break;
        case 'calibration_required':
          calibrationRequiredCount++;
          break;
      }
    });
    
    // Generate system-level alerts
    if (overdueCount > 0) {
      alerts.push({
        id: uuidv4(),
        gauge_id: 'SYSTEM',
        type: 'calibration',
        severity: 'high',
        message: `System Alert: ${overdueCount} gauge(s) are overdue for calibration`,
        created_at: now,
        acknowledged: false
      });
    }
    
    if (nearLimitCount > 5) {
      alerts.push({
        id: uuidv4(),
        gauge_id: 'SYSTEM',
        type: 'capacity',
        severity: 'medium',
        message: `System Alert: ${nearLimitCount} gauge(s) are near capacity limits`,
        created_at: now,
        acknowledged: false
      });
    }
    
    return alerts;
  }
  
  /**
   * Filter alerts by criteria
   */
  static filterAlerts(alerts: Alert[], criteria: {
    acknowledged?: boolean;
    severity?: string;
    type?: string;
    gauge_id?: string;
    since?: string;
  }): Alert[] {
    let filtered = [...alerts];
    
    if (criteria.acknowledged !== undefined) {
      filtered = filtered.filter(alert => alert.acknowledged === criteria.acknowledged);
    }
    
    if (criteria.severity) {
      filtered = filtered.filter(alert => alert.severity === criteria.severity);
    }
    
    if (criteria.type) {
      filtered = filtered.filter(alert => alert.type === criteria.type);
    }
    
    if (criteria.gauge_id) {
      filtered = filtered.filter(alert => alert.gauge_id === criteria.gauge_id);
    }
    
    if (criteria.since) {
      const sinceDate = new Date(criteria.since);
      filtered = filtered.filter(alert => new Date(alert.created_at) >= sinceDate);
    }
    
    return filtered;
  }
  
  /**
   * Get alert summary statistics
   */
  static getAlertSummary(alerts: Alert[]): {
    total: number;
    unacknowledged: number;
    by_severity: { low: number; medium: number; high: number };
    by_type: { capacity: number; calibration: number };
  } {
    const summary = {
      total: alerts.length,
      unacknowledged: alerts.filter(a => !a.acknowledged).length,
      by_severity: { low: 0, medium: 0, high: 0 },
      by_type: { capacity: 0, calibration: 0 }
    };
    
    alerts.forEach(alert => {
      // Count by severity
      if (alert.severity === 'low') summary.by_severity.low++;
      else if (alert.severity === 'medium') summary.by_severity.medium++;
      else if (alert.severity === 'high') summary.by_severity.high++;
      
      // Count by type
      if (alert.type === 'capacity') summary.by_type.capacity++;
      else if (alert.type === 'calibration') summary.by_type.calibration++;
    });
    
    return summary;
  }
  
  /**
   * Determine if an alert should be auto-acknowledged
   */
  static shouldAutoAcknowledge(alert: Alert, profile: GaugeProfile, thresholds: CapacityThresholds): boolean {
    const currentStatus = CapacityManager.determineGaugeStatus(profile, thresholds);
    
    // Auto-acknowledge capacity alerts if gauge is now safe
    if (alert.type === 'capacity' && currentStatus === 'safe') {
      return true;
    }
    
    // Auto-acknowledge calibration alerts if recently calibrated
    if (alert.type === 'calibration') {
      const lastCalibration = new Date(profile.last_calibration_date);
      const alertCreated = new Date(alert.created_at);
      
      // If calibration date is after alert creation, auto-acknowledge
      if (lastCalibration > alertCreated) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get months difference between two dates
   */
  private static getMonthsDifference(date1: Date, date2: Date): number {
    const yearDiff = date2.getFullYear() - date1.getFullYear();
    const monthDiff = date2.getMonth() - date1.getMonth();
    return yearDiff * 12 + monthDiff;
  }
  
  /**
   * Create alert message based on gauge status and context
   */
  static createAlertMessage(profile: GaugeProfile, alertType: 'capacity' | 'calibration', context?: any): string {
    const remainingCapacity = CapacityManager.calculateRemainingCapacity(profile);
    const capacityPercentage = (profile.produced_quantity / profile.max_capacity) * 100;
    
    if (alertType === 'capacity') {
      if (remainingCapacity <= 0) {
        return `Gauge ${profile.gauge_id} has exceeded maximum capacity. Immediate calibration required.`;
      } else {
        return `Gauge ${profile.gauge_id} is at ${capacityPercentage.toFixed(1)}% capacity. Consider scheduling calibration.`;
      }
    } else {
      const lastCalibration = new Date(profile.last_calibration_date);
      const now = new Date();
      const monthsSince = this.getMonthsDifference(lastCalibration, now);
      
      if (monthsSince >= profile.calibration_frequency) {
        return `Gauge ${profile.gauge_id} calibration is ${monthsSince - profile.calibration_frequency} month(s) overdue.`;
      } else {
        const monthsUntil = profile.calibration_frequency - monthsSince;
        return `Gauge ${profile.gauge_id} calibration due in ${monthsUntil} month(s).`;
      }
    }
  }
}