import { IGauge } from '../models/Gauge';

export class CapacityService {
  
  static calculateRemainingCapacity(gauge: IGauge): number {
    return gauge.max_capacity - gauge.produced_quantity;
  }

  static calculateCapacityUtilization(gauge: IGauge): number {
    if (gauge.max_capacity === 0) return 0;
    return (gauge.produced_quantity / gauge.max_capacity) * 100;
  }

  static determineGaugeStatus(gauge: IGauge, thresholds = {
    calibration_required_threshold: 0.1,
    near_limit_threshold: 0.2,
    overdue_capacity_threshold: 0.0
  }): 'safe' | 'near_limit' | 'calibration_required' | 'overdue' {
    
    const now = new Date();
    const remainingCapacity = this.calculateRemainingCapacity(gauge);
    
    // Check for overdue conditions
    if (remainingCapacity <= (gauge.max_capacity * thresholds.overdue_capacity_threshold) || 
        gauge.next_calibration_date < now) {
      return 'overdue';
    }
    
    // Check for calibration required (approaching limits)
    if (remainingCapacity <= (gauge.max_capacity * thresholds.calibration_required_threshold)) {
      return 'calibration_required';
    }
    
    // Check for near limit warning
    if (remainingCapacity <= (gauge.max_capacity * thresholds.near_limit_threshold)) {
      return 'near_limit';
    }
    
    return 'safe';
  }

  static calculateNextCalibrationDate(lastCalibrationDate: Date, frequencyMonths: number): Date {
    const nextDate = new Date(lastCalibrationDate);
    nextDate.setMonth(nextDate.getMonth() + frequencyMonths);
    return nextDate;
  }

  static updateCalculatedFields(gauge: Partial<IGauge>): Partial<IGauge> {
    // Create a copy to avoid mutating the original
    const updatedGauge = { ...gauge };
    
    if (updatedGauge.max_capacity && updatedGauge.produced_quantity !== undefined) {
      updatedGauge.remaining_capacity = updatedGauge.max_capacity - updatedGauge.produced_quantity;
      updatedGauge.capacity_utilization = (updatedGauge.produced_quantity / updatedGauge.max_capacity) * 100;
    }

    if (updatedGauge.last_calibration_date && updatedGauge.calibration_frequency) {
      updatedGauge.next_calibration_date = this.calculateNextCalibrationDate(
        updatedGauge.last_calibration_date, 
        updatedGauge.calibration_frequency
      );
    }

    // Determine status if we have all required fields
    if (updatedGauge.remaining_capacity !== undefined && updatedGauge.max_capacity && updatedGauge.next_calibration_date) {
      updatedGauge.status = this.determineGaugeStatus(updatedGauge as IGauge);
    }

    return updatedGauge;
  }
}