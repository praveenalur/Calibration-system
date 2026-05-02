import React, { useState } from 'react';
import axios from 'axios';

interface UploadResult {
  success: boolean;
  message: string;
  summary?: {
    total_rows: number;
    inserted: number;
    updated: number;
    errors: number;
  };
  errors?: string[];
}

const Upload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const name = selectedFile.name.toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
        setFile(selectedFile);
        setResult(null);
      } else {
        alert('Please select a valid Excel (.xlsx, .xls) or CSV file');
        e.target.value = '';
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/upload/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult({
        success: response.data.success,
        message: response.data.message,
        summary: response.data.data ? {
          total_rows: response.data.data.total_rows,
          inserted: response.data.data.inserted,
          updated: response.data.data.updated,
          errors: response.data.data.errors?.length ?? 0,
        } : undefined,
        errors: response.data.data?.errors,
      });
    } catch (error: any) {
      setResult({
        success: false,
        message: error.response?.data?.error || error.response?.data?.details || error.message || 'Upload failed',
        errors: error.response?.data?.details ? [error.response.data.details] : undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await axios.get('/api/upload/template', {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'gauge-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download template:', error);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Gauges</h1>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Instructions:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Upload Excel (.xlsx, .xls) or CSV files containing gauge data</li>
            <li>• Required columns: gauge_id, description, location, capacity, current_level, unit</li>
            <li>• Optional columns: calibration_interval_months, last_calibration_date</li>
            <li>• Download the template below for the correct format</li>
          </ul>
        </div>

        {/* Template Download */}
        <div className="mb-6">
          <button
            onClick={downloadTemplate}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Download Template
          </button>
        </div>

        {/* File Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select File
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors"
            style={{ borderColor: file ? '#3b82f6' : '#d1d5db', backgroundColor: file ? '#eff6ff' : 'white' }}>
            <div className="space-y-1 text-center">
              {file ? (
                <>
                  <svg className="mx-auto h-12 w-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm font-medium text-blue-700">{file.name}</p>
                  <p className="text-xs text-blue-500">{(file.size / 1024).toFixed(1)} KB — ready to upload</p>
                  <label className="cursor-pointer text-xs text-gray-500 underline">
                    Change file
                    <input type="file" className="sr-only" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                  </label>
                </>
              ) : (
                <>
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                      <span>Upload a file</span>
                      <input type="file" className="sr-only" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">Excel or CSV files only</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Upload Button */}
        <div className="mb-6">
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md text-sm font-medium"
          >
            {uploading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className={`border rounded-md p-4 ${
            result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <h3 className={`text-sm font-medium mb-2 ${
              result.success ? 'text-green-800' : 'text-red-800'
            }`}>
              Upload Result
            </h3>
            
            <p className={`text-sm mb-3 ${
              result.success ? 'text-green-700' : 'text-red-700'
            }`}>
              {result.message}
            </p>

            {result.summary && (
              <div className="bg-white border border-gray-200 rounded p-3 mb-3">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Summary:</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Total Rows:</span>
                    <span className="ml-2 font-medium">{result.summary.total_rows}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Inserted:</span>
                    <span className="ml-2 font-medium text-green-600">{result.summary.inserted}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Updated:</span>
                    <span className="ml-2 font-medium text-blue-600">{result.summary.updated}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Errors:</span>
                    <span className="ml-2 font-medium text-red-600">{result.summary.errors}</span>
                  </div>
                </div>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="bg-white border border-red-200 rounded p-3">
                <h4 className="text-sm font-medium text-red-800 mb-2">Errors:</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  {result.errors.slice(0, 10).map((error: string, index: number) => (
                    <li key={index}>• {error}</li>
                  ))}
                  {result.errors.length > 10 && (
                    <li className="text-red-600">... and {result.errors.length - 10} more errors</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Upload;