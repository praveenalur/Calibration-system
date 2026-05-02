import * as XLSX from 'xlsx';
import { GaugeRepository } from '../repositories/GaugeRepository';
import { AuditRepository } from '../repositories/AuditRepository';
import { CapacityService } from './CapacityService';
import { randomUUID } from 'crypto';
import { IGauge } from '../models/Gauge';

export interface ImportResult {
  success: boolean;
  summary: {
    total_rows: number;
    inserted: number;
    updated: number;
    errors: number;
  };
  errors: Array<{
    row: number;
    gauge_id?: string;
    error: string;
  }>;
  inserted_gauges: string[];
  updated_gauges: string[];
}

export interface ExportData {
  gauge_id: string;
  gauge_type: string;
  calibration_frequency: number;
  last_calibration_date: string;
  next_calibration_date: string;
  monthly_usage: number;
  produced_quantity: number;
  max_capacity: number;
  remaining_capacity: number;
  capacity_utilization: number;
  status: string;
  last_modified_by: string;
  created_at: string;
  updated_at: string;
}

export class ExcelService {
  private gaugeRepo: GaugeRepository;
  private auditRepo: AuditRepository;

  constructor() {
    this.gaugeRepo = new GaugeRepository();
    this.auditRepo = new AuditRepository();
  }

  async importFromExcel(buffer: Buffer, userId: string = 'system'): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      summary: {
        total_rows: 0,
        inserted: 0,
        updated: 0,
        errors: 0
      },
      errors: [],
      inserted_gauges: [],
      updated_gauges: []
    };

    try {
      // Parse Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      result.summary.total_rows = data.length;

      // Process each row
      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any;
        const rowNumber = i + 2; // Excel rows start at 1, plus header

        try {
          // Validate required fields
          const validationError = this.validateRow(row);
          if (validationError) {
            result.errors.push({
              row: rowNumber,
              gauge_id: row.gauge_id || 'Unknown',
              error: validationError
            });
            result.summary.errors++;
            continue;
          }

          // Prepare gauge data
          const gaugeData = this.mapRowToGauge(row, userId);
          const gaugeId = gaugeData.gauge_id!; // We know it exists from validation

          // Check if gauge exists
          const existingGauge = await this.gaugeRepo.findById(gaugeId);

          if (existingGauge) {
            // Update existing gauge
            const mergedData = {
              ...existingGauge.toObject(),
              ...gaugeData
            };
            const updatedData = CapacityService.updateCalculatedFields(mergedData);
            
            await this.gaugeRepo.update(gaugeId, updatedData);
            
            // Create audit log
            await this.auditRepo.create({
              entry_id: randomUUID(),
              gauge_id: gaugeId,
              user_id: userId,
              action: 'import',
              changes: updatedData,
              previous_values: existingGauge.toObject(),
              timestamp: new Date()
            });

            result.updated_gauges.push(gaugeId);
            result.summary.updated++;
          } else {
            // Create new gauge
            const calculatedData = CapacityService.updateCalculatedFields(gaugeData);
            await this.gaugeRepo.create(calculatedData);

            // Create audit log
            await this.auditRepo.create({
              entry_id: randomUUID(),
              gauge_id: gaugeId,
              user_id: userId,
              action: 'import',
              changes: calculatedData,
              previous_values: {},
              timestamp: new Date()
            });

            result.inserted_gauges.push(gaugeId);
            result.summary.inserted++;
          }
        } catch (error) {
          result.errors.push({
            row: rowNumber,
            gauge_id: row.gauge_id || 'Unknown',
            error: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
          result.summary.errors++;
        }
      }

      result.success = result.summary.errors < result.summary.total_rows;
      return result;

    } catch (error) {
      result.errors.push({
        row: 0,
        error: `File processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      result.summary.errors++;
      return result;
    }
  }

  async exportToExcel(): Promise<Buffer> {
    try {
      // Get all gauges
      const gauges = await this.gaugeRepo.findAll();
      const stats = await this.gaugeRepo.getStatistics();

      // Prepare data for export
      const exportData: ExportData[] = gauges.map(gauge => ({
        gauge_id: gauge.gauge_id,
        gauge_type: gauge.gauge_type,
        calibration_frequency: gauge.calibration_frequency,
        last_calibration_date: gauge.last_calibration_date.toISOString().split('T')[0],
        next_calibration_date: gauge.next_calibration_date.toISOString().split('T')[0],
        monthly_usage: gauge.monthly_usage,
        produced_quantity: gauge.produced_quantity,
        max_capacity: gauge.max_capacity,
        remaining_capacity: gauge.remaining_capacity,
        capacity_utilization: Math.round(gauge.capacity_utilization * 100) / 100,
        status: gauge.status,
        last_modified_by: gauge.last_modified_by || 'system',
        created_at: gauge.created_at.toISOString().split('T')[0],
        updated_at: gauge.updated_at.toISOString().split('T')[0]
      }));

      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Add gauges sheet
      const gaugesSheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, gaugesSheet, 'Gauges');

      // Add statistics sheet
      const statsData = [
        { Metric: 'Total Gauges', Value: stats.total },
        { Metric: 'Safe', Value: stats.safe },
        { Metric: 'Near Limit', Value: stats.near_limit },
        { Metric: 'Calibration Required', Value: stats.calibration_required },
        { Metric: 'Overdue', Value: stats.overdue },
        { Metric: 'Export Date', Value: new Date().toISOString().split('T')[0] }
      ];
      const statsSheet = XLSX.utils.json_to_sheet(statsData);
      XLSX.utils.book_append_sheet(workbook, statsSheet, 'Statistics');

      // Generate buffer
      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    } catch (error) {
      throw new Error(`Excel export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateRow(row: any): string | null {
    const requiredFields = [
      'gauge_id',
      'gauge_type',
      'calibration_frequency',
      'last_calibration_date',
      'monthly_usage',
      'produced_quantity',
      'max_capacity'
    ];

    for (const field of requiredFields) {
      if (!row[field] && row[field] !== 0) {
        return `Missing required field: ${field}`;
      }
    }

    // Validate numeric fields
    const numericFields = ['calibration_frequency', 'monthly_usage', 'produced_quantity', 'max_capacity'];
    for (const field of numericFields) {
      if (isNaN(Number(row[field])) || Number(row[field]) < 0) {
        return `Invalid numeric value for ${field}: ${row[field]}`;
      }
    }

    // Validate date
    const date = new Date(row.last_calibration_date);
    if (isNaN(date.getTime())) {
      return `Invalid date format for last_calibration_date: ${row.last_calibration_date}`;
    }

    return null;
  }

  private mapRowToGauge(row: any, userId: string): Partial<IGauge> {
    return {
      gauge_id: String(row.gauge_id).trim(),
      gauge_type: String(row.gauge_type).trim(),
      calibration_frequency: Number(row.calibration_frequency),
      last_calibration_date: new Date(row.last_calibration_date),
      monthly_usage: Number(row.monthly_usage),
      produced_quantity: Number(row.produced_quantity),
      max_capacity: Number(row.max_capacity),
      last_modified_by: userId,
      remaining_capacity: 0, // Will be calculated
      capacity_utilization: 0, // Will be calculated
      next_calibration_date: new Date(), // Will be calculated
      status: 'safe' // Will be calculated
    } as Partial<IGauge>;
  }
}