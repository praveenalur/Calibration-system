// Global variables
let ws = null;
let gauges = [];
let alerts = [];
let currentEditingGauge = null;

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeWebSocket();
    loadDashboardData();
    loadGauges();
    loadAlerts();
    setupFileUpload();
    setupForms();
    
    // Auto-refresh every 30 seconds
    setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            loadDashboardData();
            loadGauges();
            loadAlerts();
        }
    }, 30000);
});

// WebSocket connection
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('✅ WebSocket connected');
            updateConnectionStatus(true);
            showNotification('Connected to real-time updates', 'success');
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            console.log('📨 WebSocket message:', data);
            handleWebSocketMessage(data);
        };
        
        ws.onclose = function(event) {
            console.log('❌ WebSocket disconnected:', event.code, event.reason);
            updateConnectionStatus(false);
            showNotification('Real-time connection lost', 'warning');
            
            // Attempt to reconnect after 5 seconds
            setTimeout(initializeWebSocket, 5000);
        };
        
        ws.onerror = function(error) {
            console.error('❌ WebSocket error:', error);
            updateConnectionStatus(false);
        };
    } catch (error) {
        console.error('❌ Failed to initialize WebSocket:', error);
        updateConnectionStatus(false);
    }
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'gauge_created':
        case 'gauge_updated':
        case 'gauge_deleted':
            loadGauges();
            loadDashboardData();
            break;
            
        case 'alert_created':
            loadAlerts();
            loadDashboardData();
            showNotification(`New alert: ${data.data.message}`, 'warning');
            break;
            
        case 'alert_acknowledged':
            loadAlerts();
            break;
            
        case 'dashboard_updated':
            updateDashboardStats(data.data);
            break;
            
        case 'system_reset':
            loadDashboardData();
            loadGauges();
            loadAlerts();
            showNotification('System has been reset', 'info');
            break;
            
        case 'bulk_import_completed':
            loadDashboardData();
            loadGauges();
            loadAlerts();
            showNotification(`Import completed: ${data.data.inserted} inserted, ${data.data.updated} updated`, 'success');
            break;
            
        case 'notification':
            showNotification(data.message, data.notification_type);
            break;
    }
}

// Update connection status
function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');
    
    if (connected) {
        statusDot.classList.remove('disconnected');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const result = await response.json();
        
        if (result.success) {
            updateDashboardStats(result.data);
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Update dashboard statistics
function updateDashboardStats(stats) {
    document.getElementById('totalGauges').textContent = stats.total_gauges;
    document.getElementById('safeCount').textContent = stats.safe_count;
    document.getElementById('nearLimitCount').textContent = stats.near_limit_count;
    document.getElementById('calibrationRequiredCount').textContent = stats.calibration_required_count;
    document.getElementById('overdueCount').textContent = stats.overdue_count;
    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    
    // Update recent alerts
    const recentAlertsDiv = document.getElementById('recentAlerts');
    if (stats.recent_alerts && stats.recent_alerts.length > 0) {
        recentAlertsDiv.innerHTML = stats.recent_alerts.slice(0, 5).map(alert => `
            <div class="alert-item alert-${alert.severity}">
                <strong>${alert.gauge_id}</strong>: ${alert.message}
                <small style="display: block; margin-top: 0.5rem; opacity: 0.7;">
                    ${new Date(alert.created_at).toLocaleString()}
                </small>
            </div>
        `).join('');
    } else {
        recentAlertsDiv.innerHTML = '<p>No recent alerts</p>';
    }
}

// Load gauges
async function loadGauges() {
    const loading = document.getElementById('gaugesLoading');
    const table = document.getElementById('gaugesTable');
    
    loading.style.display = 'block';
    table.style.display = 'none';
    
    try {
        const response = await fetch('/api/gauges');
        const result = await response.json();
        
        if (result.success) {
            gauges = result.data;
            renderGaugesTable();
        }
    } catch (error) {
        console.error('Error loading gauges:', error);
        showNotification('Failed to load gauges', 'error');
    } finally {
        loading.style.display = 'none';
        table.style.display = 'table';
    }
}

// Render gauges table
function renderGaugesTable() {
    const tbody = document.getElementById('gaugesTableBody');
    
    if (gauges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No gauges found</td></tr>';
        return;
    }
    
    tbody.innerHTML = gauges.map(gauge => {
        const produced = parseFloat(gauge.produced_quantity) || 0;
        const maxCap = parseFloat(gauge.max_capacity) || 0;
        const usagePercentage = maxCap > 0 ? ((produced / maxCap) * 100).toFixed(1) : '0.0';
        const remaining = parseFloat(gauge.remaining_capacity);
        const remainingDisplay = isNaN(remaining) ? 'N/A' : remaining.toFixed(2);
        const statusVal = gauge.status || 'safe';
        const statusClass = `status-${statusVal.replace(/_/g, '-')}`;
        
        const lastCal = gauge.last_calibration_date ? new Date(gauge.last_calibration_date) : null;
        const lastCalDisplay = lastCal && !isNaN(lastCal) ? lastCal.toLocaleDateString() : 'N/A';
        const nextCal = gauge.next_calibration_date ? new Date(gauge.next_calibration_date) : null;
        const nextCalDisplay = nextCal && !isNaN(nextCal) ? nextCal.toLocaleDateString() : 'N/A';
        
        return `
            <tr>
                <td><strong>${gauge.gauge_id}</strong></td>
                <td>${gauge.gauge_type || 'N/A'}</td>
                <td><span class="status-badge ${statusClass}">${statusVal.replace(/_/g, ' ')}</span></td>
                <td>${remainingDisplay}</td>
                <td>${usagePercentage}%</td>
                <td>${lastCalDisplay}</td>
                <td>${nextCalDisplay}</td>
                <td>
                    <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="editGauge('${gauge.gauge_id}')">Edit</button>
                    <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="deleteGauge('${gauge.gauge_id}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter gauges
function filterGauges() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    
    let filteredGauges = gauges;
    
    if (searchTerm) {
        filteredGauges = filteredGauges.filter(gauge => 
            gauge.gauge_id.toLowerCase().includes(searchTerm) ||
            gauge.gauge_type.toLowerCase().includes(searchTerm)
        );
    }
    
    if (statusFilter) {
        filteredGauges = filteredGauges.filter(gauge => gauge.status === statusFilter);
    }
    
    // Temporarily store original gauges and render filtered
    const originalGauges = gauges;
    gauges = filteredGauges;
    renderGaugesTable();
    gauges = originalGauges;
}

// Refresh gauges
function refreshGauges() {
    loadGauges();
    showNotification('Gauges refreshed', 'info');
}

// Load alerts
async function loadAlerts() {
    try {
        const response = await fetch('/api/alerts');
        const result = await response.json();
        
        if (result.success) {
            alerts = result.data;
            renderAlerts();
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}

// Render alerts
function renderAlerts() {
    const alertsDiv = document.getElementById('allAlerts');
    
    if (alerts.length === 0) {
        alertsDiv.innerHTML = '<p>No alerts</p>';
        return;
    }
    
    alertsDiv.innerHTML = alerts.slice(0, 20).map(alert => `
        <div class="alert-item alert-${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <strong>${alert.gauge_id}</strong> - ${alert.type.toUpperCase()}
                    <p style="margin: 0.5rem 0;">${alert.message}</p>
                    <small style="opacity: 0.7;">${new Date(alert.created_at).toLocaleString()}</small>
                </div>
                <div>
                    ${!alert.acknowledged ? `<button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="acknowledgeAlert('${alert.id}')">Acknowledge</button>` : '<span style="color: #4CAF50; font-weight: bold;">✓ Acknowledged</span>'}
                </div>
            </div>
        </div>
    `).join('');
}

// Acknowledge alert
async function acknowledgeAlert(alertId) {
    try {
        console.log('🔔 Acknowledging alert:', alertId);
        
        const url = `/api/alerts/${alertId}/acknowledge`;
        console.log('🔗 Request URL:', url);
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Response error text:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ Response result:', result);
        
        if (result.success) {
            loadAlerts();
            loadDashboardData();
            showNotification('Alert acknowledged', 'success');
        } else {
            showNotification(`Failed to acknowledge alert: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('❌ Error acknowledging alert:', error);
        showNotification(`Failed to acknowledge alert: ${error.message}`, 'error');
    }
}

// Modal functions
function openUploadModal() {
    document.getElementById('uploadModal').style.display = 'block';
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadOptions').style.display = 'none';
}

function openGaugeModal(gaugeId = null) {
    currentEditingGauge = gaugeId;
    const modal = document.getElementById('gaugeModal');
    const title = document.getElementById('gaugeModalTitle');
    
    if (gaugeId) {
        title.textContent = 'Edit Gauge';
        const gauge = gauges.find(g => g.gauge_id === gaugeId);
        if (gauge) {
            document.getElementById('gaugeId').value = gauge.gauge_id;
            document.getElementById('gaugeId').disabled = true;
            document.getElementById('gaugeType').value = gauge.gauge_type;
            document.getElementById('calibrationFrequency').value = gauge.calibration_frequency;
            document.getElementById('lastCalibrationDate').value = gauge.last_calibration_date;
            document.getElementById('monthlyUsage').value = gauge.monthly_usage;
            document.getElementById('producedQuantity').value = gauge.produced_quantity;
            document.getElementById('maxCapacity').value = gauge.max_capacity;
        }
    } else {
        title.textContent = 'Add New Gauge';
        document.getElementById('gaugeForm').reset();
        document.getElementById('gaugeId').disabled = false;
    }
    
    modal.style.display = 'block';
}

function closeGaugeModal() {
    document.getElementById('gaugeModal').style.display = 'none';
    currentEditingGauge = null;
}

function openThresholdsModal() {
    loadThresholds();
    document.getElementById('thresholdsModal').style.display = 'block';
}

function closeThresholdsModal() {
    document.getElementById('thresholdsModal').style.display = 'none';
}

function openEmailConfigModal() {
    loadEmailSettings();
    document.getElementById('emailConfigModal').style.display = 'block';
    
    // Add Enter key handler for recipient input
    const recipientInput = document.getElementById('newRecipientEmail');
    recipientInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addEmailRecipient();
        }
    });
}

function closeEmailConfigModal() {
    document.getElementById('emailConfigModal').style.display = 'none';
}

// Load thresholds
async function loadThresholds() {
    try {
        const response = await fetch('/api/admin/thresholds');
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('nearLimitPercentage').value = result.data.near_limit_percentage;
            document.getElementById('calibrationWarningMonths').value = result.data.calibration_warning_months;
        }
    } catch (error) {
        console.error('Error loading thresholds:', error);
    }
}

// Load email settings
async function loadEmailSettings() {
    try {
        const response = await fetch('/api/email/settings');
        const result = await response.json();
        
        if (result.success) {
            const settings = result.data;
            document.getElementById('emailEnabled').checked = settings.enabled === 1;
            document.getElementById('smtpHost').value = settings.smtp_host || 'smtp.gmail.com';
            document.getElementById('smtpPort').value = settings.smtp_port || 587;
            document.getElementById('smtpUser').value = settings.smtp_user || '';
            document.getElementById('fromEmail').value = settings.from_email || '';
            // Don't populate password for security
        }
        
        // Load recipients separately
        await loadEmailRecipients();
    } catch (error) {
        console.error('Error loading email settings:', error);
    }
}

// Load email recipients
async function loadEmailRecipients() {
    try {
        const response = await fetch('/api/email/recipients');
        const result = await response.json();
        
        if (result.success) {
            renderRecipientsList(result.data);
        }
    } catch (error) {
        console.error('Error loading email recipients:', error);
        document.getElementById('recipientsList').innerHTML = '<p style="color: red;">Failed to load recipients</p>';
    }
}

// Render recipients list
function renderRecipientsList(recipients) {
    const recipientsList = document.getElementById('recipientsList');
    
    if (recipients.length === 0) {
        recipientsList.innerHTML = '<p style="color: #666;">No recipients configured</p>';
        return;
    }
    
    recipientsList.innerHTML = recipients.map(email => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: #f8f9fa; border-radius: 4px; margin-bottom: 0.5rem;">
            <span>${email}</span>
            <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="removeEmailRecipient('${email}')">Remove</button>
        </div>
    `).join('');
}

// Add email recipient
async function addEmailRecipient() {
    const emailInput = document.getElementById('newRecipientEmail');
    const email = emailInput.value.trim();
    
    if (!email) {
        showNotification('Please enter an email address', 'error');
        return;
    }
    
    if (!email.includes('@')) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/email/recipients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Recipient added successfully', 'success');
            emailInput.value = '';
            renderRecipientsList(result.data);
        } else {
            showNotification(`Failed to add recipient: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error adding recipient:', error);
        showNotification('Failed to add recipient', 'error');
    }
}

// Remove email recipient
async function removeEmailRecipient(email) {
    if (!confirm(`Remove ${email} from recipients list?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/email/recipients/${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Recipient removed successfully', 'success');
            renderRecipientsList(result.data);
        } else {
            showNotification(`Failed to remove recipient: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error removing recipient:', error);
        showNotification('Failed to remove recipient', 'error');
    }
}

// Setup file upload
function setupFileUpload() {
    const fileUpload = document.getElementById('fileUpload');
    const fileInput = document.getElementById('fileInput');
    
    fileUpload.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUpload.classList.add('dragover');
    });
    
    fileUpload.addEventListener('dragleave', () => {
        fileUpload.classList.remove('dragover');
    });
    
    fileUpload.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUpload.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect();
        }
    });
    
    fileInput.addEventListener('change', handleFileSelect);
}

// Handle file selection
function handleFileSelect() {
    const fileInput = document.getElementById('fileInput');
    const uploadOptions = document.getElementById('uploadOptions');
    
    if (fileInput.files.length > 0) {
        uploadOptions.style.display = 'block';
    }
}

// Upload file
async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const replaceExisting = document.getElementById('replaceExisting').checked;
    const skipDuplicates = document.getElementById('skipDuplicates').checked;
    
    if (!fileInput.files.length) {
        showNotification('Please select a file', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('replace_existing', replaceExisting);
    formData.append('skip_duplicates', skipDuplicates);
    formData.append('imported_by', 'Web Interface');
    
    try {
        showNotification('Uploading file...', 'info');
        
        const response = await fetch('/api/upload/import', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Import successful: ${result.data.inserted} inserted, ${result.data.updated} updated`, 'success');
            closeUploadModal();
            loadDashboardData();
            loadGauges();
            loadAlerts();
        } else {
            showNotification(`Import failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showNotification('Upload failed', 'error');
    }
}

// Setup forms
function setupForms() {
    document.getElementById('gaugeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            gauge_id: document.getElementById('gaugeId').value,
            gauge_type: document.getElementById('gaugeType').value,
            calibration_frequency: parseInt(document.getElementById('calibrationFrequency').value),
            last_calibration_date: document.getElementById('lastCalibrationDate').value,
            monthly_usage: parseFloat(document.getElementById('monthlyUsage').value),
            produced_quantity: parseFloat(document.getElementById('producedQuantity').value),
            max_capacity: parseFloat(document.getElementById('maxCapacity').value),
            last_modified_by: 'Web Interface'
        };
        
        try {
            const url = currentEditingGauge ? `/api/gauges/${currentEditingGauge}` : '/api/gauges';
            const method = currentEditingGauge ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification(`Gauge ${currentEditingGauge ? 'updated' : 'created'} successfully`, 'success');
                closeGaugeModal();
                loadGauges();
                loadDashboardData();
            } else {
                showNotification(`Failed to ${currentEditingGauge ? 'update' : 'create'} gauge: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error saving gauge:', error);
            showNotification('Failed to save gauge', 'error');
        }
    });
    
    document.getElementById('thresholdsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            near_limit_percentage: parseFloat(document.getElementById('nearLimitPercentage').value),
            calibration_warning_months: parseInt(document.getElementById('calibrationWarningMonths').value)
        };
        
        try {
            const response = await fetch('/api/admin/thresholds', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Thresholds updated successfully', 'success');
                closeThresholdsModal();
                loadDashboardData();
                loadGauges();
            } else {
                showNotification('Failed to update thresholds', 'error');
            }
        } catch (error) {
            console.error('Error updating thresholds:', error);
            showNotification('Failed to update thresholds', 'error');
        }
    });
    
    document.getElementById('emailConfigForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            enabled: document.getElementById('emailEnabled').checked,
            smtp_host: document.getElementById('smtpHost').value,
            smtp_port: parseInt(document.getElementById('smtpPort').value),
            smtp_secure: false, // We'll use STARTTLS
            smtp_user: document.getElementById('smtpUser').value,
            smtp_password: document.getElementById('smtpPassword').value,
            from_email: document.getElementById('fromEmail').value
        };
        
        try {
            const response = await fetch('/api/email/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Email settings updated successfully', 'success');
                // Don't close modal so user can manage recipients
            } else {
                showNotification('Failed to update email settings', 'error');
            }
        } catch (error) {
            console.error('Error updating email settings:', error);
            showNotification('Failed to update email settings', 'error');
        }
    });
}

// Edit gauge
function editGauge(gaugeId) {
    openGaugeModal(gaugeId);
}

// Delete gauge
async function deleteGauge(gaugeId) {
    if (!confirm(`Are you sure you want to delete gauge ${gaugeId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/gauges/${gaugeId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ deleted_by: 'Web Interface' })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Gauge deleted successfully', 'success');
            loadGauges();
            loadDashboardData();
        } else {
            showNotification('Failed to delete gauge', 'error');
        }
    } catch (error) {
        console.error('Error deleting gauge:', error);
        showNotification('Failed to delete gauge', 'error');
    }
}

// Download Excel
async function downloadExcel() {
    try {
        showNotification('Generating Excel file...', 'info');
        
        const response = await fetch('/api/export/excel');
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gauge-profiles-${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification('Excel file downloaded', 'success');
        } else {
            showNotification('Failed to generate Excel file', 'error');
        }
    } catch (error) {
        console.error('Error downloading Excel:', error);
        showNotification('Failed to download Excel file', 'error');
    }
}

// Reset system
async function resetSystem() {
    if (!confirm('Are you sure you want to reset the entire system? This will delete all gauge data and alerts.')) {
        return;
    }
    
    if (!confirm('This action cannot be undone. Are you absolutely sure?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin/reset', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('System reset successfully', 'success');
            loadDashboardData();
            loadGauges();
            loadAlerts();
        } else {
            showNotification('Failed to reset system', 'error');
        }
    } catch (error) {
        console.error('Error resetting system:', error);
        showNotification('Failed to reset system', 'error');
    }
}

// Email notification functions
async function testEmailNotification() {
    try {
        showNotification('Sending test email...', 'info');
        
        const response = await fetch('/api/email/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Test email sent successfully! ${result.data.message}`, 'success');
        } else {
            showNotification(`Failed to send test email: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error sending test email:', error);
        showNotification('Failed to send test email', 'error');
    }
}

async function checkEmailStatus() {
    try {
        const response = await fetch('/api/email/status');
        const result = await response.json();
        
        if (result.success) {
            const status = result.data;
            if (status.success) {
                showNotification(`Email configured: ${status.config.user} → ${status.config.recipients}`, 'success');
            } else {
                showNotification(`Email issue: ${status.message}`, 'warning');
            }
        } else {
            showNotification('Failed to check email status', 'error');
        }
    } catch (error) {
        console.error('Error checking email status:', error);
        showNotification('Failed to check email status', 'error');
    }
}

async function sendDailySummary() {
    try {
        showNotification('Sending daily summary...', 'info');
        
        const response = await fetch('/api/email/summary');
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Daily summary sent: ${result.data.message}`, 'success');
        } else {
            showNotification(`Failed to send daily summary: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error sending daily summary:', error);
        showNotification('Failed to send daily summary', 'error');
    }
}

async function testEmailConfig() {
    try {
        showNotification('Testing email configuration...', 'info');
        
        const response = await fetch('/api/email/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Test email sent successfully! ${result.data.message}`, 'success');
        } else {
            showNotification(`Failed to send test email: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error testing email configuration:', error);
        showNotification('Failed to test email configuration', 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Close modals when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
};