import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';

interface Alert {
  alert_id: string;
  gauge_id: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  status: 'active' | 'resolved';
  created_at: string;
  resolved_at?: string;
}

const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const { socket } = useWebSocket();
  const { user } = useAuth();

  const canResolve = user?.role === 'admin' || user?.role === 'operator';

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  useEffect(() => {
    if (socket) {
      socket.on('alert_created', fetchAlerts);
      
      return () => {
        socket.off('alert_created', fetchAlerts);
      };
    }
  }, [socket]);

  const fetchAlerts = async () => {
    try {
      const endpoint = filter === 'active' ? '/api/alerts/active' : '/api/alerts';
      const response = await axios.get(endpoint);
      let alertsData = response.data.data;
      
      if (filter === 'resolved') {
        alertsData = alertsData.filter((alert: Alert) => alert.status === 'resolved');
      }
      
      setAlerts(alertsData);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await axios.put(`/api/alerts/${alertId}/resolve`);
      fetchAlerts();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'active' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-gray-100 text-gray-800';
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
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          
          {/* Filter Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                filter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                filter === 'active' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                filter === 'resolved' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.alert_id}
              className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      Gauge: {alert.gauge_id}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(alert.status)}`}>
                      {alert.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
                  <div className="text-xs text-gray-500">
                    <p>Created: {new Date(alert.created_at).toLocaleString()}</p>
                    {alert.resolved_at && (
                      <p>Resolved: {new Date(alert.resolved_at).toLocaleString()}</p>
                    )}
                  </div>
                </div>
                
                {canResolve && alert.status === 'active' && (
                  <button
                    onClick={() => handleResolveAlert(alert.alert_id)}
                    className="ml-4 px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {alerts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {filter === 'active' ? 'No active alerts' : 
               filter === 'resolved' ? 'No resolved alerts' : 'No alerts found'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Alerts;