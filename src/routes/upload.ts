import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Database } from '../database/Database';
import { ExcelProcessor } from '../services/ExcelProcessor';
import { CapacityManager } from '../services/CapacityManager';
import { AlertManager } from '../services/AlertManager';
import { WebSocketManager } from '../services/WebSocketManager';
import { GaugeProfile } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv'
    ];
    
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls') || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.'));
    }
  }
});

interface RequestWithDeps extends Request {
  db?: Database;
  wsManager?: WebSocketManager;
}

/**
 * POST /api/upload/validate - Validate Excel file without importing
 */
router.post('/validate', upload.single('file'), async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const validation = ExcelProcessor.validateExcelFile(req.file.buffer);
    
    if (validation.valid) {
      // If valid, also parse to get preview data
      const parseResult = ExcelProcessor.parseExcelData(req.file.buffer);
      
      res.json({
        success: true,
        valid: true,
        message: 'File is valid for import',
        preview: {
          total_rows: parseResult.profiles.length,
          sample_data: parseResult.profiles.slice(0, 5), // First 5 rows as preview
          parse_errors: parseResult.errors
        }
      });
    } else {
      res.json({
        success: true,
        valid: false,
        errors: validation.errors
      });
    }
  } catch (error) {
    console.error('Error validating file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/upload/import - Import Excel file data
 */
router.post('/import', upload.single('file'), async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    const db = req.db!;
    const wsManager = req.wsManager!;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Validate file first
    const validation = ExcelProcessor.validateExcelFile(req.file.buffer);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'File validation failed',
        details: validation.errors
      });
    }

    // Parse Excel data
    const parseResult = ExcelProcessor.parseExcelData(req.file.buffer);
    
    if (parseResult.errors.length > 0 && parseResult.profiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to parse any valid data from file',
        details: parseResult.errors
      });
    }

    // Process import options
    const replaceExisting = req.body.replace_existing === 'true' || req.body.replace_existing === true;
    const skipDuplicates = req.body.skip_duplicates === 'true' || req.body.skip_duplicates === true;
    
    // Import statistics
    const importStats = {
      total_rows: parseResult.profiles.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [...parseResult.errors]
    };

    const now = new Date().toISOString();
    const importUser = req.body.imported_by || 'Excel Import';
    const thresholds = await db.getCapacityThresholds();

    // Process each profile
    for (let i = 0; i < parseResult.profiles.length; i++) {
      const profile = parseResult.profiles[i];
      
      try {
        // Check if gauge already exists
        const existingProfile = await db.getGaugeProfileById(profile.gauge_id);
        
        if (existingProfile) {
          if (replaceExisting) {
            // Update existing profile
            const updateData = {
              gauge_type: profile.gauge_type,
              calibration_frequency: profile.calibration_frequency,
              last_calibration_date: profile.last_calibration_date,
              monthly_usage: profile.monthly_usage,
              produced_quantity: profile.produced_quantity,
              max_capacity: profile.max_capacity,
              last_modified_by: importUser,
              updated_at: now
            };

            await db.updateGaugeProfile(profile.gauge_id, updateData);

            // Create audit entry
            await db.createAuditEntry({
              id: uuidv4(),
              gauge_id: profile.gauge_id,
              action: 'update',
              old_values: existingProfile,
              new_values: { ...existingProfile, ...updateData },
              user: importUser,
              timestamp: now
            });

            // Get updated profile and generate alerts
            const updatedProfile = await db.getGaugeProfileById(profile.gauge_id);
            if (updatedProfile) {
              const alerts = AlertManager.processGaugeUpdate(existingProfile, updatedProfile, thresholds);
              
              for (const alert of alerts) {
                await db.createAlert(alert);
                wsManager.broadcastAlertCreated(alert);
              }

              const enrichedProfile = CapacityManager.enrichGaugeProfile(updatedProfile, thresholds);
              wsManager.broadcastGaugeUpdated(enrichedProfile, updateData);
            }

            importStats.updated++;
          } else if (skipDuplicates) {
            importStats.skipped++;
          } else {
            importStats.errors.push(`Row ${i + 2}: Gauge ID '${profile.gauge_id}' already exists`);
          }
        } else {
          // Create new profile
          profile.last_modified_by = importUser;
          profile.created_at = now;
          profile.updated_at = now;

          await db.createGaugeProfile(profile);

          // Create audit entry
          await db.createAuditEntry({
            id: uuidv4(),
            gauge_id: profile.gauge_id,
            action: 'create',
            new_values: profile,
            user: importUser,
            timestamp: now
          });

          // Generate alerts for new gauge
          const alerts = AlertManager.generateAlertsForGauge(profile, thresholds);
          
          for (const alert of alerts) {
            await db.createAlert(alert);
            wsManager.broadcastAlertCreated(alert);
          }

          const enrichedProfile = CapacityManager.enrichGaugeProfile(profile, thresholds);
          wsManager.broadcastGaugeCreated(enrichedProfile);

          importStats.inserted++;
        }
      } catch (error) {
        importStats.errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Broadcast dashboard update
    const allProfiles = await db.getAllGaugeProfiles();
    const allAlerts = await db.getAllAlerts();
    const recentAlerts = allAlerts
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    const dashboardStats = {
      total_gauges: allProfiles.length,
      safe_count: 0,
      near_limit_count: 0,
      calibration_required_count: 0,
      overdue_count: 0,
      recent_alerts: recentAlerts
    };

    allProfiles.forEach(profile => {
      const enriched = CapacityManager.enrichGaugeProfile(profile, thresholds);
      switch (enriched.status) {
        case 'safe': dashboardStats.safe_count++; break;
        case 'near_limit': dashboardStats.near_limit_count++; break;
        case 'calibration_required': dashboardStats.calibration_required_count++; break;
        case 'overdue': dashboardStats.overdue_count++; break;
      }
    });

    wsManager.broadcastDashboardUpdated(dashboardStats);

    res.json({
      success: true,
      message: 'File imported successfully',
      data: importStats,
      file_info: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error importing file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/upload/template - Download Excel template
 */
router.get('/template', (req: Request, res: Response) => {
  try {
    const templateBuffer = ExcelProcessor.generateTemplate();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="gauge-import-template.xlsx"');
    res.setHeader('Content-Length', templateBuffer.length);
    
    res.send(templateBuffer);
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate template',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/upload/bulk-update - Bulk update gauge data from Excel
 */
router.post('/bulk-update', upload.single('file'), async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    const db = req.db!;
    const wsManager = req.wsManager!;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Parse Excel data
    const parseResult = ExcelProcessor.parseExcelData(req.file.buffer);
    
    if (parseResult.errors.length > 0 && parseResult.profiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to parse any valid data from file',
        details: parseResult.errors
      });
    }

    const updateStats = {
      total_rows: parseResult.profiles.length,
      updated: 0,
      not_found: 0,
      errors: [...parseResult.errors]
    };

    const now = new Date().toISOString();
    const updateUser = req.body.updated_by || 'Bulk Update';
    const thresholds = await db.getCapacityThresholds();

    // Process each profile for update only
    for (let i = 0; i < parseResult.profiles.length; i++) {
      const profile = parseResult.profiles[i];
      
      try {
        const existingProfile = await db.getGaugeProfileById(profile.gauge_id);
        
        if (existingProfile) {
          // Update only specified fields
          const fieldsToUpdate = req.body.fields ? req.body.fields.split(',') : [
            'gauge_type', 'calibration_frequency', 'last_calibration_date',
            'monthly_usage', 'produced_quantity', 'max_capacity'
          ];

          const updateData: any = {
            last_modified_by: updateUser,
            updated_at: now
          };

          fieldsToUpdate.forEach((field: string) => {
            if (field in profile) {
              updateData[field] = (profile as any)[field];
            }
          });

          await db.updateGaugeProfile(profile.gauge_id, updateData);

          // Create audit entry
          await db.createAuditEntry({
            id: uuidv4(),
            gauge_id: profile.gauge_id,
            action: 'update',
            old_values: existingProfile,
            new_values: { ...existingProfile, ...updateData },
            user: updateUser,
            timestamp: now
          });

          // Get updated profile and generate alerts
          const updatedProfile = await db.getGaugeProfileById(profile.gauge_id);
          if (updatedProfile) {
            const alerts = AlertManager.processGaugeUpdate(existingProfile, updatedProfile, thresholds);
            
            for (const alert of alerts) {
              await db.createAlert(alert);
              wsManager.broadcastAlertCreated(alert);
            }

            const enrichedProfile = CapacityManager.enrichGaugeProfile(updatedProfile, thresholds);
            wsManager.broadcastGaugeUpdated(enrichedProfile, updateData);
          }

          updateStats.updated++;
        } else {
          updateStats.not_found++;
          updateStats.errors.push(`Row ${i + 2}: Gauge ID '${profile.gauge_id}' not found`);
        }
      } catch (error) {
        updateStats.errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      message: 'Bulk update completed',
      data: updateStats,
      file_info: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error performing bulk update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform bulk update',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/upload/history - Get upload history (if implemented)
 */
router.get('/history', async (req: RequestWithDeps, res: Response) => {
  try {
    const db = req.db!;
    
    // Get audit entries for import operations
    const auditEntries = await db.getAllAuditEntries();
    const importEntries = auditEntries.filter(entry => 
      entry.user.includes('Import') || entry.user.includes('Bulk')
    );

    // Group by timestamp/user to identify import sessions
    const importSessions: any[] = [];
    const sessionMap = new Map();

    importEntries.forEach(entry => {
      const sessionKey = `${entry.user}_${entry.timestamp.split('T')[0]}`;
      
      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          id: sessionKey,
          user: entry.user,
          date: entry.timestamp.split('T')[0],
          operations: [],
          total_operations: 0
        });
        importSessions.push(sessionMap.get(sessionKey));
      }

      const session = sessionMap.get(sessionKey);
      session.operations.push(entry);
      session.total_operations++;
    });

    // Sort by date (newest first)
    importSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      success: true,
      data: importSessions.slice(0, 50) // Last 50 import sessions
    });
  } catch (error) {
    console.error('Error fetching upload history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upload history',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;