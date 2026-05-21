/**
 * CALCULATOR v3 - Logic kế hoạch mua NPL
 */
const NPLCalculator = (function() {
    const CONFIG = {
        URGENCY_T0_MONTHS: 0,
        URGENCY_HIGH_MONTHS: 2,
        URGENCY_MED_MONTHS: 5,
        URGENCY_LOW_MONTHS: 8,
        EXPIRY_WARN_MONTHS: [3, 6, 12],
        BUYER_FILTER: 'My'
    };

    function buildFamilyMap(npl_master, substitute_groups) {
        const codeToGroups = {};
        Object.keys(substitute_groups).forEach(grp => {
            substitute_groups[grp].forEach(m => {
                if (!codeToGroups[m.code]) codeToGroups[m.code] = [];
                codeToGroups[m.code].push(grp);
            });
        });
        npl_master.forEach(m => {
            if (m.substitute_group) {
                if (!codeToGroups[m.code]) codeToGroups[m.code] = [];
                if (codeToGroups[m.code].indexOf(m.substitute_group) === -1) codeToGroups[m.code].push(m.substitute_group);
                if (!substitute_groups[m.substitute_group]) substitute_groups[m.substitute_group] = [];
                if (!substitute_groups[m.substitute_group].find(x => x.code === m.code)) {
                    substitute_groups[m.substitute_group].push({ code: m.code, origin: m.origin, buyer: m.buyer });
                }
            }
        });
        const parentMap = {}, childrenMap = {};
        npl_master.forEach(m => {
            if (m.parent_code && m.parent_code !== m.code) {
                parentMap[m.code] = m.parent_code;
                if (!childrenMap[m.parent_code]) childrenMap[m.parent_code] = [];
                childrenMap[m.parent_code].push(m.code);
            }
        });
        const familyMap = {};
        npl_master.forEach(m => {
            const family = new Set([m.code]);
            (codeToGroups[m.code] || []).forEach(grp => {
                (substitute_groups[grp] || []).forEach(mem => family.add(mem.code));
            });
            if (parentMap[m.code]) family.add(parentMap[m.code]);
            (childrenMap[m.code] || []).forEach(c => family.add(c));
            const second = new Set(family);
            second.forEach(code => {
                (codeToGroups[code] || []).forEach(grp => {
                    (substitute_groups[grp] || []).forEach(m2 => family.add(m2.code));
                });
                if (parentMap[code]) family.add(parentMap[code]);
                (childrenMap[code] || []).forEach(c => family.add(c));
            });
            familyMap[m.code] = Array.from(family);
        });
        return familyMap;
    }

    function aggregateInventory(lots) {
        const byCode = {};
        lots.forEach(lot => {
            if (!byCode[lot.code]) byCode[lot.code] = { total: 0, lots: [], by_warehouse: {} };
            byCode[lot.code].total += lot.stock;
            byCode[lot.code].lots.push(lot);
            byCode[lot.code].by_warehouse[lot.warehouse] = (byCode[lot.code].by_warehouse[lot.warehouse] || 0) + lot.stock;
        });
        return byCode;
    }

    function aggregateIncoming(orders) {
        const byCode = {};
        orders.forEach(po => {
            if (!byCode[po.code]) byCode[po.code] = { total: 0, pos: [] };
            byCode[po.code].total += po.on_order;
            byCode[po.code].pos.push(po);
        });
        return byCode;
    }

    function analyzeExpiry(lots) {
        const today = new Date();
        const monthsDiff = (d1, d2) => (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
        let expired = 0, expiring_3m = 0, expiring_6m = 0, expiring_12m = 0;
        const expiringLots = [];
        lots.forEach(lot => {
            if (!lot.expiry) return;
            const expDate = new Date(lot.expiry);
            if (isNaN(expDate)) return;
            const months = monthsDiff(today, expDate);
            if (months < 0) { expired += lot.stock; expiringLots.push({...lot, months_left: months, status: 'expired'}); }
            else if (months <= 3) { expiring_3m += lot.stock; expiringLots.push({...lot, months_left: months, status: 'expiring_3m'}); }
            else if (months <= 6) { expiring_6m += lot.stock; expiringLots.push({...lot, months_left: months, status: 'expiring_6m'}); }
            else if (months <= 12) { expiring_12m += lot.stock; expiringLots.push({...lot, months_left: months, status: 'expiring_12m'}); }
        });
        return { expired, expiring_3m, expiring_6m, expiring_12m, lots: expiringLots };
    }

    function determineUrgency(shortageByMonth, leadtimeMonths) {
        for (let m = 0; m <= 11; m++) {
            if (shortageByMonth[m] > 0) {
                if (m === 0) return { level: 'CRITICAL', label: 'Cực gấp', score: 4 };
                if (m <= (leadtimeMonths || 1)) return { level: 'CRITICAL', label: 'Cực gấp', score: 4 };
                if (m <= CONFIG.URGENCY_HIGH_MONTHS) return { level: 'HIGH', label: 'Cao', score: 3 };
                if (m <= CONFIG.URGENCY_MED_MONTHS) return { level: 'MEDIUM', label: 'Trung bình', score: 2 };
                if (m <= CONFIG.URGENCY_LOW_MONTHS) return { level: 'LOW', label: 'Thấp', score: 1 };
            }
        }
        return { level: 'OK', label: 'Đủ hàng', score: 0 };
    }

    function processAll(rawData, options) {
        const opts = Object.assign({ buyerFilter: CONFIG.BUYER_FILTER }, options || {});
        const npl_master = rawData.npl_master || [];
        const substitute_groups = rawData.substitute_groups || {};
        const inventory_lots = rawData.inventory_lots || [];
        const demand_total = rawData.demand_total || [];
        const incoming_orders = rawData.incoming_orders || [];

        const familyMap = buildFamilyMap(npl_master, substitute_groups);
        const invByCode = aggregateInventory(inventory_lots);
        const incomingByCode = aggregateIncoming(incoming_orders);
        const demandByCode = {};
        demand_total.forEach(d => demandByCode[d.code] = d);
        const masterByCode = {};
        npl_master.forEach(m => masterByCode[m.code] = m);

        const items = npl_master.map(npl => {
            const family = familyMap[npl.code] || [npl.code];
            const breakdown = family.map(code => {
                const inv = invByCode[code] || { total: 0, lots: [], by_warehouse: {} };
                const master = masterByCode[code];
                return {
                    code, name: master ? master.name : '',
                    inventory: inv.total, lots: inv.lots, by_warehouse: inv.by_warehouse,
                    is_self: code === npl.code
                };
            }).filter(b => b.is_self || b.inventory > 0);
            const totalFamilyInv = breakdown.reduce((s, b) => s + b.inventory, 0);
            const dem = demandByCode[npl.code];
            const monthlyDemand = dem ? dem.demand.map(d => d.need) : new Array(12).fill(0);
            const incoming = incomingByCode[npl.code] || { total: 0, pos: [] };

            let bal = totalFamilyInv + incoming.total;
            const shortageByMonth = [], balanceByMonth = [];
            for (let m = 0; m <= 11; m++) {
                bal -= monthlyDemand[m];
                balanceByMonth.push(bal);
                shortageByMonth.push(bal < 0 ? -bal : 0);
                if (bal < 0) bal = 0;
            }
            const shortage_t0 = shortageByMonth[0];
            const shortage_3m = shortageByMonth.slice(0, 3).reduce((s, v) => s + v, 0);
            const shortage_6m = shortageByMonth.slice(0, 6).reduce((s, v) => s + v, 0);
            const shortage_9m = shortageByMonth.slice(0, 9).reduce((s, v) => s + v, 0);
            const urgency = determineUrgency(shortageByMonth, npl.leadtime_months);
            const selfLots = (invByCode[npl.code] || { lots: [] }).lots;
            const expiry = analyzeExpiry(selfLots);
            const subGroupMembers = npl.substitute_group ? (substitute_groups[npl.substitute_group] || []) : [];

            return Object.assign({}, npl, {
                family_codes: family, family_breakdown: breakdown,
                total_family_inventory: totalFamilyInv,
                self_inventory: (invByCode[npl.code] || { total: 0 }).total,
                monthly_demand: monthlyDemand,
                shortage_by_month: shortageByMonth, balance_by_month: balanceByMonth,
                shortage_t0, shortage_3m, shortage_6m, shortage_9m,
                purchase_t0: shortage_t0, purchase_3m: shortage_3m, purchase_6m: shortage_6m, purchase_9m: shortage_9m,
                incoming_total: incoming.total, incoming_pos: incoming.pos,
                urgency, expiry, substitute_group_members: subGroupMembers
            });
        });

        const filtered = opts.buyerFilter ? items.filter(i => i.buyer === opts.buyerFilter) : items;
        const warnings = generateWarnings(filtered);
        const stats = {
            total_npl: filtered.length,
            critical: filtered.filter(i => i.urgency.level === 'CRITICAL').length,
            high: filtered.filter(i => i.urgency.level === 'HIGH').length,
            medium: filtered.filter(i => i.urgency.level === 'MEDIUM').length,
            low: filtered.filter(i => i.urgency.level === 'LOW').length,
            ok: filtered.filter(i => i.urgency.level === 'OK').length,
            expired: filtered.filter(i => i.expiry.expired > 0).length,
            expiring_3m: filtered.filter(i => i.expiry.expiring_3m > 0).length,
            expiring_6m: filtered.filter(i => i.expiry.expiring_6m > 0).length,
            expiring_12m: filtered.filter(i => i.expiry.expiring_12m > 0).length,
            no_demand_but_stock: filtered.filter(i => i.total_family_inventory > 0 && i.monthly_demand.every(d => d === 0)).length
        };
        return { items: filtered, all_items: items, warnings, stats };
    }

    function generateWarnings(items) {
        const w = [];
        const add = (level, category, list, title, desc) => {
            if (list.length === 0) return;
            w.push({ level, category, title, desc, codes: list.map(i => i.code) });
        };
        const critical = items.filter(i => i.urgency.level === 'CRITICAL');
        add('critical', 'shortage', critical,
            critical.length + ' NPL thiếu cực gấp (T0 hoặc trong leadtime)',
            'Cần xử lý ngay. NPL: ' + critical.slice(0,5).map(i=>i.code).join(', ') + (critical.length>5?', ...':''));
        const high = items.filter(i => i.urgency.level === 'HIGH');
        add('warning', 'shortage', high,
            high.length + ' NPL thiếu cao (T1-T2)',
            'Đặt PO trong tuần. NPL: ' + high.slice(0,5).map(i=>i.code).join(', ') + (high.length>5?', ...':''));
        const expired = items.filter(i => i.expiry.expired > 0);
        add('critical', 'expiry', expired,
            expired.length + ' NPL có tồn ĐÃ HẾT HẠN',
            'Cần thanh lý. NPL: ' + expired.slice(0,5).map(i=>i.code).join(', ') + (expired.length>5?', ...':''));
        const exp3 = items.filter(i => i.expiry.expiring_3m > 0);
        add('warning', 'expiry', exp3,
            exp3.length + ' NPL hết hạn trong 3 tháng tới',
            'Ưu tiên dùng trước. NPL: ' + exp3.slice(0,5).map(i=>i.code).join(', ') + (exp3.length>5?', ...':''));
        const exp6 = items.filter(i => i.expiry.expiring_6m > 0);
        add('info', 'expiry', exp6,
            exp6.length + ' NPL hết hạn trong 6 tháng tới',
            'Cân nhắc kế hoạch sử dụng. NPL: ' + exp6.slice(0,5).map(i=>i.code).join(', ') + (exp6.length>5?', ...':''));
        const noDemand = items.filter(i => i.total_family_inventory > 0 && i.monthly_demand.every(d => d === 0));
        add('info', 'orphan', noDemand,
            noDemand.length + ' NPL có tồn nhưng không có KHSX',
            'Tồn kho không có nhu cầu. NPL: ' + noDemand.slice(0,5).map(i=>i.code).join(', ') + (noDemand.length>5?', ...':''));
        const wasteRisk = items.filter(i => {
            if (i.expiry.expiring_3m + i.expiry.expiring_6m === 0) return false;
            const d6 = i.monthly_demand.slice(0, 6).reduce((s, v) => s + v, 0);
            return d6 < (i.expiry.expiring_3m + i.expiry.expiring_6m);
        });
        add('warning', 'waste', wasteRisk,
            wasteRisk.length + ' NPL nguy cơ hết hạn trước khi dùng hết',
            'Tồn lô gần hết hạn > nhu cầu 6T. NPL: ' + wasteRisk.slice(0,5).map(i=>i.code).join(', ') + (wasteRisk.length>5?', ...':''));
        return w;
    }

    return { processAll, buildFamilyMap, CONFIG };
})();
