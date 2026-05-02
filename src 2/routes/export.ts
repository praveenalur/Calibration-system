import express from 'express';
import { ExcelService } from '../services/ExcelService';
import { GaugeRepository } from '../repositories/GaugeRepository';

const router = express.Router();
const excelService = new ExcelService();
const gaugeRepo = new GaugeRepository();

// GET /api/export/gauges - Export all gauges to Excel
router.get('/gauges', async (req, res) => {
  try {
    const buffer = await excelService.exportToExcel();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `capacity-system-gauges-${timestamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

  } catch (error) {
    console.error('Error exporting gauges:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export gauges'
    });
  }
});

// GET /api/export/template - Download Excel template for import
router.get('/template', async (req, res) => {
  try {
    // Create a sample template with headers and example data
    const XLSX = require('xlsx');
    
    const templateData = [
      {
        gauge_id: 'EXAMPLE-001',
        gauge_type: 'Pressure Gauge',
        calibration_frequency: 12,
        last_calibration_date: '2024-01-01',
        monthly_usage: 100,
        produced_quantity: 500,
        max_capacity: 1000
      },
      {
        gauge_id: 'EXAMPLE-002',
        gauge_type: 'Temperature Gauge',
        calibration_frequency: 6,
        last_calibration_date: '2024-06-01',
        monthly_usage: 75,
        produced_quantity: 200,
        max_capacity: 800
      }
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Add instructions sheet
    const instructions = [
      { Field: 'gauge_id', Description: 'Unique identifier for the gauge', Required: 'Yes', Example: 'PG-001' },
      { Field: 'gauge_type', Description: 'Type or description of the gauge', Required: 'Yes', Example: 'Pressure Gauge' },
      { Field: 'calibration_frequency', Description: 'Calibration frequency in months', Required: 'Yes', Example: '12' },
      { Field: 'last_calibration_date', Description: 'Last calibration date (YYYY-MM-DD)', Required: 'Yes', Example: '2024-01-01' },
      { Field: 'monthly_usage', Description: 'Monthly usage rate', Required: 'Yes', Example: '100' },
      { Field: 'produced_quantity', Description: 'Current produced quantity', Required: 'Yes', Example: '500' },
      { Field: 'max_capacity', Description: 'Maximum production capacity', Required: 'Yes', Example: '1000' }
    ];
    const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = 'capacity-system-template.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate template'
    });
  }
});

// GET /api/export/statistics - Export statistics as JSON
router.get('/statistics', async (req, res) => {
  try {
    const stats = await gaugeRepo.getStatistics();
    const gauges = await gaugeRepo.findAll();
    
    const detailedStats = {
      ...stats,
      export_date: new Date().toISOString(),
      gauges_by_type: gauges.reduce((acc, gauge) => {
        acc[gauge.gauge_type] = (acc[gauge.gauge_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      average_capacity_utilization: gauges.length > 0 
        ? Math.round((gauges.reduce((sum, g) => sum + g.capacity_utilization, 0) / gauges.length) * 100) / 100
        : 0
    };

    res.json({
      success: true,
      data: detailedStats
    });

  } catch (error) {
    console.error('Error exporting statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export statistics'
    });
  }
});

export default router;