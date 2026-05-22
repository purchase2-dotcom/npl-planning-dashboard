/**
 * UPLOADER v3 - Parser cho 6 file thực tế
 */
const NPLUploader = (function() {
    const ALLOWED_WAREHOUSES = ['152.0101','152.0102','152.0103','152.0201','152.0401','152.0501','152.0601','152.0701'];
    const ORDER_TOLERANCE = 0.05;
    const SS_NS = 'urn:schemas-microsoft-com:office:spreadsheet';

    function clean(v) { return v === null || v === undefined ? '' : String(v).trim(); }
    function toNum(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return v;
        const n = parseFloat(String(v).replace(/[,\s]/g, ''));
        return isNaN(n) ? 0 : n;
    }
    function toDate(v) {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) return String(v).slice(0, 10);
        const m = String(v).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
        if (typeof v === 'number') {
            const date = new Date((v - 25569) * 86400 * 1000);
            return date.toISOString().slice(0, 10);
        }
        return null;
    }

    function detectFileType(workbook, fileName) {
        const sheets = workbook.SheetNames || [];
        const lowerName = (fileName || '').toLowerCase();
        const allSheetsLower = sheets.map(s => s.toLowerCase());
        if (allSheetsLower.indexOf('data mh') >= 0 ||
            (allSheetsLower.some(s => s.indexOf('nl thay') >= 0) && allSheetsLower.some(s => s.indexOf('pl thay') >= 0))) {
            return 'data_mh';
        }
        if (lowerName.indexOf('tồn kho') >= 0 || lowerName.indexOf('ton kho') >= 0 || lowerName.indexOf('inventory') >= 0) return 'inventory';
        if (lowerName.indexOf('báo cáo so sánh') >= 0 || lowerName.indexOf('bao cao so sanh') >= 0 || lowerName.indexOf('đơn đang') >= 0 || lowerName.indexOf('don dang') >= 0) return 'incoming_orders';
        if (lowerName.indexOf('tổng lượng') >= 0 || lowerName.indexOf('tong luong') >= 0 || lowerName.indexOf('báo cáo nguyên') >= 0) return 'demand_total';
        if (lowerName.indexOf('mỗi sản phẩm') >= 0 || lowerName.indexOf('moi san pham') >= 0 || lowerName.indexOf('nguyên liệu cần thiết') >= 0) return 'demand_per_product';
        if (lowerName.indexOf('khsx') >= 0 || lowerName.indexOf('kế hoạch sản xuất') >= 0) return 'production_plan';
        const firstSheet = workbook.Sheets[sheets[0]];
        const headerRow = XLSX.utils.sheet_to_json(firstSheet, { header: 1, range: 0, defval: null })[0] || [];
        const headers = headerRow.map(h => String(h || '').toLowerCase());
        if (headers.indexOf('mã vật tư') >= 0 && headers.indexOf('mã kho') >= 0) return 'inventory';
        if (headers.indexOf('sl kế hoạch') >= 0 && headers.indexOf('sl thực hiện') >= 0) return 'incoming_orders';
        if (headers.some(h => h.indexOf('cần t') >= 0) && headers.some(h => h.indexOf('thiếu t') >= 0)) return 'demand_total';
        if (headers.some(h => h.indexOf('sl t0') >= 0)) return 'demand_per_product';
        return 'unknown';
    }

    function parseDataMH(workbook) {
        const result = { npl_master: [], substitute_groups: {} };
        const sheet = workbook.Sheets['Data MH'];
        if (sheet) {
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
            rows.forEach(r => {
                const code = clean(r['Mã hàng']);
                if (!code || code === '0') return;
                result.npl_master.push({
                    code: code,
                    name: clean(r['Tên hàng']) || code,
                    full_name: clean(r['Tên đầy đủ NSX']),
                    origin: clean(r['Xuất xứ']),
                    purchase_type: clean(r['Hình thức mua']),
                    item_type: clean(r['Loại hàng']),
                    nature: clean(r['Tính chất hàng']),
                    parent_code: clean(r['Mã gốc']),
                    substitute_group: clean(r['Mã thay thế']),
                    substitute_priority: clean(r['Ưu tiên thay thế']),
                    unit: clean(r['Đơn vị tính']),
                    leadtime_months: toNum(r['Thời gian về kho (tháng)']),
                    shelflife_years: toNum(r['Hạn dùng (năm)']),
                    safety_stock_type: clean(r['Phân loại TH tính TKAT']),
                    safety_stock_qty: toNum(r['Số lượng TKAT']),
                    classification: clean(r['Phân loại dùng chung']),
                    npl_type: clean(r['Phân loại NL']),
                    products_used: clean(r['Sản phẩm sử dụng']),
                    buyer: clean(r['Phụ trách mua hàng']),
                    note: clean(r['Ghi chú'])
                });
            });
        }
        ['NL thay thế', 'PL thay the'].forEach(sheetName => {
            const sh = workbook.Sheets[sheetName];
            if (!sh) return;
            const allRows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });
            let headerRowIdx = -1;
            for (let i = 0; i < Math.min(10, allRows.length); i++) {
                const row = allRows[i] || [];
                if (row.indexOf('Mã hàng') >= 0 && row.some(c => String(c || '').indexOf('nhóm TT') >= 0)) {
                    headerRowIdx = i;
                    break;
                }
            }
            if (headerRowIdx === -1) return;
            const headers = allRows[headerRowIdx];
            const codeIdx = headers.indexOf('Mã hàng');
            const grpIdx = headers.findIndex(h => String(h || '').indexOf('nhóm TT') >= 0);
            const nccIdx = headers.findIndex(h => String(h || '').indexOf('Nơi sản xuất') >= 0 || String(h || '').indexOf('Xuất xứ') >= 0);
            const buyerIdx = headers.findIndex(h => String(h || '').indexOf('Người phụ trách') >= 0);
            for (let i = headerRowIdx + 1; i < allRows.length; i++) {
                const row = allRows[i] || [];
                const code = clean(row[codeIdx]);
                const grp = clean(row[grpIdx]);
                if (!code || !grp) continue;
                if (!result.substitute_groups[grp]) result.substitute_groups[grp] = [];
                result.substitute_groups[grp].push({
                    code: code,
                    origin: nccIdx >= 0 ? clean(row[nccIdx]) : '',
                    buyer: buyerIdx >= 0 ? clean(row[buyerIdx]) : ''
                });
            }
        });
        return result;
    }

    async function parseSpreadsheetXML(file, isInventory) {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('XML không hợp lệ');
        const rows = doc.getElementsByTagNameNS(SS_NS, 'Row');
        const result = [];
        let headers = null;
        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagNameNS(SS_NS, 'Cell');
            const values = [];
            let cellIndex = 1;
            for (let j = 0; j < cells.length; j++) {
                const ssIndex = cells[j].getAttributeNS(SS_NS, 'Index');
                if (ssIndex) cellIndex = parseInt(ssIndex);
                const data = cells[j].getElementsByTagNameNS(SS_NS, 'Data')[0];
                while (values.length < cellIndex - 1) values.push(null);
                values.push(data ? data.textContent : null);
                cellIndex++;
            }
            if (i === 0) {
                headers = values.map(v => clean(v));
                continue;
            }
            const row = {};
            headers.forEach((h, idx) => row[h] = values[idx]);
            if (isInventory) {
                const warehouse = clean(row['Mã kho']);
                if (ALLOWED_WAREHOUSES.indexOf(warehouse) === -1) continue;
                const stock = toNum(row['Tồn cuối']);
                if (stock <= 0) continue;
                result.push({
                    code: clean(row['Mã vật tư']),
                    name: clean(row['Tên vật tư']),
                    warehouse: warehouse,
                    unit: clean(row['Đvt']),
                    lot: clean(row['Mã lô '] || row['Mã lô']),
                    expiry: toDate(row['Hạn dùng']),
                    stock: stock,
                    location: clean(row['Mã vị trí'])
                });
            } else {
                const code = clean(row['Mã hàng']);
                if (!code) continue;
                const planned = toNum(row['Sl kế hoạch']);
                const done = toNum(row['Sl thực hiện']);
                const remaining = planned - done;
                if (planned > 0 && Math.abs(remaining / planned) <= ORDER_TOLERANCE) continue;
                if (remaining <= 0) continue;
                result.push({
                    code: code,
                    name: clean(row['Tên mặt hàng']),
                    supplier: clean(row['Tên khách']),
                    status: clean(row['Trạng thái']),
                    po_number: clean(row['Số ct']),
                    order_date: toDate(row['Ngày ct']),
                    delivery_date: toDate(row['Ngày giao']),
                    planned: planned,
                    done: done,
                    on_order: remaining,
                    unit: clean(row['Đvt'])
                });
            }
        }
        return result;
    }

    function parseProductionPlan(workbook) {
        const sheet = workbook.Sheets['Kế hoạch sản xuất'] || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
        return rows.map(r => {
            const code = clean(r['Mã sản phẩm']);
            if (!code) return null;
            const monthly = [];
            for (let m = 0; m <= 11; m++) monthly.push(toNum(r['SL T' + m]));
            return {
                product_id: code,
                product_name: clean(r['Tên sản phẩm']),
                unit: clean(r['Đơn vị tính']),
                monthly: monthly,
                total: monthly.reduce(function (s, v) { return s + v; }, 0),
                q1: toNum(r['SL Q1']),
                q2: toNum(r['SL Q2']),
                q3: toNum(r['SL Q3'])
            };
        }).filter(Boolean);
    }

    function parseDemandTotal(workbook) {
        const sheet = workbook.Sheets['Báo cáo nguyên phụ liệu'] || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
        return rows.map(r => {
            const code = clean(r['Mã nguyên liệu']);
            if (!code) return null;
            const item = { code: code, name: clean(r['Tên nguyên liệu']), unit: clean(r['Đơn vị']), demand: [] };
            for (let m = 0; m <= 11; m++) {
                item.demand.push({
                    month: m,
                    need: toNum(r['Cần T' + m]),
                    remaining: toNum(r['Còn T' + m]),
                    shortage: toNum(r['Thiếu T' + m])
                });
            }
            return item;
        }).filter(Boolean);
    }

    async function parseFiles(files) {
        const merged = {
            npl_master: [], substitute_groups: {}, inventory_lots: [],
            demand_total: [], demand_per_product: [], production_plan: [], incoming_orders: []
        };
        const fileInfo = [];
        for (let idx = 0; idx < files.length; idx++) {
            const file = files[idx];
            const name = file.name;
            const lowerName = name.toLowerCase();
            try {
                let type = null, count = 0, groups = 0;
                if (lowerName.endsWith('.xml')) {
                    const isInv = lowerName.indexOf('tồn kho') >= 0 || lowerName.indexOf('ton kho') >= 0 || lowerName.indexOf('inventory') >= 0;
                    const isInc = lowerName.indexOf('báo cáo so sánh') >= 0 || lowerName.indexOf('bao cao') >= 0 || lowerName.indexOf('đơn đang') >= 0 || lowerName.indexOf('don dang') >= 0 || lowerName.indexOf('order') >= 0;
                    if (isInv) {
                        const data = await parseSpreadsheetXML(file, true);
                        merged.inventory_lots = merged.inventory_lots.concat(data);
                        type = 'inventory'; count = data.length;
                    } else if (isInc) {
                        const data = await parseSpreadsheetXML(file, false);
                        merged.incoming_orders = merged.incoming_orders.concat(data);
                        type = 'incoming_orders'; count = data.length;
                    } else {
                        const text = await file.text();
                        if (text.indexOf('Mã vật tư') >= 0 && text.indexOf('Mã kho') >= 0) {
                            const f2 = new File([text], file.name, { type: 'text/xml' });
                            const data = await parseSpreadsheetXML(f2, true);
                            merged.inventory_lots = merged.inventory_lots.concat(data);
                            type = 'inventory'; count = data.length;
                        } else if (text.indexOf('Sl kế hoạch') >= 0) {
                            const f2 = new File([text], file.name, { type: 'text/xml' });
                            const data = await parseSpreadsheetXML(f2, false);
                            merged.incoming_orders = merged.incoming_orders.concat(data);
                            type = 'incoming_orders'; count = data.length;
                        } else {
                            throw new Error('XML không nhận diện được loại');
                        }
                    }
                } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                    const buf = await file.arrayBuffer();
                    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
                    type = detectFileType(wb, name);
                    if (type === 'data_mh') {
                        const data = parseDataMH(wb);
                        merged.npl_master = merged.npl_master.concat(data.npl_master);
                        Object.assign(merged.substitute_groups, data.substitute_groups);
                        count = data.npl_master.length;
                        groups = Object.keys(data.substitute_groups).length;
                    } else if (type === 'demand_total') {
                        const data = parseDemandTotal(wb);
                        merged.demand_total = merged.demand_total.concat(data);
                        count = data.length;
                    } else if (type === 'demand_per_product') {
                        const sheet = wb.Sheets[wb.SheetNames[0]];
                        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
                        merged.demand_per_product = merged.demand_per_product.concat(rows);
                        count = rows.length;
                    } else if (type === 'production_plan') {
                        const data = parseProductionPlan(wb);
                        merged.production_plan = merged.production_plan.concat(data);
                        count = data.length;
                    } else {
                        throw new Error('File chưa nhận diện. Sheets: ' + wb.SheetNames.join(', '));
                    }
                } else {
                    throw new Error('Định dạng không hỗ trợ');
                }
                fileInfo.push({ name: name, ok: true, type: type, parsed: { count: count, groups: groups } });
            } catch (err) {
                fileInfo.push({ name: name, ok: false, error: err.message });
            }
        }
        return { data: merged, fileInfo: fileInfo };
    }

    return { parseFiles: parseFiles, ALLOWED_WAREHOUSES: ALLOWED_WAREHOUSES, ORDER_TOLERANCE: ORDER_TOLERANCE };
})();
