import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface CapacityThresholds {
  near_limit_percentage: number;
  calibration_warning_days: number;
  overdue_threshold_days: number;
}

const Settings: React.FC = () => {
  const [thresholds, setThresholds] = useState<CapacityThresholds>({
    near_limit_percentage: 80,
    calibration_warning_days: 30,
    overdue_threshold_days: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchThresholds();
  }, []);

  const fetchThresholds = async () => {
    try {
      const response = await axios.get('/api/admin/thresholds');
      setThresholds(response.data.data);
    } catch (error) {
      console.error('Failed to fetch thresholds:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await axios.put('/api/admin/thresholds', thresholds);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to save settings' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await axios.get('/api/export/gauges', {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `gauges-export-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export data:', error);
      setMessage({ type: 'error', text: 'Failed to export data' });
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="space-y-8">
          {/* Capacity Thresholds */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Capacity Thresholds
              </h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Near Limit Percentage (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={thresholds.near_limit_percentage}
                    onChange={(e) => setThresholds({
                      ...thresholds,
                      near_limit_percentage: parseInt(e.target.value)
                    })}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Gauges above this percentage will be marked as "near limit"
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calibration Warning Days
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={thresholds.calibration_warning_days}
                    onChange={(e) => setThresholds({
                      ...thresholds,
                      calibration_warning_days: parseInt(e.target.value)
                    })}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Show calibration warning this many days before due date
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Overdue Threshold Days
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={thresholds.overdue_threshold_days}
                    onChange={(e) => setThresholds({
                      ...thresholds,
                      overdue_threshold_days: parseInt(e.target.value)
                    })}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Mark gauges as overdue this many days after calibration due date (0 = immediately)
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Data Management */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Data Management
              </h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Export Data</h4>
                  <p className="text-sm text-gray-500 mb-3">
                    Export all gauge data to Excel format for backup or analysis
                  </p>
                  <button
                    onClick={handleExportData}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Export All Gauges
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* System Information */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                System Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Version:</span>
                  <span className="ml-2 font-medium">1.0.0</span>
                </div>
                <div>
                  <span className="text-gray-500">Environment:</span>
                  <span className="ml-2 font-medium">Production</span>
                </div>
                <div>
                  <span className="text-gray-500">Database:</span>
                  <span className="ml-2 font-medium">MongoDB</span>
                </div>
                <div>
                  <span className="text-gray-500">Last Updated:</span>
                  <span className="ml-2 font-medium">{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;