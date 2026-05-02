import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Gauges from './pages/Gauges';
import Alerts from './pages/Alerts';
import Upload from './pages/Upload';
import Audit from './pages/Audit';
import Settings from './pages/Settings';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="gauges" element={<Gauges />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="upload" element={
                <ProtectedRoute requiredRole={['admin', 'operator']}>
                  <Upload />
                </ProtectedRoute>
              } />
              <Route path="audit" element={<Audit />} />
              <Route path="settings" element={
                <ProtectedRoute requiredRole={['admin']}>
                  <Settings />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </Router>
      </WebSocketProvider>
    </AuthProvider>
  );
}

export default App;