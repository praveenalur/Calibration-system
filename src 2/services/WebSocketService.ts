import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { IGauge } from '../models/Gauge';
import { IAlert } from '../models/Alert';

export interface WebSocketEvents {
  gauge_created: IGauge;
  gauge_updated: { gauge: IGauge; changes: any };
  gauge_deleted: { gauge_id: string };
  alert_created: IAlert;
  alert_acknowledged: IAlert;
  dashboard_updated: any;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedClients: Set<string> = new Set();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);
      this.connectedClients.add(socket.id);

      // Send current connection count
      this.io.emit('client_count', this.connectedClients.size);

      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
        this.io.emit('client_count', this.connectedClients.size);
      });

      // Handle client subscription to specific gauge updates
      socket.on('subscribe_gauge', (gaugeId: string) => {
        socket.join(`gauge_${gaugeId}`);
        console.log(`📡 Client ${socket.id} subscribed to gauge ${gaugeId}`);
      });

      socket.on('unsubscribe_gauge', (gaugeId: string) => {
        socket.leave(`gauge_${gaugeId}`);
        console.log(`📡 Client ${socket.id} unsubscribed from gauge ${gaugeId}`);
      });

      // Handle dashboard subscription
      socket.on('subscribe_dashboard', () => {
        socket.join('dashboard');
        console.log(`📊 Client ${socket.id} subscribed to dashboard updates`);
      });

      socket.on('unsubscribe_dashboard', () => {
        socket.leave('dashboard');
        console.log(`📊 Client ${socket.id} unsubscribed from dashboard updates`);
      });
    });
  }

  // Emit gauge events
  emitGaugeCreated(gauge: IGauge): void {
    console.log(`📡 Broadcasting gauge_created: ${gauge.gauge_id}`);
    this.io.emit('gauge_created', gauge);
    this.io.to('dashboard').emit('dashboard_updated', { type: 'gauge_created', gauge });
  }

  emitGaugeUpdated(gauge: IGauge, changes: any): void {
    console.log(`📡 Broadcasting gauge_updated: ${gauge.gauge_id}`);
    const eventData = { gauge, changes };
    
    // Emit to all clients
    this.io.emit('gauge_updated', eventData);
    
    // Emit to specific gauge subscribers
    this.io.to(`gauge_${gauge.gauge_id}`).emit('gauge_updated', eventData);
    
    // Emit to dashboard subscribers
    this.io.to('dashboard').emit('dashboard_updated', { type: 'gauge_updated', ...eventData });
  }

  emitGaugeDeleted(gaugeId: string): void {
    console.log(`📡 Broadcasting gauge_deleted: ${gaugeId}`);
    const eventData = { gauge_id: gaugeId };
    
    this.io.emit('gauge_deleted', eventData);
    this.io.to(`gauge_${gaugeId}`).emit('gauge_deleted', eventData);
    this.io.to('dashboard').emit('dashboard_updated', { type: 'gauge_deleted', ...eventData });
  }

  // Emit alert events
  emitAlertCreated(alert: IAlert): void {
    console.log(`🚨 Broadcasting alert_created: ${alert.alert_id} for gauge ${alert.gauge_id}`);
    this.io.emit('alert_created', alert);
    this.io.to(`gauge_${alert.gauge_id}`).emit('alert_created', alert);
    this.io.to('dashboard').emit('dashboard_updated', { type: 'alert_created', alert });
  }

  emitAlertAcknowledged(alert: IAlert): void {
    console.log(`✅ Broadcasting alert_acknowledged: ${alert.alert_id}`);
    this.io.emit('alert_acknowledged', alert);
    this.io.to(`gauge_${alert.gauge_id}`).emit('alert_acknowledged', alert);
    this.io.to('dashboard').emit('dashboard_updated', { type: 'alert_acknowledged', alert });
  }

  // Emit dashboard updates
  emitDashboardUpdate(data: any): void {
    console.log(`📊 Broadcasting dashboard_updated`);
    this.io.to('dashboard').emit('dashboard_updated', data);
  }

  // Utility methods
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  broadcastMessage(event: string, data: any): void {
    console.log(`📢 Broadcasting ${event}`);
    this.io.emit(event, data);
  }

  sendToRoom(room: string, event: string, data: any): void {
    console.log(`📢 Sending ${event} to room ${room}`);
    this.io.to(room).emit(event, data);
  }

  // Health check for WebSocket
  getStatus(): {
    connected_clients: number;
    rooms: string[];
    uptime: number;
  } {
    const rooms = Array.from(this.io.sockets.adapter.rooms.keys())
      .filter(room => !this.connectedClients.has(room)); // Filter out client IDs

    return {
      connected_clients: this.connectedClients.size,
      rooms,
      uptime: process.uptime()
    };
  }
}

// Singleton instance
let webSocketService: WebSocketService | null = null;

export function initializeWebSocket(server: HTTPServer): WebSocketService {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
    console.log('🚀 WebSocket service initialized');
  }
  return webSocketService;
}

export function getWebSocketService(): WebSocketService | null {
  return webSocketService;
}