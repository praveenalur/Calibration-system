import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  entry_id: string;
  gauge_id: string;
  user_id: string;
  action: 'create' | 'update' | 'delete' | 'override' | 'import' | 'export';
  changes: Record<string, any>;
  previous_values: Record<string, any>;
  timestamp: Date;
  reason?: string;
}

const AuditLogSchema: Schema = new Schema({
  entry_id: {
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
  user_id: {
    type: String,
    required: true,
    trim: true
  },
  action: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'override', 'import', 'export']
  },
  changes: {
    type: Schema.Types.Mixed,
    required: true
  },
  previous_values: {
    type: Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  reason: {
    type: String,
    trim: true
  }
});

// Indexes for efficient querying
AuditLogSchema.index({ gauge_id: 1 });
AuditLogSchema.index({ user_id: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);