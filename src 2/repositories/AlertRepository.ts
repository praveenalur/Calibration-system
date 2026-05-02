import { Alert, IAlert } from '../models/Alert';

export class AlertRepository {
  
  async create(alertData: Partial<IAlert>): Promise<IAlert> {
    const alert = new Alert(alertData);
    return await alert.save();
  }

  async findAll(): Promise<IAlert[]> {
    return await Alert.find().sort({ created_at: -1 });
  }

  async findActive(): Promise<IAlert[]> {
    return await Alert.find({ acknowledged_at: { $exists: false } }).sort({ created_at: -1 });
  }

  async findByGaugeId(gaugeId: string): Promise<IAlert[]> {
    return await Alert.find({ gauge_id: gaugeId }).sort({ created_at: -1 });
  }

  async findBySeverity(severity: string): Promise<IAlert[]> {
    return await Alert.find({ severity }).sort({ created_at: -1 });
  }

  async acknowledge(alertId: string, acknowledgedBy: string): Promise<IAlert | null> {
    return await Alert.findOneAndUpdate(
      { alert_id: alertId },
      { 
        $set: { 
          acknowledged_at: new Date(),
          acknowledged_by: acknowledgedBy
        }
      },
      { new: true }
    );
  }

  async deleteByGaugeId(gaugeId: string): Promise<number> {
    const result = await Alert.deleteMany({ gauge_id: gaugeId });
    return result.deletedCount || 0;
  }

  async deleteAll(): Promise<number> {
    const result = await Alert.deleteMany({});
    return result.deletedCount || 0;
  }

  async getAlertCounts(): Promise<{
    total: number;
    active: number;
    critical: number;
    warning: number;
    info: number;
  }> {
    const [total, active, critical, warning, info] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ acknowledged_at: { $exists: false } }),
      Alert.countDocuments({ severity: 'critical' }),
      Alert.countDocuments({ severity: 'warning' }),
      Alert.countDocuments({ severity: 'info' })
    ]);

    return {
      total,
      active,
      critical,
      warning,
      info
    };
  }
}