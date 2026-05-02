import * as XLSX from 'xlsx';
import { GaugeProfile, ExcelRow } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ExcelProcessor {
  private static readonly REQUIRED_COLUMNS = [
    'Gauge ID',
    'Gauge Type', 
    'Calibration frequency (months)',
    'Last calibration date',
    'Monthly usage',
    'Produced quantity',
    'Maximum capacity',
    'Last modified by'
  ];

  /**
   * Validate Excel file format and structure
   */
  static validateExcelFile(buffer: Buffer): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      if (workbook.SheetNames.length === 0) {
        errors.push('Excel file contains no worksheets');
        return { valid: false, errors };
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      if (data.length < 2) {
        errors.push('Excel file must contain at least a header row and one data row');
        return { valid: false, errors };
      }

      const headers = data[0] as string[];
      const missingColumns = this.REQUIRED_COLUMNS.filter(col => !headers.includes(col));
      
      if (missingColumns.length > 0) {
        errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
      }

      // Validate data types in first few rows
      for (let i = 1; i < Math.min(data.length, 6); i++) {
        const row = data[i];
        const rowErrors = this.validateRowData(row, headers, i + 1);
        errors.push(...rowErrors);
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, errors };
    }
  }

  /**
   * Parse Excel file and convert to GaugeProfile array
   */
  static parseExcelData(buffer: Buffer): { profiles: GaugeProfile[]; errors: string[] } {
    const profiles: GaugeProfile[] = [];
    const errors: string[] = [];

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[];

      for (let i = 0; i < data.length; i++) {
        try {
          const row = data[i];
          const profile = this.convertRowToGaugeProfile(row, i + 2); // +2 because Excel is 1-indexed and has header
          profiles.push(profile);
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { profiles, errors };
    } catch (error) {
      errors.push(`Failed to parse Excel data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { profiles: [], errors };
    }
  }

  /**
   * Convert Excel row to GaugeProfile
   */
  private static convertRowToGaugeProfile(row: ExcelRow, rowNumber: number): GaugeProfile {
    // Validate required fields
    if (!row['Gauge ID'] || typeof row['Gauge ID'] !== 'string') {
      throw new Error('Gauge ID is required and must be a string');
    }

    if (!row['Gauge Type'] || typeof row['Gauge Type'] !== 'string') {
      throw new Error('Gauge Type is required and must be a string');
    }

    const calibrationFrequency = Number(row['Calibration frequency (months)']);
    if (isNaN(calibrationFrequency) || calibrationFrequency <= 0) {
      throw new Error('Calibration frequency must be a positive number');
    }

    const monthlyUsage = Number(row['Monthly usage']);
    if (isNaN(monthlyUsage) || monthlyUsage < 0) {
      throw new Error('Monthly usage must be a non-negative number');
    }

    const producedQuantity = Number(row['Produced quantity']);
    if (isNaN(producedQuantity) || producedQuantity < 0) {
      throw new Error('Produced quantity must be a non-negative number');
    }

    const maxCapacity = Number(row['Maximum capacity']);
    if (isNaN(maxCapacity) || maxCapacity <= 0) {
      throw new Error('Maximum capacity must be a positive number');
    }

    if (producedQuantity > maxCapacity) {
      throw new Error('Produced quantity cannot exceed maximum capacity');
    }

    // Parse and validate date
    let lastCalibrationDate: string;
    try {
      const dateValue = row['Last calibration date'];
      if (typeof dateValue === 'number') {
        // Excel date serial number
        const excelDate = new Date((dateValue - 25569) * 86400 * 1000);
        lastCalibrationDate = excelDate.toISOString().split('T')[0];
      } else if (typeof dateValue === 'string') {
        const parsedDate = new Date(dateValue);
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Invalid date format');
        }
        lastCalibrationDate = parsedDate.toISOString().split('T')[0];
      } else {
        throw new Error('Last calibration date is required');
      }
    } catch (error) {
      throw new Error(`Invalid last calibration date: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const now = new Date().toISOString();

    return {
      id: uuidv4(),
      gauge_id: row['Gauge ID'].toString().trim(),
      gauge_type: row['Gauge Type'].toString().trim(),
      calibration_frequency: calibrationFrequency,
      last_calibration_date: lastCalibrationDate,
      monthly_usage: monthlyUsage,
      produced_quantity: producedQuantity,
      max_capacity: maxCapacity,
      last_modified_by: row['Last modified by']?.toString().trim() || 'Excel Import',
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Validate individual row data
   */
  private static validateRowData(row: any[], headers: string[], rowNumber: number): string[] {
    const errors: string[] = [];
    
    if (row.length === 0) {
      return [`Row ${rowNumber}: Empty row`];
    }

    // Check for required fields
    this.REQUIRED_COLUMNS.forEach((column, index) => {
      const headerIndex = headers.indexOf(column);
      if (headerIndex === -1) return;
      
      const value = row[headerIndex];
      if (value === undefined || value === null || value === '') {
        errors.push(`Row ${rowNumber}: Missing value for ${column}`);
      }
    });

    return errors;
  }

  /**
   * Export gauge profiles to Excel format
   */
  static exportToExcel(profiles: GaugeProfile[]): Buffer {
    const exportData = profiles.map(profile => ({
      'Gauge ID': profile.gauge_id,
      'Gauge Type': profile.gauge_type,
      'Calibration frequency (months)': profile.calibration_frequency,
      'Last calibration date': profile.last_calibration_date,
      'Monthly usage': profile.monthly_usage,
      'Produced quantity': profile.produced_quantity,
      'Maximum capacity': profile.max_capacity,
      'Last modified by': profile.last_modified_by,
      'Remaining Capacity': profile.remaining_capacity || 0,
      'Status': profile.status || 'unknown',
      'Next Calibration Date': profile.next_calibration_date || '',
      'Created At': profile.created_at,
      'Updated At': profile.updated_at
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    const columnWidths = [
      { wch: 15 }, // Gauge ID
      { wch: 20 }, // Gauge Type
      { wch: 25 }, // Calibration frequency
      { wch: 20 }, // Last calibration date
      { wch: 15 }, // Monthly usage
      { wch: 18 }, // Produced quantity
      { wch: 18 }, // Maximum capacity
      { wch: 20 }, // Last modified by
      { wch: 18 }, // Remaining Capacity
      { wch: 15 }, // Status
      { wch: 20 }, // Next Calibration Date
      { wch: 20 }, // Created At
      { wch: 20 }  // Updated At
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gauge Profiles');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Generate Excel template for import
   */
  static generateTemplate(): Buffer {
    const templateData = [
      {
        'Gauge ID': 'EXAMPLE-001',
        'Gauge Type': 'Pressure Gauge',
        'Calibration frequency (months)': 12,
        'Last calibration date': '2024-01-15',
        'Monthly usage': 50,
        'Produced quantity': 750,
        'Maximum capacity': 1000,
        'Last modified by': 'System Admin'
      },
      {
        'Gauge ID': 'EXAMPLE-002',
        'Gauge Type': 'Temperature Gauge',
        'Calibration frequency (months)': 6,
        'Last calibration date': '2024-06-01',
        'Monthly usage': 25,
        'Produced quantity': 400,
        'Maximum capacity': 800,
        'Last modified by': 'Technician'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    const columnWidths = [
      { wch: 15 }, // Gauge ID
      { wch: 20 }, // Gauge Type
      { wch: 25 }, // Calibration frequency
      { wch: 20 }, // Last calibration date
      { wch: 15 }, // Monthly usage
      { wch: 18 }, // Produced quantity
      { wch: 18 }, // Maximum capacity
      { wch: 20 }  // Last modified by
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gauge Template');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Validate gauge profile data
   */
  static validateGaugeProfile(profile: Partial<GaugeProfile>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!profile.gauge_id || profile.gauge_id.trim().length === 0) {
      errors.push('Gauge ID is required');
    }

    if (!profile.gauge_type || profile.gauge_type.trim().length === 0) {
      errors.push('Gauge Type is required');
    }

    if (!profile.calibration_frequency || profile.calibration_frequency <= 0) {
      errors.push('Calibration frequency must be a positive number');
    }

    if (!profile.last_calibration_date) {
      errors.push('Last calibration date is required');
    } else {
      const date = new Date(profile.last_calibration_date);
      if (isNaN(date.getTime())) {
        errors.push('Last calibration date must be a valid date');
      }
    }

    if (profile.monthly_usage === undefined || profile.monthly_usage < 0) {
      errors.push('Monthly usage must be a non-negative number');
    }

    if (profile.produced_quantity === undefined || profile.produced_quantity < 0) {
      errors.push('Produced quantity must be a non-negative number');
    }

    if (!profile.max_capacity || profile.max_capacity <= 0) {
      errors.push('Maximum capacity must be a positive number');
    }

    if (profile.produced_quantity && profile.max_capacity && profile.produced_quantity > profile.max_capacity) {
      errors.push('Produced quantity cannot exceed maximum capacity');
    }

    return { valid: errors.length === 0, errors };
  }
}