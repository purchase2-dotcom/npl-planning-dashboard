/**
 * ============================================================
 *  UPLOADER - Parse Excel/XML/CSV thành cấu trúc dữ liệu chuẩn
 * ============================================================
 *
 *  Hỗ trợ:
 *    - File Excel (.xlsx, .xls) - dùng SheetJS (CDN)
 *    - File XML (.xml) - dùng DOMParser
 *    - File CSV (.csv) - parse thủ công
 *
 *  Auto-detect:
 *    - File gộp 3 sheet: NPL_List, Production_Plan, BOM
 *    - File tách: phát hiện loại theo column header
 *
 *  Output chuẩn: { npl_list, production_plan, bom }
 * ============================================================
 */

const NPLUploader = (function() {

    // Mapping column header → field name
    const FIELD_ALIASES = {
        // NPL List
        'code': 'code', 'mã': 'code', 'ma': 'code', 'mã npl': 'code', 'npl_code': 'code',
        'name': 'name', 'tên': 'name', 'ten': 'name', 'tên npl': 'name',
        'category': 'category', 'nhóm': 'category', 'nhom': 'category', 'loại': 'category', 'loai': 'category',
        'inventory': 'inventory', 'tồn kho': 'inventory', 'ton kho': 'inventory', 'tồn': 'inventory',
        'on_order': 'on_order', 'đang về': 'on_order', 'dang ve': 'on_order', 'đang đặt': 'on_order',
        'leadtime': 'leadtime', 'lead time': 'leadtime', 'lt': 'leadtime',
        'unit_price': 'unit_price', 'đơn giá': 'unit_price', 'don gia': 'unit_price', 'giá': 'unit_price',
        'substitutes': 'substitutes', 'thay thế': 'substitutes', 'thay the': 'substitutes', 'npl thay thế': 'substitutes',

        // Production Plan
        'product_id': 'product_id', 'mã sp': 'product_id', 'ma sp': 'product_id',
        'product_name': 'product_name', 'tên sp': 'product_name', 'ten sp': 'product_name', 'sản phẩm': 'product_name',
        'quantity': 'quantity', 'sản lượng': 'quantity', 'san luong': 'quantity', 'số lượng': 'quantity', 'so luong': 'quantity',
        'start_date': 'start_date', 'ngày bắt đầu': 'start_date', 'ngay bat dau': 'start_date', 'ngày sx': 'start_date',

        // BOM
        'usage_per_unit': 'usage_per_unit', 'định mức': 'usage_per_unit', 'dinh muc': 'usage_per_unit', 'usage': 'usage_per_unit'
    };

    function normalizeKey(key) {
        if (!key) return '';
        return String(key).toLowerCase().trim();
    }

    function mapRow(row) {
        const mapped = {};
        Object.keys(row).forEach(k => {
            const norm = normalizeKey(k);
            const target = FIELD_ALIASES[norm] || norm;
            mapped[target] = row[k];
        });
        return mapped;
    }

    function detectSheetType(rows) {
        if (!rows || rows.length === 0) return null;
        const sample = rows[0];
        const keys = Object.keys(sample).map(normalizeKey);
        const fields = keys.map(k => FIELD_ALIASES[k] || k);

        if (fields.includes('code') && fields.includes('inventory') && fields.includes('leadtime')) {
            return 'npl_list';
        }
        if (fields.includes('product_id') && fields.includes('quantity') && fields.includes('start_date')) {
            return 'production_plan';
        }
        if (fields.includes('product_id') && fields.includes('npl_code') && fields.includes('usage_per_unit')) {
            return 'bom';
        }
        return null;
    }

    /**
     * Parse 1 file Excel
     */
    async function parseExcelFile(file) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const result = { npl_list: null, production_plan: null, bom: null };

        // Duyệt qua các sheet
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
            if (rows.length === 0) return;

            // Map field names
            const mapped = rows.map(mapRow);

            // Detect type ưu tiên theo sheet name, sau đó theo content
            const lowerName = sheetName.toLowerCase();
            let type = null;
            if (lowerName.includes('npl') || lowerName.includes('material')) type = 'npl_list';
            else if (lowerName.includes('plan') || lowerName.includes('production') || lowerName.includes('kế hoạch')) type = 'production_plan';
            else if (lowerName.includes('bom') || lowerName.includes('định mức') || lowerName.includes('dinh muc')) type = 'bom';
            else type = detectSheetType(mapped);

            if (type && !result[type]) {
                result[type] = normalizeData(mapped, type);
            }
        });

        return result;
    }

    /**
     * Parse XML file
     */
    async function parseXMLFile(file) {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');

        const errors = doc.getElementsByTagName('parsererror');
        if (errors.length > 0) {
            throw new Error('File XML không hợp lệ');
        }

        const result = { npl_list: null, production_plan: null, bom: null };

        // NPL List
        const npls = doc.querySelectorAll('NPLList > NPL, NPLs > NPL');
        if (npls.length > 0) {
            result.npl_list = Array.from(npls).map(node => xmlNodeToObj(node));
            result.npl_list = normalizeData(result.npl_list, 'npl_list');
        }

        // Production Plan
        const plans = doc.querySelectorAll('ProductionPlan > Plan, Plans > Plan, ProductionPlan > Item');
        if (plans.length > 0) {
            result.production_plan = Array.from(plans).map(node => xmlNodeToObj(node));
            result.production_plan = normalizeData(result.production_plan, 'production_plan');
        }

        // BOM
        const boms = doc.querySelectorAll('BOM > Item, BOM > Entry, BillOfMaterials > Item');
        if (boms.length > 0) {
            result.bom = Array.from(boms).map(node => xmlNodeToObj(node));
            result.bom = normalizeData(result.bom, 'bom');
        }

        return result;
    }

    function xmlNodeToObj(node) {
        const obj = {};
        Array.from(node.children).forEach(child => {
            obj[child.tagName] = child.textContent.trim();
        });
        return obj;
    }

    /**
     * Parse CSV file
     */
    async function parseCSVFile(file) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return { npl_list: null, production_plan: null, bom: null };

        const parseLine = line => {
            const result = [];
            let cur = '', inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (c === '"') inQuote = !inQuote;
                else if (c === ',' && !inQuote) { result.push(cur); cur = ''; }
                else cur += c;
            }
            result.push(cur);
            return result.map(s => s.replace(/^"|"$/g, '').trim());
        };

        const headers = parseLine(lines[0]);
        const rows = lines.slice(1).map(line => {
            const cells = parseLine(line);
            const obj = {};
            headers.forEach((h, i) => obj[h] = cells[i] || null);
            return mapRow(obj);
        });

        const type = detectSheetType(rows);
        const result = { npl_list: null, production_plan: null, bom: null };
        if (type) result[type] = normalizeData(rows, type);
        return result;
    }

    /**
     * Chuẩn hóa data về đúng kiểu (number, date, array, etc.)
     */
    function normalizeData(rows, type) {
        if (!rows) return null;

        return rows.filter(r => Object.values(r).some(v => v !== null && v !== '')).map(row => {
            const out = { ...row };

            if (type === 'npl_list') {
                out.inventory = parseNum(out.inventory);
                out.on_order = parseNum(out.on_order);
                out.leadtime = parseNum(out.leadtime);
                out.unit_price = parseNum(out.unit_price);
                if (typeof out.substitutes === 'string') {
                    out.substitutes = out.substitutes.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                } else {
                    out.substitutes = out.substitutes || [];
                }
                out.category = (out.category || '').toString().toLowerCase();
            } else if (type === 'production_plan') {
                out.quantity = parseNum(out.quantity);
                out.start_date = parseDate(out.start_date);
            } else if (type === 'bom') {
                out.usage_per_unit = parseNum(out.usage_per_unit);
            }

            return out;
        });
    }

    function parseNum(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return v;
        const n = parseFloat(String(v).replace(/[,\s]/g, ''));
        return isNaN(n) ? 0 : n;
    }

    function parseDate(v) {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        // ISO
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
        // DD/MM/YYYY
        const m = String(v).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        return v;
    }

    /**
     * Main: parse nhiều file và merge
     */
    async function parseFiles(files) {
        const merged = { npl_list: [], production_plan: [], bom: [] };
        const fileInfo = [];

        for (const file of files) {
            const name = file.name.toLowerCase();
            let parsed = null;
            try {
                if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                    parsed = await parseExcelFile(file);
                } else if (name.endsWith('.xml')) {
                    parsed = await parseXMLFile(file);
                } else if (name.endsWith('.csv')) {
                    parsed = await parseCSVFile(file);
                } else {
                    throw new Error('Định dạng không hỗ trợ');
                }

                const counts = [];
                if (parsed.npl_list) { merged.npl_list = merged.npl_list.concat(parsed.npl_list); counts.push(`${parsed.npl_list.length} NPL`); }
                if (parsed.production_plan) { merged.production_plan = merged.production_plan.concat(parsed.production_plan); counts.push(`${parsed.production_plan.length} plan SX`); }
                if (parsed.bom) { merged.bom = merged.bom.concat(parsed.bom); counts.push(`${parsed.bom.length} BOM`); }

                fileInfo.push({ name: file.name, ok: true, counts });
            } catch (err) {
                fileInfo.push({ name: file.name, ok: false, error: err.message });
            }
        }

        // Dedup NPL theo code
        const nplMap = {};
        merged.npl_list.forEach(n => { if (n.code) nplMap[n.code] = n; });
        merged.npl_list = Object.values(nplMap);

        return { data: merged, fileInfo };
    }

    return {
        parseFiles,
        parseExcelFile,
        parseXMLFile,
        parseCSVFile
    };
})();
