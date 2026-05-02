import express from 'express';
import multer from 'multer';
import { ExcelService } from '../services/ExcelService';

const router = express.Router();
const excelService = new ExcelService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv' // alternative CSV mime type
    ];
    
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed. Received: ${file.mimetype}`));
    }
  }
});

// POST /api/upload/gauges - Upload and import Excel file
router.post('/gauges', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const userId = req.body.user_id || 'system';
    const result = await excelService.importFromExcel(req.file.buffer, userId);

    res.json({
      success: result.success,
      data: result
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process file'
    });
  }
});

// POST /api/upload/validate - Validate Excel file without importing
router.post('/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // For validation, we can use the same import logic but not save to database
    // This is a simplified version - in production you might want a separate validation method
    const result = await excelService.importFromExcel(req.file.buffer, 'validator');

    res.json({
      success: true,
      data: {
        valid: result.summary.errors === 0,
        total_rows: result.summary.total_rows,
        errors: result.errors,
        message: result.summary.errors === 0 
          ? `File is valid. ${result.summary.total_rows} rows ready for import.`
          : `File has ${result.summary.errors} errors out of ${result.summary.total_rows} rows.`
      }
    });

  } catch (error) {
    console.error('Error validating file:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate file'
    });
  }
});

export default router;