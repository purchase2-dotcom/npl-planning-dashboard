/**
 * ============================================================
 *  APP - Main controller: routing, state, render
 * ============================================================
 */

const App = {
    state: {
        rawData: null,
        processedData: null,
        period: 3,
        page: 'dashboard',
        filters: { search: '', status: 'all', category: 'all' },
        theme: localStorage.getItem('theme') || 'light',
        settings: {
            safety: 10,
            buffer: 7,
            threshold: 20
        }
    },

    PAGE_META: {
        dashboard:  { title: 'Dashboard', sub: 'Tổng quan kế hoạch mua nguyên phụ liệu' },
        upload:     { title: 'Upload dữ liệu', sub: 'Nhập dữ liệu NPL, kế hoạch sản xuất và BOM từ file' },
        npl:        { title: 'Danh sách NPL', sub: 'Toàn bộ nguyên phụ liệu đang theo dõi' },
        production: { title: 'Kế hoạch sản xuất', sub: 'Sản phẩm và sản lượng dự kiến' },
        warnings:   { title: 'Cảnh báo', sub: 'Các NPL cần xử lý ngay' },
        settings:   { title: 'Cài đặt', sub: 'Cấu hình tham số tính toán' }
    },

    async init() {
        this.applyTheme();
        this.bindEvents();
        await this.loadInitialData();
    },

    async loadInitialData() {
        try {
            const res = await fetch('data/sample-data.json');
            this.state.rawData = await res.json();
            this.recalculate();
        } catch (err) {
            console.warn('Không tải được sample data:', err);
            this.state.rawData = { npl_list: [], production_plan: [], bom: [] };
            this.recalculate();
        }
    },

    recalculate() {
        if (!this.state.rawData) return;
        this.state.processedData = NPLCalculator.processAll(this.state.rawData, this.state.period);
        this.render();
    },

    render() {
        this.renderKPIs();
        this.renderHero();
        this.renderTable();
        this.renderNPLList();
        this.renderProductionList();
        this.renderWarnings();
    },

    renderHero() {
        const items = this.state.processedData.items;
        const alertCount = items.filter(i => i.statusInfo.status === 'danger').length;
        document.getElementById('hero-period').textContent = `${this.state.period} tháng`;
        document.getElementById('hero-alert').textContent = alertCount;
    },

    renderKPIs() {
        const items = this.state.processedData.items;
        const urgent = items.filter(i => i.statusInfo.status === 'warning').length;
        const shortage = items.filter(i => i.statusInfo.status === 'danger').length;
        const total = items.reduce((s, i) => s + i.total_cost, 0);

        document.getElementById('kpi-total').textContent = items.length;
        document.getElementById('kpi-urgent').textContent = urgent;
        document.getElementById('kpi-shortage').textContent = shortage;
        document.getElementById('kpi-value').textContent = this.fmtCurrency(total);
        document.getElementById('kpi-period-label').textContent = `Giai đoạn ${this.state.period} tháng`;
        document.getElementById('nav-warning-count').textContent = shortage + urgent;
    },

    renderTable() {
        const items = this.filterItems(this.state.processedData.items);
        const tbody = document.getElementById('table-body');

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Không có NPL phù hợp.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(item => `
            <tr>
                <td><span class="npl-code">${item.npl_code}</span></td>
                <td>${item.npl_name}</td>
                <td>${this.categoryLabel(item.category)}</td>
                <td class="text-right">${this.fmtNum(item.inventory)}</td>
                <td class="text-right">${this.fmtNum(item.demand)}</td>
                <td class="text-right"><strong>${this.fmtNum(item.purchase)}</strong></td>
                <td class="text-center">${item.leadtime} ngày</td>
                <td class="text-center">${item.orderDate ? this.fmtDate(item.orderDate) : '—'}</td>
                <td><span class="status-pill ${item.statusInfo.status}">${item.statusInfo.label}</span></td>
                <td>${this.renderSubs(item)}</td>
            </tr>
        `).join('');
    },

    renderSubs(item) {
        if (item.suggestedSubstitute) {
            return `<span class="substitute-tag" title="Đề xuất dùng thay thế">${item.suggestedSubstitute.code} ★</span>`;
        }
        if (item.substitutes && item.substitutes.length) {
            return item.substitutes.map(s => `<span class="substitute-tag">${s}</span>`).join('');
        }
        return '<span style="color:var(--text-faint)">—</span>';
    },

    renderNPLList() {
        const tbody = document.getElementById('npl-list-body');
        if (!tbody) return;
        const list = this.state.rawData.npl_list || [];
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Chưa có dữ liệu NPL.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(n => `
            <tr>
                <td><span class="npl-code">${n.code}</span></td>
                <td>${n.name}</td>
                <td>${this.categoryLabel(n.category)}</td>
                <td class="text-right">${this.fmtNum(n.inventory)}</td>
                <td class="text-right">${this.fmtNum(n.on_order || 0)}</td>
                <td class="text-center">${n.leadtime} ngày</td>
                <td class="text-right">${this.fmtNum(n.unit_price || 0)}đ</td>
                <td>${(n.substitutes || []).map(s => `<span class="substitute-tag">${s}</span>`).join('') || '—'}</td>
            </tr>
        `).join('');
    },

    renderProductionList() {
        const tbody = document.getElementById('production-body');
        if (!tbody) return;
        const list = this.state.rawData.production_plan || [];
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Chưa có kế hoạch sản xuất.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(p => `
            <tr>
                <td><span class="npl-code">${p.product_id}</span></td>
                <td>${p.product_name}</td>
                <td class="text-right">${this.fmtNum(p.quantity)}</td>
                <td class="text-center">${this.fmtDate(p.start_date)}</td>
            </tr>
        `).join('');
    },

    renderWarnings() {
        const container = document.getElementById('warnings-list');
        if (!container) return;
        const warnings = this.state.processedData.warnings;

        if (warnings.length === 0) {
            container.innerHTML = `<div class="warning-card info">
                <div class="warning-icon">✓</div>
                <div class="warning-content">
                    <div class="warning-title">Mọi thứ đều ổn</div>
                    <div class="warning-desc">Không có cảnh báo nào cho giai đoạn ${this.state.period} tháng.</div>
                </div>
            </div>`;
            return;
        }

        const icons = { critical: '⚠️', warning: '⏰', info: 'ℹ️' };
        container.innerHTML = warnings.map(w => `
            <div class="warning-card ${w.level}">
                <div class="warning-icon">${icons[w.level] || 'ℹ️'}</div>
                <div class="warning-content">
                    <div class="warning-title">${w.title}</div>
                    <div class="warning-desc">${w.desc}</div>
                </div>
            </div>
        `).join('');
    },

    filterItems(items) {
        const f = this.state.filters;
        return items.filter(item => {
            if (f.search) {
                const q = f.search.toLowerCase();
                if (!item.npl_code.toLowerCase().includes(q) && !item.npl_name.toLowerCase().includes(q)) return false;
            }
            if (f.status !== 'all' && item.statusInfo.status !== f.status) return false;
            if (f.category !== 'all' && item.category !== f.category) return false;
            return true;
        });
    },

    // ============ Navigation ============
    goToPage(page) {
        this.state.page = page;
        document.querySelectorAll('.page').forEach(p => p.hidden = p.dataset.page !== page);
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
        const meta = this.PAGE_META[page];
        if (meta) {
            document.getElementById('page-title').textContent = meta.title;
            document.getElementById('page-subtitle').textContent = meta.sub;
        }
        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');
    },

    // ============ Theme ============
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.state.theme);
        const label = document.querySelector('.theme-label');
        if (label) label.textContent = this.state.theme === 'light' ? 'Chuyển nền tối' : 'Chuyển nền sáng';
    },

    toggleTheme() {
        this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.state.theme);
        this.applyTheme();
    },

    // ============ Upload ============
    async handleFiles(files) {
        if (!files || files.length === 0) return;
        const resultEl = document.getElementById('upload-result');
        resultEl.hidden = false;
        resultEl.classList.remove('error');
        resultEl.innerHTML = '<strong>Đang xử lý...</strong> Đọc và phân tích file.';

        try {
            const { data, fileInfo } = await NPLUploader.parseFiles(Array.from(files));

            // Validate
            const hasData = (data.npl_list && data.npl_list.length) ||
                           (data.production_plan && data.production_plan.length) ||
                           (data.bom && data.bom.length);

            if (!hasData) {
                throw new Error('Không tìm thấy dữ liệu hợp lệ. Kiểm tra lại format file hoặc tải template mẫu.');
            }

            // Merge với data hiện có (giữ phần không bị overwrite)
            const newData = {
                npl_list: data.npl_list && data.npl_list.length ? data.npl_list : (this.state.rawData?.npl_list || []),
                production_plan: data.production_plan && data.production_plan.length ? data.production_plan : (this.state.rawData?.production_plan || []),
                bom: data.bom && data.bom.length ? data.bom : (this.state.rawData?.bom || [])
            };

            this.state.rawData = newData;
            this.recalculate();

            const summary = fileInfo.map(f =>
                f.ok ? `✓ ${f.name}: ${f.counts.join(', ')}` : `✗ ${f.name}: ${f.error}`
            ).join('<br>');

            resultEl.innerHTML = `<strong>Upload thành công!</strong><br>${summary}<br><br>Dashboard đã cập nhật dữ liệu mới. Sang tab <a href="#" data-jump="dashboard" style="color:inherit;text-decoration:underline;">Dashboard</a> để xem.`;

        } catch (err) {
            resultEl.classList.add('error');
            resultEl.innerHTML = `<strong>Lỗi:</strong> ${err.message}`;
        }
    },

    // ============ Settings ============
    saveSettings() {
        this.state.settings.safety = parseFloat(document.getElementById('setting-safety').value);
        this.state.settings.buffer = parseFloat(document.getElementById('setting-buffer').value);
        this.state.settings.threshold = parseFloat(document.getElementById('setting-threshold').value);

        // Apply to calculator
        NPLCalculator.CONSTANTS.SAFETY_STOCK_RATIO = this.state.settings.safety / 100;
        NPLCalculator.CONSTANTS.BUFFER_DAYS = this.state.settings.buffer;
        NPLCalculator.CONSTANTS.MIN_INVENTORY_THRESHOLD = this.state.settings.threshold / 100;

        this.recalculate();
        alert('Đã lưu cài đặt và tính toán lại.');
    },

    // ============ Export ============
    exportCSV() {
        const items = this.filterItems(this.state.processedData.items);
        const headers = ['Mã NPL', 'Tên NPL', 'Nhóm', 'Tồn kho', 'Nhu cầu', 'Cần mua', 'Leadtime', 'Ngày đặt', 'Trạng thái', 'Giá trị'];
        const rows = items.map(i => [
            i.npl_code, i.npl_name, this.categoryLabel(i.category),
            i.inventory, i.demand, i.purchase, i.leadtime,
            i.orderDate ? this.fmtDate(i.orderDate) : '',
            i.statusInfo.label, i.total_cost
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `npl-plan-${this.state.period}thang-${Date.now()}.csv`;
        link.click();
    },

    // ============ Helpers ============
    fmtNum(n) { return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)); },
    fmtCurrency(n) {
        if (n >= 1e9) return (n/1e9).toFixed(2) + ' tỷ';
        if (n >= 1e6) return (n/1e6).toFixed(1) + ' tr';
        return this.fmtNum(n) + 'đ';
    },
    fmtDate(d) {
        if (!d) return '—';
        const date = new Date(d);
        if (isNaN(date)) return '—';
        return date.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
    },
    categoryLabel(c) {
        return { vai: 'Vải', chi: 'Chỉ', nut: 'Nút - Khóa', phukien: 'Phụ kiện' }[c] || c || '—';
    },

    // ============ Event binding ============
    bindEvents() {
        // Sidebar navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                this.goToPage(item.dataset.page);
            });
        });

        // Jump buttons (in hero, upload result, etc.)
        document.addEventListener('click', e => {
            const jumpEl = e.target.closest('[data-jump]');
            if (jumpEl) {
                e.preventDefault();
                this.goToPage(jumpEl.dataset.jump);
            }
        });

        // Period switch
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.period = parseInt(btn.dataset.period);
                this.recalculate();
            });
        });

        // Theme
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

        // Mobile menu
        document.getElementById('mobile-menu').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Search/filter
        document.getElementById('search').addEventListener('input', e => {
            this.state.filters.search = e.target.value;
            this.renderTable();
        });
        document.getElementById('filter-status').addEventListener('change', e => {
            this.state.filters.status = e.target.value;
            this.renderTable();
        });
        document.getElementById('filter-category').addEventListener('change', e => {
            this.state.filters.category = e.target.value;
            this.renderTable();
        });

        // Export
        document.getElementById('btn-export').addEventListener('click', () => this.exportCSV());

        // Upload zone
        const zone = document.getElementById('upload-zone');
        const input = document.getElementById('file-input');

        zone.addEventListener('click', () => input.click());
        document.getElementById('upload-browse').addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            input.click();
        });
        input.addEventListener('change', e => this.handleFiles(e.target.files));

        ['dragenter', 'dragover'].forEach(ev => {
            zone.addEventListener(ev, e => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(ev => {
            zone.addEventListener(ev, e => {
                e.preventDefault();
                zone.classList.remove('dragover');
            });
        });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            this.handleFiles(e.dataTransfer.files);
        });

        // Settings
        document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
