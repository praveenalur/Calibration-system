import { Router, Request, Response } from 'express';
import { Database } from '../database/Database';
import { CapacityManager } from '../services/CapacityManager';
import { AlertManager } from '../services/AlertManager';
import { ExcelProcessor } from '../services/ExcelProcessor';
import { WebSocketManager } from '../services/WebSocketManager';
import { GaugeProfile } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Middleware to inject dependencies
interface RequestWithDeps extends Request {
  db?: Database;
  wsManager?: WebSocketManager;
}

/**
 * GET /api/gauges - Get all gauge profiles with enriched data
 */
router.get('/', async (req: RequestWithDeps, res: Response) => {
  try {
    const db = req.db!;
    const profiles = await db.getAllGaugeProfiles();
    const thresholds = await db.getCapacityThresholds();
    
    // Enrich profiles with calculated fields
    const enrichedProfiles = profiles.map(profile => 
      CapacityManager.enrichGaugeProfile(profile, thresholds)
    );

    // Apply filters if provided
    let filteredProfiles = enrichedProfiles;
    
    if (req.query.status) {
      const statusFilter = req.query.status as string;
      filteredProfiles = filteredProfiles.filter(p => p.status === statusFilter);
    }
    
    if (req.query.gauge_type) {
      const typeFilter = req.query.gauge_type as string;
      filteredProfiles = filteredProfiles.filter(p => 
        p.gauge_type.toLowerCase().includes(typeFilter.toLowerCase())
      );
    }
    
    if (req.query.search) {
      const searchTerm = (req.query.search as string).toLowerCase();
      filteredProfiles = filteredProfiles.filter(p => 
        p.gauge_id.toLowerCase().includes(searchTerm) ||
        p.gauge_type.toLowerCase().includes(searchTerm) ||
        p.last_modified_by.toLowerCase().includes(searchTerm)
      );
    }

    // Apply sorting
    const sortBy = req.query.sort_by as string || 'gauge_id';
    const sortOrder = req.query.sort_order as string || 'asc';
    
    filteredProfiles.sort((a, b) => {
      let aVal = (a as any)[sortBy];
      let bVal = (b as any)[sortBy];
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (sortOrder === 'desc') {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      } else {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
    });

    // Apply pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    
    const paginatedProfiles = filteredProfiles.slice(offset, offset + limit);

    res.json({
      success: true,
      data: paginatedProfiles,
      pagination: {
        page,
        limit,
        total: filteredProfiles.length,
        pages: Math.ceil(filteredProfiles.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching gauge profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gauge profiles',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/gauges/:id - Get specific gauge profile
 */
router.get('/:id', async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    const db = req.db!;
    const gaugeId = req.params.id;
    
    const profile = await db.getGaugeProfileById(gaugeId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Gauge profile not found'
      });
    }

    const thresholds = await db.getCapacityThresholds();
    const enrichedProfile = CapacityManager.enrichGaugeProfile(profile, thresholds);

    res.json({
      success: true,
      data: enrichedProfile
    });
  } catch (error) {
    console.error('Error fetching gauge profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gauge profile',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/gauges - Create new gauge profile
 */
router.post('/', async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    const db = req.db!;
    const wsManager = req.wsManager!;
    
    // Validate input data
    const validation = ExcelProcessor.validateGaugeProfile(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Check if gauge ID already exists
    const existingProfile = await db.getGaugeProfileById(req.body.gauge_id);
    if (existingProfile) {
      return res.status(409).json({
        success: false,
        error: 'Gauge ID already exists'
      });
    }

    // Create new profile
    const now = new Date().toISOString();
    const newProfile: GaugeProfile = {
      id: uuidv4(),
      gauge_id: req.body.gauge_id.trim(),
      gauge_type: req.body.gauge_type.trim(),
      calibration_frequency: req.body.calibration_frequency,
      last_calibration_date: req.body.last_calibration_date,
      monthly_usage: req.body.monthly_usage,
      produced_quantity: req.body.produced_quantity,
      max_capacity: req.body.max_capacity,
      last_modified_by: req.body.last_modified_by?.trim() || 'API User',
      created_at: now,
      updated_at: now
    };

    await db.createGaugeProfile(newProfile);

    // Create audit entry
    await db.createAuditEntry({
      id: uuidv4(),
      gauge_id: newProfile.gauge_id,
      action: 'create',
      new_values: newProfile,
      user: newProfile.last_modified_by,
      timestamp: now
    });

    // Generate alerts for new gauge
    const thresholds = await db.getCapacityThresholds();
    const alerts = AlertManager.generateAlertsForGauge(newProfile, thresholds);
    
    for (const alert of alerts) {
      await db.createAlert(alert);
      wsManager.broadcastAlertCreated(alert);
    }

    // Enrich profile for response
    const enrichedProfile = CapacityManager.enrichGaugeProfile(newProfile, thresholds);

    // Broadcast gauge creation
    wsManager.broadcastGaugeCreated(enrichedProfile);

    res.status(201).json({
      success: true,
      data: enrichedProfile,
      message: 'Gauge profile created successfully'
    });
  } catch (error) {
    console.error('Error creating gauge profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create gauge profile',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/gauges/:id - Update gauge profile
 */
router.put('/:id', async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    const db = req.db!;
    const wsManager = req.wsManager!;
    const gaugeId = req.params.id;
    
    // Get existing profile
    const existingProfile = await db.getGaugeProfileById(gaugeId);
    if (!existingProfile) {
      return res.status(404).json({
        success: false,
        error: 'Gauge profile not found'
      });
    }

    // Validate update data
    const updateData = { ...req.body };
    delete updateData.id; // Don't allow ID changes
    delete updateData.gauge_id; // Don't allow gauge_id changes
    delete updateData.created_at; // Don't allow created_at changes

    const validation = ExcelProcessor.validateGaugeProfile({ ...existingProfile, ...updateData });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Update profile
    const now = new Date().toISOString();
    updateData.updated_at = now;
    updateData.last_modified_by = updateData.last_modified_by?.trim() || 'API User';

    await db.updateGaugeProfile(gaugeId, updateData);

    // Get updated profile
    const updatedProfile = await db.getGaugeProfileById(gaugeId);
    if (!updatedProfile) {
      throw new Error('Failed to retrieve updated profile');
    }

    // Create audit entry
    await db.createAuditEntry({
      id: uuidv4(),
      gauge_id: gaugeId,
      action: 'update',
      old_values: existingProfile,
      new_values: updatedProfile,
      user: updateData.last_modified_by,
      timestamp: now
    });

    // Process alerts for updated gauge
    const thresholds = await db.getCapacityThresholds();
    const alerts = AlertManager.processGaugeUpdate(existingProfile, updatedProfile, thresholds);
    
    for (const alert of alerts) {
      await db.createAlert(alert);
      wsManager.broadcastAlertCreated(alert);
    }

    // Enrich profile for response
    const enrichedProfile = CapacityManager.enrichGaugeProfile(updatedProfile, thresholds);

    // Broadcast gauge update
    wsManager.broadcastGaugeUpdated(enrichedProfile, updateData);

    res.json({
      success: true,
      data: enrichedProfile,
      message: 'Gauge profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating gauge profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update gauge profile',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/gauges/:id - Delete gauge profile
 */
router.delete('/:id', async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    const db = req.db!;
    const wsManager = req.wsManager!;
    const gaugeId = req.params.id;
    
    // Get existing profile for audit
    const existingProfile = await db.getGaugeProfileById(gaugeId);
    if (!existingProfile) {
      return res.status(404).json({
        success: false,
        error: 'Gauge profile not found'
      });
    }

    // Delete the profile
    await db.deleteGaugeProfile(gaugeId);

    // Create audit entry
    const now = new Date().toISOString();
    await db.createAuditEntry({
      id: uuidv4(),
      gauge_id: gaugeId,
      action: 'delete',
      old_values: existingProfile,
      user: req.body.deleted_by || 'API User',
      timestamp: now
    });

    // Broadcast gauge deletion
    wsManager.broadcastGaugeDeleted(gaugeId);

    res.json({
      success: true,
      message: 'Gauge profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting gauge profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete gauge profile',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/gauges/:id/alerts - Get alerts for specific gauge
 */
router.get('/:id/alerts', async (req: RequestWithDeps, res: Response) => {
  try {
    const db = req.db!;
    const gaugeId = req.params.id;
    
    const allAlerts = await db.getAllAlerts();
    const gaugeAlerts = allAlerts.filter(alert => alert.gauge_id === gaugeId);
    
    // Apply filters
    let filteredAlerts = gaugeAlerts;
    
    if (req.query.acknowledged !== undefined) {
      const acknowledgedFilter = req.query.acknowledged === 'true';
      filteredAlerts = filteredAlerts.filter(alert => alert.acknowledged === acknowledgedFilter);
    }
    
    if (req.query.severity) {
      const severityFilter = req.query.severity as string;
      filteredAlerts = filteredAlerts.filter(alert => alert.severity === severityFilter);
    }

    // Sort by creation date (newest first)
    filteredAlerts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      success: true,
      data: filteredAlerts
    });
  } catch (error) {
    console.error('Error fetching gauge alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gauge alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/gauges/:id/recalculate - Force recalculation of gauge status and alerts
 */
router.post('/:id/recalculate', async (req: RequestWithDeps, res: Response): Promise<Response | void> => {
  try {
    const db = req.db!;
    const wsManager = req.wsManager!;
    const gaugeId = req.params.id;
    
    const profile = await db.getGaugeProfileById(gaugeId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Gauge profile not found'
      });
    }

    const thresholds = await db.getCapacityThresholds();
    
    // Generate new alerts
    const alerts = AlertManager.generateAlertsForGauge(profile, thresholds);
    
    for (const alert of alerts) {
      await db.createAlert(alert);
      wsManager.broadcastAlertCreated(alert);
    }

    // Enrich profile
    const enrichedProfile = CapacityManager.enrichGaugeProfile(profile, thresholds);

    // Broadcast update
    wsManager.broadcastGaugeUpdated(enrichedProfile);

    res.json({
      success: true,
      data: enrichedProfile,
      alerts: alerts,
      message: 'Gauge recalculated successfully'
    });
  } catch (error) {
    console.error('Error recalculating gauge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recalculate gauge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/gauges/stats/summary - Get gauge statistics summary
 */
router.get('/stats/summary', async (req: RequestWithDeps, res: Response) => {
  try {
    const db = req.db!;
    const profiles = await db.getAllGaugeProfiles();
    const thresholds = await db.getCapacityThresholds();
    
    // Calculate statistics
    const stats = {
      total_gauges: profiles.length,
      safe_count: 0,
      near_limit_count: 0,
      calibration_required_count: 0,
      overdue_count: 0,
      average_capacity_usage: 0,
      total_capacity: 0,
      total_produced: 0
    };

    let totalCapacityUsage = 0;

    profiles.forEach(profile => {
      const enriched = CapacityManager.enrichGaugeProfile(profile, thresholds);
      
      switch (enriched.status) {
        case 'safe':
          stats.safe_count++;
          break;
        case 'near_limit':
          stats.near_limit_count++;
          break;
        case 'calibration_required':
          stats.calibration_required_count++;
          break;
        case 'overdue':
          stats.overdue_count++;
          break;
      }

      stats.total_capacity += profile.max_capacity;
      stats.total_produced += profile.produced_quantity;
      totalCapacityUsage += (profile.produced_quantity / profile.max_capacity) * 100;
    });

    stats.average_capacity_usage = profiles.length > 0 ? totalCapacityUsage / profiles.length : 0;

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching gauge statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gauge statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;