import { Gauge, IGauge } from '../models/Gauge';

export class GaugeRepository {
  
  async create(gaugeData: Partial<IGauge>): Promise<IGauge> {
    const gauge = new Gauge(gaugeData);
    return await gauge.save();
  }

  async findAll(): Promise<IGauge[]> {
    return await Gauge.find().sort({ created_at: -1 });
  }

  async findById(gaugeId: string): Promise<IGauge | null> {
    return await Gauge.findOne({ gauge_id: gaugeId });
  }

  async findByType(gaugeType: string): Promise<IGauge[]> {
    return await Gauge.find({ gauge_type: gaugeType }).sort({ created_at: -1 });
  }

  async findByStatus(status: string): Promise<IGauge[]> {
    return await Gauge.find({ status }).sort({ created_at: -1 });
  }

  async update(gaugeId: string, updateData: Partial<IGauge>): Promise<IGauge | null> {
    return await Gauge.findOneAndUpdate(
      { gauge_id: gaugeId },
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  async delete(gaugeId: string): Promise<boolean> {
    const result = await Gauge.deleteOne({ gauge_id: gaugeId });
    return result.deletedCount > 0;
  }

  async deleteAll(): Promise<number> {
    const result = await Gauge.deleteMany({});
    return result.deletedCount || 0;
  }

  async search(query: string): Promise<IGauge[]> {
    const searchRegex = new RegExp(query, 'i');
    return await Gauge.find({
      $or: [
        { gauge_id: searchRegex },
        { gauge_type: searchRegex }
      ]
    }).sort({ created_at: -1 });
  }

  async getStatistics(): Promise<{
    total: number;
    safe: number;
    near_limit: number;
    calibration_required: number;
    overdue: number;
  }> {
    const [total, safe, nearLimit, calibrationRequired, overdue] = await Promise.all([
      Gauge.countDocuments(),
      Gauge.countDocuments({ status: 'safe' }),
      Gauge.countDocuments({ status: 'near_limit' }),
      Gauge.countDocuments({ status: 'calibration_required' }),
      Gauge.countDocuments({ status: 'overdue' })
    ]);

    return {
      total,
      safe,
      near_limit: nearLimit,
      calibration_required: calibrationRequired,
      overdue
    };
  }
}