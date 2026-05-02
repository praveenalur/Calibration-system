import { AuditLog, IAuditLog } from '../models/AuditLog';

export class AuditRepository {
  
  async create(auditData: Partial<IAuditLog>): Promise<IAuditLog> {
    const auditEntry = new AuditLog(auditData);
    return await auditEntry.save();
  }

  async findAll(limit: number = 100): Promise<IAuditLog[]> {
    return await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  async findByGaugeId(gaugeId: string, limit: number = 50): Promise<IAuditLog[]> {
    return await AuditLog.find({ gauge_id: gaugeId })
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  async findByUserId(userId: string, limit: number = 50): Promise<IAuditLog[]> {
    return await AuditLog.find({ user_id: userId })
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  async findByAction(action: string, limit: number = 50): Promise<IAuditLog[]> {
    return await AuditLog.find({ action })
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<IAuditLog[]> {
    return await AuditLog.find({
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ timestamp: -1 });
  }

  async deleteAll(): Promise<number> {
    const result = await AuditLog.deleteMany({});
    return result.deletedCount || 0;
  }

  async getAuditStatistics(): Promise<{
    total: number;
    creates: number;
    updates: number;
    deletes: number;
    overrides: number;
  }> {
    const [total, creates, updates, deletes, overrides] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ action: 'create' }),
      AuditLog.countDocuments({ action: 'update' }),
      AuditLog.countDocuments({ action: 'delete' }),
      AuditLog.countDocuments({ action: 'override' })
    ]);

    return {
      total,
      creates,
      updates,
      deletes,
      overrides
    };
  }
}