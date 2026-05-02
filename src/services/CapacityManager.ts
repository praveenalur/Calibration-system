import { GaugeProfile, CapacityThresholds } from '../types';

export class CapacityManager {
  
  /**
   * Calculate remaining capacity for a gauge
   */
  static calculateRemainingCapacity(profile: GaugeProfile): number {
    return profile.max_capacity - profile.produced_quantity;
  }

  /**
   * Determine gauge status based on capacity and calibration
   */
  static determineGaugeStatus(profile: GaugeProfile, thresholds: CapacityThresholds): string {
    const remainingCapacity = this.calculateRemainingCapacity(profile);
    const capacityPercentage = (profile.produced_quantity / profile.max_capacity) * 100;
    
    // Check if overdue (no remaining capacity)
    if (remainingCapacity <= 0) {
      return 'overdue';
    }

    // Check if calibration is due based on time
    const lastCalibration = new Date(profile.last_calibration_date);
    const now = new Date();
    const monthsSinceCalibration = this.getMonthsDifference(lastCalibration, now);
    
    if (monthsSinceCalibration >= profile.calibration_frequency) {
      return 'calibration_required';
    }

    // Check if near calibration warning period
    const monthsUntilCalibration = profile.calibration_frequency - monthsSinceCalibration;
    if (monthsUntilCalibration <= thresholds.calibration_warning_months) {
      return 'calibration_required';
    }

    // Check capacity percentage
    if (capacityPercentage >= thresholds.near_limit_percentage) {
      return 'near_limit';
    }

    return 'safe';
  }

  /**
   * Calculate next calibration date
   */
  static calculateNextCalibrationDate(profile: GaugeProfile): string {
    const lastCalibration = new Date(profile.last_calibration_date);
    const nextCalibration = new Date(lastCalibration);
    nextCalibration.setMonth(nextCalibration.getMonth() + profile.calibration_frequency);
    return nextCalibration.toISOString().split('T')[0];
  }

  /**
   * Enrich gauge profile with calculated fields
   */
  static enrichGaugeProfile(profile: GaugeProfile, thresholds: CapacityThresholds): GaugeProfile {
    const enriched = { ...profile };
    enriched.remaining_capacity = this.calculateRemainingCapacity(profile);
    enriched.status = this.determineGaugeStatus(profile, thresholds) as any;
    enriched.next_calibration_date = this.calculateNextCalibrationDate(profile);
    return enriched;
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
   * Estimate months until capacity exhaustion
   */
  static estimateMonthsUntilExhaustion(profile: GaugeProfile): number | null {
    if (profile.monthly_usage <= 0) return null;
    
    const remainingCapacity = this.calculateRemainingCapacity(profile);
    if (remainingCapacity <= 0) return 0;
    
    return Math.floor(remainingCapacity / profile.monthly_usage);
  }

  /**
   * Check if gauge needs immediate attention
   */
  static needsImmediateAttention(profile: GaugeProfile, thresholds: CapacityThresholds): boolean {
    const status = this.determineGaugeStatus(profile, thresholds);
    return status === 'overdue' || status === 'calibration_required';
  }
}