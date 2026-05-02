import mongoose, { Schema, Document } from 'mongoose';

export interface IAlert extends Document {
  alert_id: string;
  gauge_id: string;
  alert_type: 'upcoming_calibration' | 'overdue_calibration' | 'capacity_exhaustion';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  created_at: Date;
  acknowledged_at?: Date;
  acknowledged_by?: string;
}

const AlertSchema: Schema = new Schema({
  alert_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  gauge_id: {
    type: String,
    required: true,
    trim: true
  },
  alert_type: {
    type: String,
    required: true,
    enum: ['upcoming_calibration', 'overdue_calibration', 'capacity_exhaustion']
  },
  severity: {
    type: String,
    required: true,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  acknowledged_at: {
    type: Date
  },
  acknowledged_by: {
    type: String,
    trim: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Indexes for efficient querying
AlertSchema.index({ gauge_id: 1 });
AlertSchema.index({ alert_type: 1 });
AlertSchema.index({ severity: 1 });
AlertSchema.index({ created_at: -1 });

export const Alert = mongoose.model<IAlert>('Alert', AlertSchema);