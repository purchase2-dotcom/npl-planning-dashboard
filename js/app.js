/**
 * APP v3 - Main controller
 */
const App = {
    state: {
        rawData: null, processed: null, page: 'dashboard',
        filters: { search: '', urgency: 'all', purchase_type: 'all', expiry: 'all' },
        buyer: 'My', theme: localStorage.getItem('theme') || 'light',
        context: localStorage.getItem('context') || 'DTP'
    },
    PAGE_META: {
        dashboard: { title: 'Dashboard', sub: 'Tổng quan kế hoạch mua NPL — Phụ trách: My' },
        upload:    { title: 'Upload dữ liệu', sub: 'Tải file Data MH, Tồn kho, Nhu cầu, Đơn đang về' },
        purchase:  { title: 'Kế hoạch mua', sub: 'Chi tiết NPL cần mua phân theo mức khẩn cấp' },
        expiry:    { title: 'Quản lý hạn dùng', sub: 'NPL có lô gần hết hạn cần ưu tiên dùng' },
        warnings:  { title: 'Cảnh báo', sub: 'Tổng hợp các vấn đề cần xử lý' },
        settings:  { title: 'Cài đặt', sub: 'Cấu hình bộ lọc và mức khẩn' }
    },

    init() {
        this.applyTheme();
        this.applyContext();
        this.bindEvents();
        this.tryLoadStoredData();
    },

    applyContext() {
        document.querySelectorAll('.ctx-btn').forEach(b => b.classList.toggle('active', b.dataset.ctx === this.state.context));
    },

    switchContext(ctx) {
        if (this.state.context === ctx) return;
        this.state.context = ctx;
        localStorage.setItem('context', ctx);
        this.applyContext();
        this.state.rawData = null;
        this.state.processed = null;
        this.tryLoadStoredData();
        if (!this.state.rawData) {
            document.getElementById('data-status').textContent = 'Dữ liệu ' + ctx + ': chưa upload';
            this.clearTables();
        }
    },

    clearTables() {
        ['kpi-critical','kpi-high','kpi-medium','kpi-low','kpi-total','kpi-expired','kpi-exp3','kpi-exp12'].forEach(id => {
            const el = document.getElementById(id); if (el) el.textContent = '--';
        });
        document.getElementById('dashboard-table').innerHTML = '<tr><td colspan="10" class="empty-state">Upload dữ liệu cho ' + this.state.context + ' để bắt đầu</td></tr>';
        document.getElementById('purchase-table').innerHTML = '<tr><td colspan="15" class="empty-state">Chưa có dữ liệu</td></tr>';
        document.getElementById('expiry-table').innerHTML = '<tr><td colspan="9" class="empty-state">Chưa có dữ liệu</td></tr>';
        document.getElementById('warnings-list').innerHTML = '';
        document.getElementById('hero-desc').innerHTML = 'Chưa có dữ liệu cho <strong>' + this.state.context + '</strong>. <a href="#" data-jump="upload" style="color:#fef08a;text-decoration:underline">Upload 5 file</a> để bắt đầu.';
        document.getElementById('chart-urgency').innerHTML = '<div style="color:var(--text-faint);font-size:13px">Chưa có dữ liệu</div>';
        document.getElementById('chart-topvalue').innerHTML = '<div style="color:var(--text-faint);font-size:13px">Chưa có dữ liệu</div>';
    },

    storageKey() {
        return 'npl_raw_data_' + this.state.context;
    },

    tryLoadStoredData() {
        try {
            const stored = localStorage.getItem(this.storageKey());
            if (stored) {
                this.state.rawData = JSON.parse(stored);
                this.recalculate();
                document.getElementById('data-status').textContent = 'Dữ liệu ' + this.state.context + ': đã load';
            }
        } catch (e) {}
    },

    recalculate() {
        if (!this.state.rawData) return;
        this.state.processed = NPLCalculator.processAll(this.state.rawData, { buyerFilter: this.state.buyer });
        this.render();
    },

    render() {
        if (!this.state.processed) return;
        this.renderKPIs();
        this.renderHero();
        this.renderDashboard();
        this.renderPurchase();
        this.renderExpiry();
        this.renderWarnings();
        this.renderCharts();
        this.populateFilters();
    },

    renderCharts() {
        const items = this.state.processed.items;
        // Donut: urgency
        const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, OK: 0 };
        items.forEach(i => counts[i.urgency.level]++);
        const colors = { CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#3b82f6', LOW: '#10b981', OK: '#94a3b8' };
        const labels = { CRITICAL: 'Cực gấp', HIGH: 'Cao', MEDIUM: 'TB', LOW: 'Thấp', OK: 'Đủ' };
        const total = items.length || 1;
        let acc = 0;
        const segments = Object.keys(counts).filter(k => counts[k] > 0).map(k => {
            const start = acc / total * 360;
            acc += counts[k];
            const end = acc / total * 360;
            return { key: k, start: start, end: end, count: counts[k], color: colors[k] };
        });
        const segPaths = segments.map(s => {
            const cx = 60, cy = 60, r = 50, ri = 30;
            const a1 = (s.start - 90) * Math.PI / 180;
            const a2 = (s.end - 90) * Math.PI / 180;
            const large = s.end - s.start > 180 ? 1 : 0;
            const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
            const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
            const xi1 = cx + ri * Math.cos(a1), yi1 = cy + ri * Math.sin(a1);
            const xi2 = cx + ri * Math.cos(a2), yi2 = cy + ri * Math.sin(a2);
            return '<path d="M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' L ' + xi2 + ' ' + yi2 + ' A ' + ri + ' ' + ri + ' 0 ' + large + ' 0 ' + xi1 + ' ' + yi1 + ' Z" fill="' + s.color + '"/>';
        }).join('');
        const legend = Object.keys(counts).map(k =>
            '<div class="legend-row"><span class="legend-dot" style="background:' + colors[k] + '"></span><span>' + labels[k] + '</span><span class="legend-value">' + counts[k] + '</span></div>'
        ).join('');
        document.getElementById('chart-urgency').innerHTML =
            '<svg width="120" height="120" viewBox="0 0 120 120">' + segPaths + '<text x="60" y="58" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">' + items.length + '</text><text x="60" y="74" text-anchor="middle" font-size="10" fill="var(--text-muted)">NPL</text></svg>' +
            '<div class="donut-legend">' + legend + '</div>';

        // Bar: top 10 value
        const withCost = items.filter(i => i.total_cost_9m > 0).sort((a, b) => b.total_cost_9m - a.total_cost_9m).slice(0, 10);
        const maxVal = withCost.length ? withCost[0].total_cost_9m : 1;
        const fmtMoney = n => n >= 1e9 ? (n/1e9).toFixed(2) + ' tỷ' : n >= 1e6 ? (n/1e6).toFixed(1) + ' tr' : Math.round(n/1000) + 'K';
        if (withCost.length === 0) {
            document.getElementById('chart-topvalue').innerHTML = '<div style="color:var(--text-faint);font-size:13px">Chưa có NPL có giá trị mua</div>';
        } else {
            document.getElementById('chart-topvalue').innerHTML = withCost.map(i =>
                '<div class="bar-row" onclick="App.showDetail(\'' + i.code + '\')" style="cursor:pointer"><span class="bar-label">' + i.code + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (i.total_cost_9m / maxVal * 100) + '%"></div></div><span class="bar-value">' + fmtMoney(i.total_cost_9m) + '</span></div>'
            ).join('');
        }
    },


    renderKPIs() {
        const s = this.state.processed.stats;
        document.getElementById('kpi-critical').textContent = s.critical;
        document.getElementById('kpi-high').textContent = s.high;
        document.getElementById('kpi-medium').textContent = s.medium;
        document.getElementById('kpi-low').textContent = s.low;
        document.getElementById('kpi-total').textContent = s.total_npl;
        document.getElementById('kpi-expired').textContent = s.expired;
        document.getElementById('kpi-exp3').textContent = s.expiring_3m;
        document.getElementById('kpi-exp12').textContent = s.expiring_6m + s.expiring_12m;
        document.getElementById('nav-purchase-count').textContent = s.critical + s.high;
        document.getElementById('nav-expiry-count').textContent = s.expired + s.expiring_3m;
        document.getElementById('nav-warning-count').textContent = this.state.processed.warnings.length;
    },

    renderHero() {
        const s = this.state.processed.stats;
        document.getElementById('hero-desc').innerHTML =
            'Đã tính xong kế hoạch cho <strong>' + s.total_npl + '</strong> NPL của bạn. ' +
            '<strong>' + s.critical + '</strong> cực gấp · <strong>' + s.high + '</strong> mức cao · <strong>' + s.expired + '</strong> đã hết hạn.';
    },

    renderDashboard() {
        const items = this.state.processed.items.slice()
            .sort((a, b) => b.urgency.score - a.urgency.score || b.purchase_9m - a.purchase_9m)
            .slice(0, 10);
        const tbody = document.getElementById('dashboard-table');
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Không có NPL cần mua</td></tr>';
            return;
        }
        const self = this;
        tbody.innerHTML = items.map(i =>
            '<tr onclick="App.showDetail(\'' + i.code + '\')" style="cursor:pointer">' +
            '<td><span class="npl-code">' + i.code + '</span></td>' +
            '<td>' + self.escape(i.name || '—') + '</td>' +
            '<td>' + (i.classification || '—') + '</td>' +
            '<td class="text-right">' + self.fmt(i.total_family_inventory) + '</td>' +
            '<td class="text-right">' + self.fmt(i.shortage_9m) + '</td>' +
            '<td class="text-right"><strong>' + self.fmt(i.purchase_t0) + '</strong></td>' +
            '<td class="text-right">' + self.fmt(i.purchase_3m) + '</td>' +
            '<td class="text-right">' + self.fmt(i.purchase_6m) + '</td>' +
            '<td class="text-right">' + self.fmt(i.purchase_9m) + '</td>' +
            '<td>' + self.urgencyPill(i.urgency) + '</td>' +
            '</tr>'
        ).join('');
    },

    renderPurchase() {
        const items = this.filterItems(this.state.processed.items)
            .sort((a, b) => b.urgency.score - a.urgency.score || b.purchase_9m - a.purchase_9m);
        const tbody = document.getElementById('purchase-table');
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="15" class="empty-state">Không có NPL phù hợp bộ lọc</td></tr>';
            return;
        }
        const self = this;
        tbody.innerHTML = items.map(i => {
            const famLabel = i.total_family_inventory > i.self_inventory ?
                ' <small style="color:var(--text-faint)">(riêng ' + self.fmt(i.self_inventory) + ')</small>' : '';
            return '<tr onclick="App.showDetail(\'' + i.code + '\')" style="cursor:pointer">' +
                '<td><span class="npl-code">' + i.code + '</span></td>' +
                '<td>' + self.escape(i.name || '—') + '</td>' +
                '<td>' + (i.unit || '—') + '</td>' +
                '<td class="text-right">' + self.fmt(i.total_family_inventory) + famLabel + '</td>' +
                '<td class="text-right">' + self.fmt(i.incoming_total) + '</td>' +
                '<td class="text-right">' + self.fmt(i.monthly_demand[0]) + '</td>' +
                '<td class="text-right"><strong style="color:' + (i.purchase_t0 > 0 ? 'var(--danger)' : 'inherit') + '">' + self.fmt(i.purchase_t0) + '</strong></td>' +
                '<td class="text-right">' + self.fmt(i.purchase_3m) + '</td>' +
                '<td class="text-right">' + self.fmt(i.purchase_6m) + '</td>' +
                '<td class="text-right">' + self.fmt(i.purchase_9m) + '</td>' +
                '<td class="text-center">' + (i.leadtime_months || '—') + '</td>' +
                '<td class="text-center">' + (i.shelflife_years || '—') + '</td>' +
                '<td>' + (i.purchase_type || '—') + '</td>' +
                '<td>' + (i.substitute_group ? '<span class="substitute-tag">' + i.substitute_group + '</span>' : '—') + '</td>' +
                '<td>' + self.urgencyPill(i.urgency) + '</td>' +
                '</tr>';
        }).join('');
    },

    fmtMoney(n) {
        if (!n) return '0';
        if (n >= 1e9) return (n/1e9).toFixed(2) + ' tỷ';
        if (n >= 1e6) return (n/1e6).toFixed(1) + ' tr';
        return new Intl.NumberFormat('vi-VN').format(Math.round(n));
    },

    renderExpiry() {
        const f = this.state.filters.expiry;
        let items = this.state.processed.items.filter(i =>
            i.expiry.expired + i.expiry.expiring_3m + i.expiry.expiring_6m + i.expiry.expiring_12m > 0);
        if (f === 'expired') items = items.filter(i => i.expiry.expired > 0);
        else if (f === '3m') items = items.filter(i => i.expiry.expiring_3m > 0);
        else if (f === '6m') items = items.filter(i => i.expiry.expiring_6m > 0);
        else if (f === '12m') items = items.filter(i => i.expiry.expiring_12m > 0);
        items.sort((a, b) => b.expiry.expired - a.expiry.expired || b.expiry.expiring_3m - a.expiry.expiring_3m);
        const tbody = document.getElementById('expiry-table');
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Không có NPL phù hợp</td></tr>';
            return;
        }
        const self = this;
        tbody.innerHTML = items.map(i => {
            const demand6m = i.monthly_demand.slice(0, 6).reduce((s, v) => s + v, 0);
            const expSoon = i.expiry.expiring_3m + i.expiry.expiring_6m;
            const risk = expSoon > demand6m ? '⚠️ Hết hạn trước khi dùng hết' : '✓ Ổn';
            const riskColor = expSoon > demand6m ? 'var(--danger)' : 'var(--success)';
            return '<tr onclick="App.showDetail(\'' + i.code + '\')" style="cursor:pointer">' +
                '<td><span class="npl-code">' + i.code + '</span></td>' +
                '<td>' + self.escape(i.name || '—') + '</td>' +
                '<td class="text-right" style="color:' + (i.expiry.expired > 0 ? 'var(--danger)' : 'inherit') + '">' + self.fmt(i.expiry.expired) + '</td>' +
                '<td class="text-right" style="color:' + (i.expiry.expiring_3m > 0 ? 'var(--warning)' : 'inherit') + '">' + self.fmt(i.expiry.expiring_3m) + '</td>' +
                '<td class="text-right">' + self.fmt(i.expiry.expiring_6m) + '</td>' +
                '<td class="text-right">' + self.fmt(i.expiry.expiring_12m) + '</td>' +
                '<td class="text-right">' + self.fmt(i.self_inventory) + '</td>' +
                '<td class="text-right">' + self.fmt(demand6m) + '</td>' +
                '<td><span style="color:' + riskColor + '">' + risk + '</span></td>' +
                '</tr>';
        }).join('');
    },

    renderWarnings() {
        const list = this.state.processed.warnings;
        const c = document.getElementById('warnings-list');
        if (list.length === 0) {
            c.innerHTML = '<div class="warning-card info"><div class="warning-icon">✓</div><div class="warning-content"><div class="warning-title">Mọi thứ đều ổn</div><div class="warning-desc">Không có cảnh báo nào.</div></div></div>';
            return;
        }
        const icons = { critical: '🔴', warning: '⚠️', info: 'ℹ️' };
        c.innerHTML = list.map(w =>
            '<div class="warning-card ' + w.level + '">' +
            '<div class="warning-icon">' + (icons[w.level] || 'ℹ️') + '</div>' +
            '<div class="warning-content"><div class="warning-title">' + w.title + '</div>' +
            '<div class="warning-desc">' + w.desc + '</div></div></div>'
        ).join('');
    },

    populateFilters() {
        const types = Array.from(new Set(this.state.processed.items.map(i => i.purchase_type).filter(Boolean)));
        const sel = document.getElementById('filter-purchase-type');
        const current = sel.value;
        sel.innerHTML = '<option value="all">Tất cả hình thức mua</option>' +
            types.map(t => '<option value="' + t + '">' + t + '</option>').join('');
        sel.value = current;
    },

    showDetail(code) {
        const item = this.state.processed.items.find(i => i.code === code) ||
                     this.state.processed.all_items.find(i => i.code === code);
        if (!item) return;
        document.getElementById('modal-title').textContent = item.code + ' — ' + (item.name || '—');
        const body = document.getElementById('modal-body');
        const self = this;
        let html = '';
        html += '<div class="detail-section"><h4>Thông tin cơ bản</h4><div class="detail-grid">';
        html += '<div><span class="detail-label">Phụ trách</span><span class="detail-value">' + (item.buyer || '—') + '</span></div>';
        html += '<div><span class="detail-label">Xuất xứ</span><span class="detail-value">' + (item.origin || '—') + '</span></div>';
        html += '<div><span class="detail-label">Hình thức mua</span><span class="detail-value">' + (item.purchase_type || '—') + '</span></div>';
        html += '<div><span class="detail-label">Đơn vị</span><span class="detail-value">' + (item.unit || '—') + '</span></div>';
        html += '<div><span class="detail-label">Thời gian về (tháng)</span><span class="detail-value">' + (item.leadtime_months || '—') + '</span></div>';
        html += '<div><span class="detail-label">Hạn dùng (năm)</span><span class="detail-value">' + (item.shelflife_years || '—') + '</span></div>';
        html += '<div><span class="detail-label">Nhóm thay thế</span><span class="detail-value">' + (item.substitute_group || '—') + '</span></div>';
        html += '<div><span class="detail-label">Mức khẩn cấp</span><span class="detail-value">' + this.urgencyPill(item.urgency) + '</span></div>';
        html += '</div></div>';

        // Products using this NPL (from file 3 demand_per_product)
        const products = item.products_used_list || [];
        html += '<div class="detail-section"><h4>Sản phẩm sử dụng NPL này / nhóm thay thế (' + products.length + ' SP)</h4>';
        if (products.length === 0) {
            html += '<p style="font-size:13px;color:var(--text-muted)">Chưa có thông tin. Upload file <strong>"3. Nhu cầu cần NPL từ T0-T11 (NPL cần cho mỗi sản phẩm)"</strong> để hệ thống tự cross-reference theo cột "Mã SP".</p>';
        } else {
            products.sort((a, b) => b.total - a.total);
            // Table: SP × monthly + quarterly + total + via
            html += '<div style="overflow-x:auto"><table class="data-table" style="margin-top:8px;font-size:12px">';
            html += '<thead><tr><th rowspan="2">Mã SP</th><th rowspan="2">Tên sản phẩm</th><th colspan="12" class="text-center">Số lượng cần dùng theo tháng</th><th colspan="4" class="text-center">Theo quý</th><th rowspan="2" class="text-right">Tổng 12T</th><th rowspan="2">Mã NPL family</th></tr>';
            html += '<tr>';
            for (let m = 0; m <= 11; m++) html += '<th class="text-right" style="font-size:10px">T' + m + '</th>';
            html += '<th class="text-right" style="font-size:10px">Q1</th><th class="text-right" style="font-size:10px">Q2</th><th class="text-right" style="font-size:10px">Q3</th><th class="text-right" style="font-size:10px">Q4</th>';
            html += '</tr></thead><tbody>';
            html += products.map(p => {
                const viaList = (p.via || []).map(v => '<span class="substitute-tag" style="font-size:10px">' + v + (v === item.code ? '★' : '') + '</span>').join('');
                let row = '<tr><td><span class="npl-code">' + p.code + '</span></td><td>' + self.escape(p.name || '—') + '</td>';
                (p.monthly || []).forEach(v => {
                    row += '<td class="text-right" style="' + (v > 0 ? 'color:var(--primary);font-weight:600' : 'color:var(--text-faint)') + '">' + (v ? self.fmt(v) : '—') + '</td>';
                });
                row += '<td class="text-right">' + self.fmt(p.q1) + '</td>';
                row += '<td class="text-right">' + self.fmt(p.q2) + '</td>';
                row += '<td class="text-right">' + self.fmt(p.q3) + '</td>';
                row += '<td class="text-right">' + self.fmt(p.q4) + '</td>';
                row += '<td class="text-right"><strong>' + self.fmt(p.total) + '</strong></td>';
                row += '<td>' + viaList + '</td></tr>';
                return row;
            }).join('');
            html += '</tbody></table></div>';
        }
        html += '</div>';

        // Calculate first demand month
        const firstDemandMonth = item.monthly_demand.findIndex(d => d > 0);
        const firstDemandLabel = firstDemandMonth < 0 ? 'không có' : 'T' + firstDemandMonth;

        // Cumulative demand for FEFO analysis
        const cumDemand = [];
        let cum = 0;
        item.monthly_demand.forEach(d => { cum += d; cumDemand.push(cum); });

        html += '<div class="detail-section"><h4>Family Inventory + cảnh báo hạn dùng (' + item.family_codes.length + ' mã)</h4>';
        html += '<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Nhu cầu bắt đầu từ: <strong>' + firstDemandLabel + '</strong></p>';
        html += '<table class="data-table" style="margin-top:4px;font-size:12px"><thead><tr><th>Mã</th><th>Lô</th><th>Kho</th><th class="text-right">SL</th><th>Hạn dùng</th><th>Còn (tháng)</th><th>Cảnh báo</th></tr></thead><tbody>';
        // Collect all lots from family (FEFO sort: earliest expiry first)
        const allLots = [];
        item.family_breakdown.forEach(b => {
            (b.lots || []).forEach(lot => {
                const monthsLeft = lot.expiry ? Math.floor((new Date(lot.expiry) - new Date()) / (1000*60*60*24*30)) : 999;
                allLots.push({ ...lot, fam_code: b.code, fam_name: b.name, is_self: b.is_self, months_left: monthsLeft });
            });
        });
        allLots.sort((a, b) => a.months_left - b.months_left);
        // Running cumulative usage
        let used = 0;
        allLots.forEach(lot => {
            let warning = '<span style="color:var(--success)">✓ Dùng kịp</span>';
            let rowStyle = '';
            if (lot.months_left < 0) {
                warning = '<span style="color:var(--danger);font-weight:700">⛔ Đã hết hạn — thanh lý</span>';
                rowStyle = 'background:#fee2e2';
            } else if (firstDemandMonth < 0) {
                warning = '<span style="color:var(--warning)">⚠️ Không có KHSX — sẽ hết hạn không dùng</span>';
                rowStyle = 'background:#fef3c7';
            } else if (lot.months_left < firstDemandMonth) {
                // Lô hết hạn TRƯỚC khi có nhu cầu → cảnh báo gấp
                warning = '<span style="color:var(--danger);font-weight:700">🚨 Hết hạn T' + lot.months_left + ' nhưng SX bắt đầu ' + firstDemandLabel + ' → ĐẨY LỊCH SX SỚM hoặc lô sẽ bị bỏ (' + self.fmt(lot.stock) + ' ' + (item.unit||'') + ')</span>';
                rowStyle = 'background:#fee2e2';
            } else {
                // FEFO: tính cumulative đến tháng hết hạn
                const demandByExpiry = lot.months_left < 12 ? cumDemand[lot.months_left] : cumDemand[11];
                if (used >= demandByExpiry) {
                    // Lô này sẽ KHÔNG được dùng vì cumulative demand đã được phục vụ bằng lô trước
                    const wasted = lot.stock;
                    warning = '<span style="color:var(--warning);font-weight:700">⚠️ Lô trước đã đủ - lô này dư '+self.fmt(wasted)+', hết hạn T' + lot.months_left + ' → ĐẨY LỊCH SX SỚM</span>';
                    rowStyle = 'background:#fef3c7';
                } else if (used + lot.stock > demandByExpiry) {
                    // Lô dùng được 1 phần, phần còn lại sẽ hết hạn
                    const wasted = used + lot.stock - demandByExpiry;
                    warning = '<span style="color:var(--warning)">⚠️ Dùng được ' + self.fmt(demandByExpiry - used) + ', dư ' + self.fmt(wasted) + ' sẽ hết hạn T' + lot.months_left + '</span>';
                    rowStyle = 'background:#fef9c3';
                } else if (lot.months_left <= 3) {
                    warning = '<span style="color:var(--warning)">⏰ Còn ' + lot.months_left + ' tháng - ưu tiên dùng</span>';
                }
                used += lot.stock;
            }
            const expDate = lot.expiry ? new Date(lot.expiry).toLocaleDateString('vi-VN') : '—';
            html += '<tr style="' + rowStyle + '">';
            html += '<td><span class="npl-code">' + lot.fam_code + '</span>' + (lot.is_self ? '★' : '') + '</td>';
            html += '<td>' + (lot.lot || '—') + '</td>';
            html += '<td>' + (lot.warehouse || '—') + '</td>';
            html += '<td class="text-right">' + self.fmt(lot.stock) + '</td>';
            html += '<td>' + expDate + '</td>';
            html += '<td>' + (lot.months_left < 0 ? 'Đã hết' : lot.months_left + 'T') + '</td>';
            html += '<td>' + warning + '</td>';
            html += '</tr>';
        });
        if (allLots.length === 0) html += '<tr><td colspan="7" class="empty-state">Không có lô tồn nào</td></tr>';
        html += '</tbody></table>';
        html += '<p style="margin-top:8px;font-size:13px"><strong>Tổng family: ' + self.fmt(item.total_family_inventory) + ' ' + (item.unit || '') + '</strong> · Tổng nhu cầu 12T: <strong>' + self.fmt(cumDemand[11]) + '</strong></p></div>';

        html += '<div class="detail-section"><h4>Nhu cầu & cân đối theo tháng</h4>';
        html += '<table class="data-table" style="margin-top:8px"><thead><tr><th>Tháng</th>';
        for (let m = 0; m < 12; m++) html += '<th class="text-right">T' + m + '</th>';
        html += '</tr></thead><tbody>';
        html += '<tr><td>Nhu cầu</td>' + item.monthly_demand.map(d => '<td class="text-right">' + self.fmt(d) + '</td>').join('') + '</tr>';
        html += '<tr><td>Cân đối</td>' + item.balance_by_month.map(b => '<td class="text-right" style="color:' + (b < 0 ? 'var(--danger)' : 'var(--success)') + '">' + self.fmt(b) + '</td>').join('') + '</tr>';
        html += '<tr><td>Thiếu</td>' + item.shortage_by_month.map(s => '<td class="text-right" style="color:' + (s > 0 ? 'var(--danger)' : 'inherit') + '">' + (s > 0 ? self.fmt(s) : '—') + '</td>').join('') + '</tr>';
        html += '</tbody></table></div>';

        if (item.incoming_pos && item.incoming_pos.length > 0) {
            html += '<div class="detail-section"><h4>Đơn đang về (' + item.incoming_pos.length + ' PO · tổng ' + self.fmt(item.incoming_total) + ')</h4>';
            html += '<table class="data-table" style="margin-top:8px"><thead><tr><th>Số PO</th><th>NCC</th><th>Ngày giao</th><th class="text-right">Kế hoạch</th><th class="text-right">Đã nhận</th><th class="text-right">Còn lại</th><th>Trạng thái</th></tr></thead><tbody>';
            item.incoming_pos.forEach(po => {
                html += '<tr><td>' + po.po_number + '</td><td>' + self.escape(po.supplier || '—') + '</td><td>' + (po.delivery_date || '—') + '</td>' +
                        '<td class="text-right">' + self.fmt(po.planned) + '</td><td class="text-right">' + self.fmt(po.done) + '</td>' +
                        '<td class="text-right"><strong>' + self.fmt(po.on_order) + '</strong></td><td>' + (po.status || '—') + '</td></tr>';
            });
            html += '</tbody></table></div>';
        }

        if (item.expiry && item.expiry.lots && item.expiry.lots.length > 0) {
            html += '<div class="detail-section"><h4>Lô sắp/đã hết hạn</h4>';
            html += '<table class="data-table" style="margin-top:8px"><thead><tr><th>Mã lô</th><th>Kho</th><th class="text-right">Tồn</th><th>Hạn dùng</th><th>Còn (tháng)</th></tr></thead><tbody>';
            item.expiry.lots.forEach(l => {
                const color = l.months_left < 0 ? 'var(--danger)' : l.months_left <= 3 ? 'var(--warning)' : 'inherit';
                const lbl = l.months_left < 0 ? 'Đã hết hạn' : l.months_left + ' tháng';
                html += '<tr><td>' + l.lot + '</td><td>' + l.warehouse + '</td><td class="text-right">' + self.fmt(l.stock) + '</td><td>' + l.expiry + '</td><td style="color:' + color + '">' + lbl + '</td></tr>';
            });
            html += '</tbody></table></div>';
        }

        body.innerHTML = html;
        document.getElementById('modal-backdrop').hidden = false;
    },

    closeDetail() { document.getElementById('modal-backdrop').hidden = true; },

    filterItems(items) {
        const f = this.state.filters;
        return items.filter(i => {
            if (f.search) {
                const q = f.search.toLowerCase();
                if (i.code.toLowerCase().indexOf(q) === -1 && (i.name || '').toLowerCase().indexOf(q) === -1) return false;
            }
            if (f.urgency !== 'all' && i.urgency.level !== f.urgency) return false;
            if (f.purchase_type !== 'all' && i.purchase_type !== f.purchase_type) return false;
            return true;
        });
    },

    goToPage(page) {
        this.state.page = page;
        document.querySelectorAll('.page').forEach(p => { p.hidden = p.dataset.page !== page; });
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
        const meta = this.PAGE_META[page];
        if (meta) {
            document.getElementById('page-title').textContent = meta.title;
            document.getElementById('page-subtitle').textContent = meta.sub;
        }
        document.getElementById('sidebar').classList.remove('open');
    },

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

    async handleFiles(files) {
        if (!files || files.length === 0) return;
        const resultEl = document.getElementById('upload-result');
        resultEl.hidden = false;
        resultEl.classList.remove('error');
        resultEl.innerHTML = '<strong>Đang xử lý...</strong> Đọc và phân tích file.';
        try {
            const out = await NPLUploader.parseFiles(Array.from(files));
            if (this.state.rawData) {
                ['npl_master', 'inventory_lots', 'demand_total', 'incoming_orders', 'production_plan'].forEach(k => {
                    if (out.data[k] && out.data[k].length) this.state.rawData[k] = out.data[k];
                });
                if (out.data.substitute_groups && Object.keys(out.data.substitute_groups).length) {
                    this.state.rawData.substitute_groups = out.data.substitute_groups;
                }
            } else {
                this.state.rawData = out.data;
            }
            this.recalculate();
            try { localStorage.setItem(this.storageKey(), JSON.stringify(this.state.rawData)); } catch (e) {}
            const summary = out.fileInfo.map(f => {
                if (f.ok) {
                    const counts = [];
                    if (f.parsed && f.parsed.count) counts.push(f.parsed.count + ' dòng');
                    if (f.parsed && f.parsed.groups) counts.push(f.parsed.groups + ' nhóm');
                    return '<div class="file-row ok">✓ <strong>' + f.name + '</strong> — ' + f.type + ' (' + counts.join(', ') + ')</div>';
                }
                return '<div class="file-row error">✗ <strong>' + f.name + '</strong> — ' + f.error + '</div>';
            }).join('');
            resultEl.innerHTML = '<strong>Upload thành công!</strong>' + summary + '<br><a href="#" data-jump="dashboard" style="color:inherit;text-decoration:underline">Sang Dashboard →</a>';
            document.getElementById('data-status').textContent = 'Dữ liệu ' + this.state.context + ': ' + this.state.rawData.npl_master.length + ' NPL';
            this.renderDataSummary();
        } catch (err) {
            resultEl.classList.add('error');
            resultEl.innerHTML = '<strong>Lỗi:</strong> ' + err.message;
        }
    },

    renderDataSummary() {
        const d = this.state.rawData;
        document.getElementById('data-summary').hidden = false;
        document.getElementById('summary-grid').innerHTML =
            '<div class="summary-card"><div class="summary-num">' + (d.npl_master || []).length + '</div><div class="summary-label">NPL master</div></div>' +
            '<div class="summary-card"><div class="summary-num">' + Object.keys(d.substitute_groups || {}).length + '</div><div class="summary-label">Nhóm thay thế</div></div>' +
            '<div class="summary-card"><div class="summary-num">' + (d.inventory_lots || []).length + '</div><div class="summary-label">Lô tồn kho</div></div>' +
            '<div class="summary-card"><div class="summary-num">' + (d.demand_total || []).length + '</div><div class="summary-label">NPL có nhu cầu</div></div>' +
            '<div class="summary-card"><div class="summary-num">' + (d.incoming_orders || []).length + '</div><div class="summary-label">PO đang về</div></div>' +
            '<div class="summary-card"><div class="summary-num">' + (d.production_plan || []).length + '</div><div class="summary-label">SP trong KHSX</div></div>';
    },

    exportCSV() {
        const items = this.filterItems(this.state.processed.items);
        const headers = ['Mã', 'Tên', 'ĐVT', 'Phụ trách', 'Tồn family', 'Tồn riêng', 'Đang về', 'Cần T0', 'Mua T0', 'Mua 3T', 'Mua 6T', 'Mua 9T', 'Thời gian về', 'Hạn dùng', 'Hình thức', 'Nhóm thay thế', 'Mức khẩn'];
        const rows = items.map(i => [
            i.code, i.name, i.unit, i.buyer, i.total_family_inventory, i.self_inventory, i.incoming_total,
            i.monthly_demand[0], i.purchase_t0, i.purchase_3m, i.purchase_6m, i.purchase_9m,
            i.leadtime_months, i.shelflife_years, i.purchase_type, i.substitute_group, i.urgency.label
        ]);
        const csv = [headers].concat(rows).map(r => r.map(c => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'npl-purchase-plan-' + Date.now() + '.csv';
        link.click();
    },

    saveSettings() {
        this.state.buyer = document.getElementById('setting-buyer').value.trim() || null;
        NPLCalculator.CONFIG.URGENCY_HIGH_MONTHS = parseInt(document.getElementById('setting-high').value);
        NPLCalculator.CONFIG.URGENCY_MED_MONTHS = parseInt(document.getElementById('setting-medium').value);
        this.recalculate();
        alert('Đã lưu và tính lại.');
    },

    fmt(n) {
        if (n === null || n === undefined || isNaN(n)) return '0';
        return new Intl.NumberFormat('vi-VN').format(Math.round(n));
    },
    escape(s) {
        return String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    },
    urgencyPill(u) {
        const colors = { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'medium', LOW: 'success', OK: 'ok' };
        const icons = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢', OK: '✓' };
        return '<span class="status-pill ' + colors[u.level] + '">' + icons[u.level] + ' ' + u.label + '</span>';
    },

    bindEvents() {
        const self = this;
        document.querySelectorAll('.nav-item').forEach(el =>
            el.addEventListener('click', e => { e.preventDefault(); self.goToPage(el.dataset.page); }));
        document.addEventListener('click', e => {
            const j = e.target.closest('[data-jump]');
            if (j) { e.preventDefault(); self.goToPage(j.dataset.jump); }
        });
        document.getElementById('theme-toggle').addEventListener('click', () => self.toggleTheme());
        document.querySelectorAll('.ctx-btn').forEach(b => b.addEventListener('click', () => self.switchContext(b.dataset.ctx)));
        document.getElementById('mobile-menu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
        document.getElementById('search').addEventListener('input', e => { self.state.filters.search = e.target.value; self.renderPurchase(); });
        document.getElementById('filter-urgency').addEventListener('change', e => { self.state.filters.urgency = e.target.value; self.renderPurchase(); });
        document.getElementById('filter-purchase-type').addEventListener('change', e => { self.state.filters.purchase_type = e.target.value; self.renderPurchase(); });
        document.getElementById('filter-expiry').addEventListener('change', e => { self.state.filters.expiry = e.target.value; self.renderExpiry(); });
        document.getElementById('btn-export').addEventListener('click', () => self.exportCSV());
        const zone = document.getElementById('upload-zone');
        const input = document.getElementById('file-input');
        zone.addEventListener('click', () => input.click());
        document.getElementById('upload-browse').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); input.click(); });
        input.addEventListener('change', e => self.handleFiles(e.target.files));
        ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('dragover'); }));
        ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('dragover'); }));
        zone.addEventListener('drop', e => { e.preventDefault(); self.handleFiles(e.dataTransfer.files); });
        document.getElementById('btn-save-settings').addEventListener('click', () => self.saveSettings());
        document.getElementById('modal-close').addEventListener('click', () => self.closeDetail());
        document.getElementById('modal-backdrop').addEventListener('click', e => { if (e.target.id === 'modal-backdrop') self.closeDetail(); });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
