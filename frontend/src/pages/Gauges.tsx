import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';

interface Gauge {
  gauge_id: string;
  description: string;
  location: string;
  capacity: number;
  current_level: number;
  unit: string;
  status: 'safe' | 'near_limit' | 'calibration_required' | 'overdue';
  last_calibration_date: string;
  next_calibration_date: string;
  calibration_interval_months: number;
  created_at: string;
  updated_at: string;
}

const Gauges: React.FC = () => {
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGauge, setEditingGauge] = useState<Gauge | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const { socket } = useWebSocket();
  const { user } = useAuth();

  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  useEffect(() => {
    fetchGauges();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('gauge_created', fetchGauges);
      socket.on('gauge_updated', fetchGauges);
      socket.on('gauge_deleted', fetchGauges);
      
      return () => {
        socket.off('gauge_created', fetchGauges);
        socket.off('gauge_updated', fetchGauges);
        socket.off('gauge_deleted', fetchGauges);
      };
    }
  }, [socket]);

  const fetchGauges = async () => {
    try {
      const response = await axios.get('/api/gauges');
      setGauges(response.data.data);
    } catch (error) {
      console.error('Failed to fetch gauges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGauge = async (gaugeData: Partial<Gauge>) => {
    try {
      if (editingGauge) {
        await axios.put(`/api/gauges/${editingGauge.gauge_id}`, gaugeData);
      } else {
        await axios.post('/api/gauges', gaugeData);
      }
      setEditingGauge(null);
      setShowAddForm(false);
      fetchGauges();
    } catch (error) {
      console.error('Failed to save gauge:', error);
    }
  };

  const handleDeleteGauge = async (gaugeId: string) => {
    if (window.confirm('Are you sure you want to delete this gauge?')) {
      try {
        await axios.delete(`/api/gauges/${gaugeId}`);
        fetchGauges();
      } catch (error) {
        console.error('Failed to delete gauge:', error);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe': return 'bg-green-100 text-green-800';
      case 'near_limit': return 'bg-yellow-100 text-yellow-800';
      case 'calibration_required': return 'bg-orange-100 text-orange-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Gauges</h1>
          {canEdit && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Add Gauge
            </button>
          )}
        </div>

        {/* Gauges Table */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {gauges.map((gauge) => (
              <li key={gauge.gauge_id}>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {gauge.gauge_id}
                        </p>
                        <p className="text-sm text-gray-500">{gauge.description}</p>
                        <p className="text-sm text-gray-500">{gauge.location}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">
                          {gauge.current_level} / {gauge.capacity} {gauge.unit}
                        </p>
                        <p className="text-sm text-gray-500">
                          {Math.round((gauge.current_level / gauge.capacity) * 100)}% capacity
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(gauge.status)}`}>
                        {gauge.status.replace('_', ' ')}
                      </span>
                      <div className="text-sm text-gray-500">
                        Next calibration: {new Date(gauge.next_calibration_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="ml-4 flex space-x-2">
                      <button
                        onClick={() => setEditingGauge(gauge)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteGauge(gauge.gauge_id)}
                        className="text-red-600 hover:text-red-900 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {gauges.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No gauges found</p>
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {(showAddForm || editingGauge) && (
        <GaugeForm
          gauge={editingGauge}
          onSave={handleSaveGauge}
          onCancel={() => {
            setShowAddForm(false);
            setEditingGauge(null);
          }}
        />
      )}
    </div>
  );
};

// Gauge Form Component
interface GaugeFormProps {
  gauge: Gauge | null;
  onSave: (data: Partial<Gauge>) => void;
  onCancel: () => void;
}

const GaugeForm: React.FC<GaugeFormProps> = ({ gauge, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    gauge_id: gauge?.gauge_id || '',
    description: gauge?.description || '',
    location: gauge?.location || '',
    capacity: gauge?.capacity || 0,
    current_level: gauge?.current_level || 0,
    unit: gauge?.unit || '',
    calibration_interval_months: gauge?.calibration_interval_months || 12,
    last_calibration_date: gauge?.last_calibration_date?.split('T')[0] || new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {gauge ? 'Edit Gauge' : 'Add New Gauge'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Gauge ID</label>
            <input
              type="text"
              required
              disabled={!!gauge}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={formData.gauge_id}
              onChange={(e) => setFormData({...formData, gauge_id: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Capacity</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={formData.capacity}
                onChange={(e) => setFormData({...formData, capacity: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Current Level</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={formData.current_level}
                onChange={(e) => setFormData({...formData, current_level: parseFloat(e.target.value)})}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Unit</label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={formData.unit}
              onChange={(e) => setFormData({...formData, unit: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Calibration Interval (months)</label>
            <input
              type="number"
              required
              min="1"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={formData.calibration_interval_months}
              onChange={(e) => setFormData({...formData, calibration_interval_months: parseInt(e.target.value)})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Last Calibration Date</label>
            <input
              type="date"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={formData.last_calibration_date}
              onChange={(e) => setFormData({...formData, last_calibration_date: e.target.value})}
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {gauge ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Gauges;