// Global State
let chartInstances = {};

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    fetchAllocations();
    fetchPlanVsActual();
    fetchForecasts();
    fetchAlerts();

    // Event Listeners for Forms
    document.getElementById('allocation-form').addEventListener('submit', handleAllocationSubmit);
    document.getElementById('log-production-form').addEventListener('submit', handleLogProductionSubmit);
    document.getElementById('variance-form').addEventListener('submit', handleVarianceSubmit);
});

// --- Tab Navigation ---
function initTabs() {
    const navItems = document.querySelectorAll('.nav-menu .nav-item[data-tab]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all nav items and tabs
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(tab => tab.classList.remove('active'));

            // Add active class to clicked item and corresponding tab
            item.classList.add('active');
            const tabId = item.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            // Refresh charts if needed when tab is visible
            if(chartInstances['planActualChart']) chartInstances['planActualChart'].update();
            if(chartInstances['forecastChart']) chartInstances['forecastChart'].update();
        });
    });
}

// --- Modals ---
function openModal(id, data = null) {
    document.getElementById(id).style.display = 'flex';
    
    // Pre-fill data if Variance modal
    if (id === 'variance-modal' && data) {
        document.getElementById('var-gauge-id').value = data.gauge_id;
        document.getElementById('var-log-id').value = data.log_id;
        document.getElementById('variance-gauge-lbl').textContent = `(${data.gauge_id})`;
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    const form = document.querySelector(`#${id} form`);
    if(form) form.reset();
}

// --- Fetch Data & Render ---

async function fetchAllocations() {
    try {
        const res = await fetch('/api/pipelines');
        const { data } = await res.json();
        
        // For MVP, just fetching gauges directly if we need all allocations. 
        // Let's assume we have a gauge route that gives allocations, or we mock it for demo if the route is /api/gauges/:id/allocations.
        // Actually, let's just fetch all gauges and then mock the view or use the actual endpoints.
        const gRes = await fetch('/api/gauges');
        const gauges = (await gRes.json()).data;
        
        const tbody = document.getElementById('allocation-table-body');
        tbody.innerHTML = '';
        
        // Render gauges (mocking allocation for now if not populated)
        gauges.slice(0, 10).forEach(g => {
            const riskClass = g.capacity_percentage > 90 ? 'text-red' : 'text-green';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${g.gauge_id}</strong></td>
                <td>Alpha Line (Pipeline 1)</td>
                <td>100%</td>
                <td>${g.created_at.split('T')[0]}</td>
                <td><span class="badge badge-low">Active</span></td>
                <td class="${riskClass}">${g.capacity_percentage ? g.capacity_percentage.toFixed(1) : 0}% Utilized</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Error fetching allocations", e);
    }
}

async function fetchPlanVsActual() {
    try {
        const res = await fetch('/api/analytics/plan-vs-actual');
        const { data } = await res.json();
        
        if (data && data.length > 0) {
            renderPlanActualChart(data.reverse());
        }

        // Fetch logs for the table
        // We will fetch one gauge's logs for the demo table
        const gRes = await fetch('/api/gauges');
        const gauges = (await gRes.json()).data;
        if(gauges.length > 0) {
            const logRes = await fetch(`/api/gauges/${gauges[0].gauge_id}/monthly-log`);
            const logs = (await logRes.json()).data || [];
            
            const tbody = document.getElementById('plan-actual-table-body');
            tbody.innerHTML = '';
            
            logs.forEach(log => {
                const variance = log.actual_production - log.production_plan;
                const varClass = variance < 0 ? 'text-red' : 'text-green';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${log.gauge_id}</strong></td>
                    <td>${log.year_month}</td>
                    <td>${log.production_plan}</td>
                    <td>${log.actual_production}</td>
                    <td class="${varClass}"><strong>${variance}</strong></td>
                    <td>
                        <button class="btn btn-small btn-secondary" onclick='openModal("variance-modal", ${JSON.stringify(log)})'>
                            Why? ↗
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error("Error fetching plan vs actual", e);
    }
}

function renderPlanActualChart(data) {
    const ctx = document.getElementById('planActualChart').getContext('2d');
    
    if (chartInstances['planActualChart']) {
        chartInstances['planActualChart'].destroy();
    }

    const labels = data.map(d => d.year_month);
    const planData = data.map(d => d.total_plan);
    const actualData = data.map(d => d.total_actual);

    chartInstances['planActualChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Production Plan',
                    data: planData,
                    backgroundColor: 'rgba(148, 163, 184, 0.5)',
                    borderRadius: 4
                },
                {
                    label: 'Actual Production',
                    data: actualData,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

async function fetchForecasts() {
    try {
        const res = await fetch('/api/forecasts/risk-summary');
        const { data } = await res.json();
        
        const riskList = document.getElementById('risk-list');
        const tbody = document.getElementById('forecast-table-body');
        
        riskList.innerHTML = '';
        tbody.innerHTML = '';

        if (data && data.length > 0) {
            data.forEach(f => {
                // Risk List Item
                const li = document.createElement('li');
                li.innerHTML = `<strong>${f.gauge_id}</strong>: Expiry predicted on ${f.predicted_expiry_date} (Confidence: ${(f.confidence_score*100).toFixed(0)}%)`;
                riskList.appendChild(li);

                // Table Row
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${f.gauge_id}</strong></td>
                    <td class="text-red">${f.predicted_expiry_date}</td>
                    <td>${(f.predicted_utilisation_pct || 0).toFixed(1)}%</td>
                    <td>${(f.confidence_score*100).toFixed(0)}%</td>
                    <td><span class="badge badge-low">${f.model_version}</span></td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            riskList.innerHTML = '<li>No high collision risks detected at this time.</li>';
        }
        
        // Mock a line chart for forecast timeline
        renderForecastChart();
    } catch (e) {
        console.error("Error fetching forecasts", e);
    }
}

function renderForecastChart() {
    const ctx = document.getElementById('forecastChart').getContext('2d');
    if (chartInstances['forecastChart']) chartInstances['forecastChart'].destroy();

    chartInstances['forecastChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul (Predicted)', 'Aug (Predicted)'],
            datasets: [{
                label: 'Gauge Life Consumed (%)',
                data: [10, 25, 40, 55, 75, 90, 105, 120],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94a3b8' }, max: 150 },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

async function fetchAlerts() {
    try {
        const res = await fetch('/api/alerts');
        const { data } = await res.json();
        const feed = document.getElementById('alert-feed');
        feed.innerHTML = '';

        if(data && data.length > 0) {
            data.forEach(alert => {
                const badgeClass = alert.severity === 'high' ? 'badge-high' : (alert.severity === 'medium' ? 'badge-medium' : 'badge-low');
                const li = document.createElement('li');
                li.innerHTML = `
                    <div>
                        <strong>${alert.gauge_id}</strong>
                        <p class="text-secondary" style="font-size: 0.85rem; margin-top: 4px;">${alert.message}</p>
                    </div>
                    <div>
                        <span class="badge ${badgeClass}">${alert.type.replace('_', ' ')}</span>
                    </div>
                `;
                feed.appendChild(li);
            });
        }
    } catch (e) {
        console.error("Error fetching alerts", e);
    }
}

// --- Form Handlers ---

async function handleAllocationSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('alloc-gauge-id').value;
    const body = {
        pipeline_id: document.getElementById('alloc-pipeline-id').value,
        allocation_pct: document.getElementById('alloc-pct').value,
        effective_from: document.getElementById('alloc-date').value
    };
    
    await fetch(`/api/gauges/${id}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    closeModal('allocation-modal');
    fetchAllocations();
}

async function handleLogProductionSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('log-gauge-id').value;
    const body = {
        pipeline_id: document.getElementById('log-pipeline-id').value,
        year_month: document.getElementById('log-month').value,
        production_plan: document.getElementById('log-plan').value,
        actual_production: document.getElementById('log-actual').value
    };
    
    await fetch(`/api/gauges/${id}/monthly-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    closeModal('log-production-modal');
    fetchPlanVsActual();
    // Re-fetch forecasts after a brief delay to allow ML script to run
    setTimeout(fetchForecasts, 3000); 
}

async function handleVarianceSubmit(e) {
    e.preventDefault();
    const gaugeId = document.getElementById('var-gauge-id').value;
    const logId = document.getElementById('var-log-id').value;
    const body = {
        variance_reason: document.getElementById('var-reason-code').value + " - " + document.getElementById('var-comments').value,
        resolution_status: 'Investigating'
    };
    
    await fetch(`/api/gauges/${gaugeId}/monthly-log/${logId}/variance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    closeModal('variance-modal');
    fetchPlanVsActual();
}