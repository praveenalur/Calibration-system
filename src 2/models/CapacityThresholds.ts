import mongoose, { Schema, Document } from 'mongoose';

export interface ICapacityThresholds extends Document {
  calibration_required_threshold: number;
  near_limit_threshold: number;
  overdue_capacity_threshold: number;
  updated_at: Date;
  updated_by: string;
}

const CapacityThresholdsSchema: Schema = new Schema({
  calibration_required_threshold: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0.1 // 10%
  },
  near_limit_threshold: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0.2 // 20%
  },
  overdue_capacity_threshold: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0.0 // 0%
  },
  updated_by: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: { createdAt: false, updatedAt: 'updated_at' }
});

export const CapacityThresholds = mongoose.model<ICapacityThresholds>('CapacityThresholds', CapacityThresholdsSchema);