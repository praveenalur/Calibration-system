export interface GaugeProfile {
  id: string;
  gauge_id: string;
  gauge_type: string;
  calibration_frequency: number; // months
  last_calibration_date: string;
  monthly_usage: number;
  produced_quantity: number;
  max_capacity: number;
  last_modified_by: string;
  created_at: string;
  updated_at: string;
  
  // Calculated fields
  remaining_capacity?: number;
  status?: 'safe' | 'near_limit' | 'calibration_required' | 'overdue';
  next_calibration_date?: string;
}

export interface CapacityThresholds {
  near_limit_percentage: number;
  calibration_warning_months: number;
}

export interface Alert {
  id: string;
  gauge_id: string;
  type: 'capacity' | 'calibration';
  severity: 'low' | 'medium' | 'high';
  message: string;
  created_at: string;
  acknowledged: boolean;
}

export interface AuditEntry {
  id: string;
  gauge_id: string;
  action: 'create' | 'update' | 'delete';
  old_values?: any;
  new_values?: any;
  user: string;
  timestamp: string;
}

export interface DashboardStats {
  total_gauges: number;
  safe_count: number;
  near_limit_count: number;
  calibration_required_count: number;
  overdue_count: number;
  recent_alerts: Alert[];
}

export interface ExcelRow {
  'Gauge ID': string;
  'Gauge Type': string;
  'Calibration frequency (months)': number;
  'Last calibration date': string;
  'Monthly usage': number;
  'Produced quantity': number;
  'Maximum capacity': number;
  'Last modified by': string;
}