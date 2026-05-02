import { Server } from 'http';
import WebSocket from 'ws';
import { GaugeProfile, Alert, DashboardStats } from '../types';

export class WebSocketManager {
  private wss: WebSocket.Server | null = null;
  private clients: Set<WebSocket> = new Set();
  
  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });
    
    this.wss.on('connection', (ws: WebSocket, request) => {
      console.log(`📡 WebSocket client connected from ${request.socket.remoteAddress}`);
      
      this.clients.add(ws);
      
      // Send welcome message
      this.sendToClient(ws, {
        type: 'connection',
        message: 'Connected to Capacity Management System',
        timestamp: new Date().toISOString()
      });
      
      // Handle client messages
      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this.sendToClient(ws, {
            type: 'error',
            message: 'Invalid message format',
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // Handle client disconnect
      ws.on('close', (code, reason) => {
        console.log(`📡 WebSocket client disconnected: ${code} ${reason}`);
        this.clients.delete(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
    
    console.log('📡 WebSocket server initialized');
  }
  
  /**
   * Handle incoming client messages
   */
  private handleClientMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'subscribe':
        // Client wants to subscribe to specific events
        this.sendToClient(ws, {
          type: 'subscribed',
          events: message.events || ['all'],
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'request_status':
        // Client requests current system status
        this.sendToClient(ws, {
          type: 'status',
          connected_clients: this.clients.size,
          server_time: new Date().toISOString()
        });
        break;
        
      default:
        this.sendToClient(ws, {
          type: 'error',
          message: `Unknown message type: ${message.type}`,
          timestamp: new Date().toISOString()
        });
    }
  }
  
  /**
   * Send message to specific client
   */
  private sendToClient(ws: WebSocket, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    }
  }
  
  /**
   * Broadcast message to all connected clients
   */
  private broadcast(data: any): void {
    const message = JSON.stringify(data);
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Error broadcasting WebSocket message:', error);
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    });
  }
  
  /**
   * Broadcast gauge creation
   */
  broadcastGaugeCreated(gauge: GaugeProfile): void {
    this.broadcast({
      type: 'gauge_created',
      data: gauge,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast gauge update
   */
  broadcastGaugeUpdated(gauge: GaugeProfile, changes?: any): void {
    this.broadcast({
      type: 'gauge_updated',
      data: gauge,
      changes: changes,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast gauge deletion
   */
  broadcastGaugeDeleted(gaugeId: string): void {
    this.broadcast({
      type: 'gauge_deleted',
      gauge_id: gaugeId,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast alert creation
   */
  broadcastAlertCreated(alert: Alert): void {
    this.broadcast({
      type: 'alert_created',
      data: alert,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast alert acknowledgment
   */
  broadcastAlertAcknowledged(alertId: string): void {
    this.broadcast({
      type: 'alert_acknowledged',
      alert_id: alertId,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast dashboard update
   */
  broadcastDashboardUpdated(stats: DashboardStats): void {
    this.broadcast({
      type: 'dashboard_updated',
      data: stats,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast threshold configuration update
   */
  broadcastThresholdsUpdated(thresholds: any): void {
    this.broadcast({
      type: 'thresholds_updated',
      data: thresholds,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast system reset
   */
  broadcastSystemReset(): void {
    this.broadcast({
      type: 'system_reset',
      message: 'System has been reset - all data cleared',
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast bulk import completion
   */
  broadcastBulkImport(stats: any): void {
    this.broadcast({
      type: 'bulk_import_completed',
      data: stats,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Broadcast system notification
   */
  broadcastNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.broadcast({
      type: 'notification',
      message: message,
      notification_type: type,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }
  
  /**
   * Get health status
   */
  getHealthStatus(): any {
    return {
      server_running: this.wss !== null,
      connected_clients: this.clients.size,
      last_check: new Date().toISOString()
    };
  }
  
  /**
   * Send heartbeat to all clients
   */
  sendHeartbeat(): void {
    this.broadcast({
      type: 'heartbeat',
      server_time: new Date().toISOString(),
      connected_clients: this.clients.size
    });
  }
  
  /**
   * Start periodic heartbeat
   */
  startHeartbeat(intervalMs: number = 30000): void {
    setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
  }
  
  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.wss) {
      console.log('📡 Shutting down WebSocket server...');
      
      // Notify all clients of shutdown
      this.broadcast({
        type: 'server_shutdown',
        message: 'Server is shutting down',
        timestamp: new Date().toISOString()
      });
      
      // Close all client connections
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1001, 'Server shutdown');
        }
      });
      
      // Close server
      this.wss.close(() => {
        console.log('📡 WebSocket server closed');
      });
      
      this.wss = null;
      this.clients.clear();
    }
  }
  
  /**
   * Clean up disconnected clients
   */
  cleanupClients(): void {
    this.clients.forEach(client => {
      if (client.readyState !== WebSocket.OPEN) {
        this.clients.delete(client);
      }
    });
  }
  
  /**
   * Send system status to all clients
   */
  broadcastSystemStatus(status: any): void {
    this.broadcast({
      type: 'system_status',
      data: status,
      timestamp: new Date().toISOString()
    });
  }
}