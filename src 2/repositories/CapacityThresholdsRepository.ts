import { CapacityThresholds, ICapacityThresholds } from '../models/CapacityThresholds';

export class CapacityThresholdsRepository {
  
  async get(): Promise<ICapacityThresholds | null> {
    // Get the first (and should be only) threshold configuration
    return await CapacityThresholds.findOne();
  }

  async createDefault(updatedBy: string = 'system'): Promise<ICapacityThresholds> {
    const defaultThresholds = new CapacityThresholds({
      calibration_required_threshold: 0.1, // 10%
      near_limit_threshold: 0.2, // 20%
      overdue_capacity_threshold: 0.0, // 0%
      updated_by: updatedBy
    });

    return await defaultThresholds.save();
  }

  async update(thresholds: Partial<ICapacityThresholds>, updatedBy: string): Promise<ICapacityThresholds> {
    const existing = await this.get();
    
    if (existing) {
      // Update existing thresholds
      return await CapacityThresholds.findByIdAndUpdate(
        existing._id,
        { 
          ...thresholds,
          updated_by: updatedBy,
          updated_at: new Date()
        },
        { new: true, runValidators: true }
      ) as ICapacityThresholds;
    } else {
      // Create new thresholds if none exist
      const newThresholds = new CapacityThresholds({
        calibration_required_threshold: thresholds.calibration_required_threshold || 0.1,
        near_limit_threshold: thresholds.near_limit_threshold || 0.2,
        overdue_capacity_threshold: thresholds.overdue_capacity_threshold || 0.0,
        updated_by: updatedBy
      });
      
      return await newThresholds.save();
    }
  }

  async getOrCreateDefault(updatedBy: string = 'system'): Promise<ICapacityThresholds> {
    const existing = await this.get();
    if (existing) {
      return existing;
    }
    return await this.createDefault(updatedBy);
  }

  async reset(updatedBy: string): Promise<ICapacityThresholds> {
    // Delete existing and create default
    await CapacityThresholds.deleteMany({});
    return await this.createDefault(updatedBy);
  }
}