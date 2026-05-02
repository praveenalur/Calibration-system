# Calibration & Production Capacity Management System

A comprehensive web-based system for managing gauge calibration schedules based on production capacity consumption rather than time-based predictions. The system prioritizes transparency, editability, and audit-friendly operations while maintaining Excel as the primary input method.

## 🚀 Features

### Core Functionality
- **Excel-Centric Data Management**: Import/export gauge data via Excel files
- **Capacity-Based Calibration Logic**: Transparent calculations based on production capacity consumption
- **Real-Time Dashboard**: Live monitoring of gauge status and alerts
- **Comprehensive Alert System**: Automatic generation of calibration and capacity alerts
- **Audit Trail**: Complete tracking of all data changes and system decisions
- **WebSocket Integration**: Real-time updates across all connected clients

### Key Capabilities
- ✅ Excel file upload and validation
- ✅ Gauge profile management (CRUD operations)
- ✅ Capacity-based status determination
- ✅ Alert generation and acknowledgment
- ✅ Real-time dashboard updates
- ✅ Excel export with calculated fields
- ✅ System reset and data management
- ✅ Configurable capacity thresholds
- ✅ Complete audit logging

## 🏗️ Architecture

### Technology Stack
- **Backend**: Node.js with TypeScript and Express.js
- **Database**: SQLite for simplicity and portability
- **Frontend**: Vanilla HTML/CSS/JavaScript with WebSocket support
- **File Processing**: XLSX library for Excel import/export
- **Real-Time**: WebSocket for live updates

### System Components
- **Database Layer**: SQLite with structured schemas
- **Capacity Manager**: Core business logic for calculations
- **Excel Processor**: File import/export handling
- **Alert Manager**: Alert generation and management
- **WebSocket Manager**: Real-time communication
- **REST API**: Comprehensive endpoints for all operations

## 📊 Data Models

### Gauge Profile
```typescript
interface GaugeProfile {
  id: string;
  gauge_id: string;
  gauge_type: string;
  calibration_frequency: number; // months
  last_calibration_date: string;
  monthly_usage: number;
  produced_quantity: number;
  max_capacity: number;
  last_modified_by: string;
  created_at: string;
  updated_at: string;
  
  // Calculated fields
  remaining_capacity?: number;
  status?: 'safe' | 'near_limit' | 'calibration_required' | 'overdue';
  next_calibration_date?: string;
}
```

### Alert System
```typescript
interface Alert {
  id: string;
  gauge_id: string;
  type: 'capacity' | 'calibration';
  severity: 'low' | 'medium' | 'high';
  message: string;
  created_at: string;
  acknowledged: boolean;
}
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation
1. Clone the repository
2. Navigate to the capacity-system directory
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application
1. Build the TypeScript code:
   ```bash
   npm run build
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Access the application:
   - Dashboard: http://localhost:3001
   - API Documentation: http://localhost:3001/api
   - Health Check: http://localhost:3001/health

### Development Mode
For development with auto-reload:
```bash
npm run dev
```

## 📋 API Endpoints

### Gauge Management
- `GET /api/gauges` - List all gauges with filtering and pagination
- `GET /api/gauges/:id` - Get specific gauge details
- `POST /api/gauges` - Create new gauge
- `PUT /api/gauges/:id` - Update gauge
- `DELETE /api/gauges/:id` - Delete gauge
- `POST /api/gauges/:id/recalculate` - Force recalculation

### File Operations
- `POST /api/upload/validate` - Validate Excel file
- `POST /api/upload/import` - Import Excel data
- `GET /api/upload/template` - Download Excel template
- `POST /api/upload/bulk-update` - Bulk update from Excel
- `GET /api/export/excel` - Export current data to Excel

### Dashboard & Monitoring
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/alerts` - List all alerts
- `POST /api/alerts/:id/acknowledge` - Acknowledge alert

### Administration
- `GET /api/admin/thresholds` - Get capacity thresholds
- `PUT /api/admin/thresholds` - Update thresholds
- `POST /api/admin/reset` - Reset entire system

## 📊 Usage Examples

### 1. Import Excel Data
```bash
curl -X POST -F "file=@gauges.xlsx" \
     -F "replace_existing=false" \
     -F "skip_duplicates=true" \
     http://localhost:3001/api/upload/import
```

### 2. Get Dashboard Statistics
```bash
curl http://localhost:3001/api/dashboard/stats
```

### 3. Export Current Data
```bash
curl -o export.xlsx http://localhost:3001/api/export/excel
```

### 4. Create New Gauge
```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{
       "gauge_id": "TEST-001",
       "gauge_type": "Test Gauge",
       "calibration_frequency": 12,
       "last_calibration_date": "2024-01-01",
       "monthly_usage": 50,
       "produced_quantity": 500,
       "max_capacity": 1000
     }' \
     http://localhost:3001/api/gauges
```

## 🔧 Configuration

### Capacity Thresholds
The system uses configurable thresholds for determining gauge status:
- **Near Limit Percentage**: Default 80% (when to show "near limit" status)
- **Calibration Warning Months**: Default 1 month (warning period before calibration due)

Update thresholds via the admin interface or API:
```bash
curl -X PUT -H "Content-Type: application/json" \
     -d '{
       "near_limit_percentage": 85,
       "calibration_warning_months": 2
     }' \
     http://localhost:3001/api/admin/thresholds
```

### Environment Variables
Create a `.env` file in the capacity-system directory:
```env
NODE_ENV=development
PORT=3001
DATABASE_PATH=./capacity_system.db
```

## 📁 Project Structure

```
capacity-system/
├── src/
│   ├── database/
│   │   └── Database.ts          # SQLite database layer
│   ├── services/
│   │   ├── CapacityManager.ts   # Core business logic
│   │   ├── ExcelProcessor.ts    # Excel import/export
│   │   ├── AlertManager.ts      # Alert generation
│   │   └── WebSocketManager.ts  # Real-time updates
│   ├── routes/
│   │   ├── gauges.ts           # Gauge CRUD operations
│   │   └── upload.ts           # File upload handling
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces
│   └── server.ts               # Main application server
├── public/
│   ├── index.html              # Web dashboard
│   └── app.js                  # Frontend JavaScript
├── dist/                       # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 Key Features Demonstrated

### 1. Excel Integration
- **Import**: Validates and imports Excel files with comprehensive error handling
- **Export**: Generates Excel files with current data and calculated fields
- **Template**: Provides downloadable template for proper data format

### 2. Capacity-Based Logic
- **Transparent Calculations**: All capacity calculations are deterministic and explainable
- **Status Determination**: Automatic status assignment based on capacity and calibration
- **Real-Time Updates**: Immediate recalculation when data changes

### 3. Alert System
- **Automatic Generation**: Alerts created based on capacity and calibration status
- **Severity Levels**: Low, medium, and high severity classifications
- **Acknowledgment**: Alerts can be acknowledged by users

### 4. Real-Time Dashboard
- **Live Updates**: WebSocket-powered real-time data updates
- **Statistics**: Comprehensive gauge statistics and breakdowns
- **Visual Interface**: Clean, responsive web interface

### 5. Audit Trail
- **Complete Logging**: All data changes are logged with timestamps and user information
- **Change Tracking**: Before/after values for all modifications
- **Compliance Ready**: Audit trail suitable for regulatory compliance

## 🔍 Testing the System

### Sample Data
The system includes sample data that demonstrates various gauge statuses:
- Gauges with different capacity utilization levels
- Gauges requiring calibration
- Gauges with overdue calibration
- Mixed gauge types (Pressure, Temperature, Flow, Level)

### Test Scenarios
1. **Import Excel Data**: Use the provided sample-data.csv
2. **View Dashboard**: Check real-time statistics and alerts
3. **Edit Gauge**: Modify gauge data and see immediate updates
4. **Export Data**: Download updated Excel file with calculated fields
5. **WebSocket Updates**: Open multiple browser tabs to see real-time sync

## 🛠️ Development

### Building
```bash
npm run build
```

### Running Tests
```bash
npm test
```

### Code Structure
- **TypeScript**: Strongly typed codebase for reliability
- **Modular Design**: Clear separation of concerns
- **Error Handling**: Comprehensive error handling throughout
- **Documentation**: Inline documentation and type definitions

## 🔒 Security & Compliance

### Data Security
- Input validation on all endpoints
- SQL injection prevention through parameterized queries
- File upload restrictions and validation
- Error handling that doesn't expose sensitive information

### Audit Compliance
- Complete audit trail of all operations
- User tracking for all data modifications
- Timestamp recording for all changes
- Immutable audit log entries

## 📈 Performance

### Optimizations
- Efficient SQLite queries with proper indexing
- Pagination for large datasets
- WebSocket connection management
- Memory-efficient file processing

### Scalability
- Stateless API design
- Database connection pooling ready
- Horizontal scaling preparation
- Configurable limits and thresholds

## 🎉 Success Metrics

The system successfully demonstrates:
- ✅ Complete Excel import/export workflow
- ✅ Real-time capacity-based calibration management
- ✅ Comprehensive alert system
- ✅ Live dashboard with WebSocket updates
- ✅ Full audit trail implementation
- ✅ Production-ready error handling
- ✅ Clean, responsive web interface
- ✅ RESTful API with comprehensive endpoints
- ✅ TypeScript implementation with proper typing
- ✅ Modular, maintainable code architecture

## 📞 Support

For questions or issues:
1. Check the API documentation at `/api`
2. Review the audit logs for troubleshooting
3. Use the health check endpoint for system status
4. Check the browser console for frontend issues

---

**System Status**: ✅ Production Ready  
**Last Updated**: January 2026  
**Version**: 1.0.0