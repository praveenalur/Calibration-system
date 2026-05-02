import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface AuditEntry {
  audit_id: string;
  gauge_id: string;
  action: string;
  old_values?: any;
  new_values?: any;
  user_id?: string;
  timestamp: string;
}

const Audit: React.FC = () => {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterGaugeId, setFilterGaugeId] = useState('');

  useEffect(() => {
    fetchAuditEntries();
  }, [page, filterGaugeId]);

  const fetchAuditEntries = async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      
      if (filterGaugeId) {
        params.append('gauge_id', filterGaugeId);
      }

      const response = await axios.get(`/api/audit?${params}`);
      setAuditEntries(response.data.data);
      setTotalPages(Math.ceil(response.data.total / 20));
    } catch (error) {
      console.error('Failed to fetch audit entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterGaugeId(e.target.value);
    setPage(1);
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'bg-green-100 text-green-800';
      case 'update': return 'bg-blue-100 text-blue-800';
      case 'delete': return 'bg-red-100 text-red-800';
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
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          
          {/* Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Filter by Gauge ID:</label>
            <input
              type="text"
              placeholder="Enter gauge ID"
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              value={filterGaugeId}
              onChange={handleFilterChange}
            />
          </div>
        </div>

        {/* Audit Entries */}
        <div className="space-y-4">
          {auditEntries.map((entry) => (
            <div key={entry.audit_id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${getActionColor(entry.action)}`}>
                    {entry.action.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    Gauge: {entry.gauge_id}
                  </span>
                  {entry.user_id && (
                    <span className="text-sm text-gray-500">
                      User: {entry.user_id}
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>

              {/* Changes */}
              {(entry.old_values || entry.new_values) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entry.old_values && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Old Values:</h4>
                      <pre className="text-xs bg-red-50 border border-red-200 rounded p-2 overflow-x-auto">
                        {formatValue(entry.old_values)}
                      </pre>
                    </div>
                  )}
                  {entry.new_values && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">New Values:</h4>
                      <pre className="text-xs bg-green-50 border border-green-200 rounded p-2 overflow-x-auto">
                        {formatValue(entry.new_values)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {auditEntries.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No audit entries found</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-700">
              Page {page} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Audit;