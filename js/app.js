/**
 * ============================================================
 *  NPL Dashboard - Main App
 *  Render UI, handle user interactions, gọi NPLCalculator
 * ============================================================
 */

let rawData = null;
let processedData = null;
let currentPeriod = 3;
let currentFilters = { search: '', status: 'all', category: 'all' };

// --- Load data ---
async function loadData() {
    try {
        const res = await fetch('data/sample-data.json');
        rawData = await res.json();
        recalculate();
    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
        document.getElementById('table-body').innerHTML =
            '<tr><td colspan="10" class="loading">Lỗi tải dữ liệu. Vui lòng refresh.</td></tr>';
    }
}

// --- Recalculate ---
function recalculate() {
    if (!rawData) return;
    processedData = NPLCalculator.processAll(rawData, currentPeriod);
    render();
}

// --- Render ---
function render() {
    renderKPIs();
    renderTable();
    renderWarnings();
}

function renderKPIs() {
    const items = processedData.items;
    const urgentCount = items.filter(i => i.statusInfo.status === 'warning').length;
    const shortageCount = items.filter(i => i.statusInfo.status === 'danger').length;
    const totalValue = items.reduce((sum, i) => sum + i.total_cost, 0);

    document.getElementById('kpi-total').textContent = items.length;
    document.getElementById('kpi-urgent').textContent = urgentCount;
    document.getElementById('kpi-shortage').textContent = shortageCount;
    document.getElementById('kpi-value').textContent = formatCurrency(totalValue);
    document.getElementById('kpi-period-label').textContent = `Giai đoạn ${currentPeriod} tháng`;
}

function renderTable() {
    const items = filterItems(processedData.items);
    const tbody = document.getElementById('table-body');
    document.getElementById('result-count').textContent = `${items.length} NPL`;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">Không có NPL phù hợp với bộ lọc.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr>
            <td><span class="npl-code">${item.npl_code}</span></td>
            <td>${item.npl_name}</td>
            <td>${categoryLabel(item.category)}</td>
            <td class="text-right">${formatNum(item.inventory)}</td>
            <td class="text-right">${formatNum(item.demand)}</td>
            <td class="text-right"><strong>${formatNum(item.purchase)}</strong></td>
            <td class="text-center">${item.leadtime} ngày</td>
            <td class="text-center">${item.orderDate ? formatDate(item.orderDate) : '—'}</td>
            <td><span class="status-pill ${item.statusInfo.status}">${item.statusInfo.label}</span></td>
            <td>${renderSubstitutes(item)}</td>
        </tr>
    `).join('');
}

function renderSubstitutes(item) {
    if (item.suggestedSubstitute) {
        return `<span class="substitute-tag" title="Đề xuất dùng thay thế">${item.suggestedSubstitute.code} ★</span>`;
    }
    if (item.substitutes && item.substitutes.length > 0) {
        return item.substitutes.map(s => `<span class="substitute-tag">${s}</span>`).join('');
    }
    return '<span style="color:#cbd5e1">—</span>';
}

function renderWarnings() {
    const warnings = processedData.warnings;
    const container = document.getElementById('warnings-list');

    if (warnings.length === 0) {
        container.innerHTML = '<div class="warning-card info"><div class="warning-title">Mọi thứ đều ổn</div><div class="warning-desc">Không có cảnh báo nào cho giai đoạn này.</div></div>';
        return;
    }

    container.innerHTML = warnings.map(w => `
        <div class="warning-card ${w.level}">
            <div class="warning-title">${w.title}</div>
            <div class="warning-desc">${w.desc}</div>
        </div>
    `).join('');
}

// --- Filter ---
function filterItems(items) {
    return items.filter(item => {
        if (currentFilters.search) {
            const q = currentFilters.search.toLowerCase();
            if (!item.npl_code.toLowerCase().includes(q) && !item.npl_name.toLowerCase().includes(q)) {
                return false;
            }
        }
        if (currentFilters.status !== 'all' && item.statusInfo.status !== currentFilters.status) {
            return false;
        }
        if (currentFilters.category !== 'all' && item.category !== currentFilters.category) {
            return false;
        }
        return true;
    });
}

// --- Helpers ---
function formatNum(n) {
    return new Intl.NumberFormat('vi-VN').format(n);
}

function formatCurrency(n) {
    if (n >= 1e9) return (n/1e9).toFixed(2) + ' tỷ';
    if (n >= 1e6) return (n/1e6).toFixed(1) + ' tr';
    return formatNum(n) + 'đ';
}

function formatDate(d) {
    const date = new Date(d);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function categoryLabel(c) {
    return { vai: 'Vải', chi: 'Chỉ', nut: 'Nút - Khóa', phukien: 'Phụ kiện' }[c] || c;
}

// --- Export CSV ---
function exportCSV() {
    const items = filterItems(processedData.items);
    const headers = ['Mã NPL', 'Tên NPL', 'Nhóm', 'Tồn kho', 'Nhu cầu', 'Cần mua', 'Leadtime (ngày)', 'Ngày đặt', 'Trạng thái', 'Giá trị mua (VNĐ)'];
    const rows = items.map(i => [
        i.npl_code, i.npl_name, categoryLabel(i.category),
        i.inventory, i.demand, i.purchase, i.leadtime,
        i.orderDate ? formatDate(i.orderDate) : '',
        i.statusInfo.label, i.total_cost
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `npl-plan-${currentPeriod}thang-${Date.now()}.csv`;
    link.click();
}

// --- Event listeners ---
document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = parseInt(btn.dataset.period);
        recalculate();
    });
});

document.getElementById('search').addEventListener('input', e => {
    currentFilters.search = e.target.value;
    renderTable();
});

document.getElementById('filter-status').addEventListener('change', e => {
    currentFilters.status = e.target.value;
    renderTable();
});

document.getElementById('filter-category').addEventListener('change', e => {
    currentFilters.category = e.target.value;
    renderTable();
});

document.getElementById('btn-export').addEventListener('click', exportCSV);

// --- Init ---
loadData();
