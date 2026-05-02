import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useWebSocket } from '../contexts/WebSocketContext';

interface DashboardStats {
  total_gauges: number;
  safe_count: number;
  near_limit_count: number;
  calibration_required_count: number;
  overdue_count: number;
  recent_alerts: any[];
  upcoming_calibrations: any[];
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useWebSocket();

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('gauge_updated', fetchDashboardStats);
      socket.on('alert_created', fetchDashboardStats);
      
      return () => {
        socket.off('gauge_updated', fetchDashboardStats);
        socket.off('alert_created', fetchDashboardStats);
      };
    }
  }, [socket]);

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get('/api/dashboard/stats');
      setStats(response.data.data);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Failed to load dashboard data</p>
      </div>
    );
  }

  const statusCards = [
    { title: 'Total Gauges', value: stats.total_gauges, color: 'bg-blue-500' },
    { title: 'Safe', value: stats.safe_count, color: 'bg-green-500' },
    { title: 'Near Limit', value: stats.near_limit_count, color: 'bg-yellow-500' },
    { title: 'Calibration Required', value: stats.calibration_required_count, color: 'bg-orange-500' },
    { title: 'Overdue', value: stats.overdue_count, color: 'bg-red-500' },
  ];

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          {statusCards.map((card, index) => (
            <div key={index} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 ${card.color} rounded-md flex items-center justify-center`}>
                      <span className="text-white font-bold text-sm">{card.value}</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">{card.title}</dt>
                      <dd className="text-lg font-medium text-gray-900">{card.value}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Alerts</h3>
              {stats.recent_alerts.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_alerts.slice(0, 5).map((alert, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{alert.gauge_id}</p>
                        <p className="text-sm text-gray-500">{alert.message}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        alert.severity === 'high' ? 'bg-red-100 text-red-800' :
                        alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {alert.severity}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No recent alerts</p>
              )}
            </div>
          </div>

          {/* Upcoming Calibrations */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Upcoming Calibrations</h3>
              {stats.upcoming_calibrations.length > 0 ? (
                <div className="space-y-3">
                  {stats.upcoming_calibrations.slice(0, 5).map((gauge, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{gauge.gauge_id}</p>
                        <p className="text-sm text-gray-500">{gauge.description}</p>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(gauge.next_calibration_date).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No upcoming calibrations</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;