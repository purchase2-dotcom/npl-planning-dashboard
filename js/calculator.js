/**
 * ============================================================
 *  NPL CALCULATOR - Logic tính toán kế hoạch mua hàng NPL
 * ============================================================
 *
 *  Các công thức cốt lõi:
 *  ----------------------
 *  1) Nhu cầu NPL trong giai đoạn N tháng:
 *     demand_N  =  Σ (sản_lượng_sp_i × định_mức_npl_i)
 *
 *  2) Lượng cần mua (purchase):
 *     purchase  =  max(0,  demand - inventory - on_order + safety_stock)
 *
 *     Trong đó:
 *       - inventory : tồn kho hiện tại
 *       - on_order  : số lượng đang trên đường (đã đặt nhưng chưa về)
 *       - safety_stock : tồn kho an toàn (= demand × safety_ratio)
 *
 *  3) Ngày cần đặt hàng (order date):
 *     order_date  =  production_start_date  −  leadtime_days  −  buffer_days
 *
 *  4) Trạng thái cảnh báo (status):
 *     - ok      : inventory ≥ demand
 *     - warning : inventory < demand  &&  (today + leadtime) ≤ production_start
 *     - danger  : inventory < demand  &&  (today + leadtime) >  production_start
 *
 *  5) NPL thay thế được ưu tiên khi:
 *     - NPL chính ở trạng thái 'danger' (không kịp leadtime)
 *     - HOẶC tồn kho NPL chính < ngưỡng tối thiểu
 *     - VÀ có NPL thay thế khả dụng (inventory_substitute > 0)
 * ============================================================
 */

const NPLCalculator = (function() {

    // --- Constants ---
    const SAFETY_STOCK_RATIO = 0.10;   // 10% nhu cầu làm tồn kho an toàn
    const BUFFER_DAYS = 7;             // Buffer 7 ngày phòng rủi ro vận chuyển
    const MIN_INVENTORY_THRESHOLD = 0.20; // Tồn kho dưới 20% nhu cầu => cảnh báo

    /**
     * Tính nhu cầu NPL từ kế hoạch sản xuất
     * @param {Array} productionPlan - [{product_id, quantity, start_date}]
     * @param {Array} bom - Bill of Materials [{product_id, npl_code, usage_per_unit}]
     * @param {number} months - 3, 6, hoặc 8
     */
    function calculateDemand(productionPlan, bom, months) {
        const today = new Date();
        const endDate = new Date(today);
        endDate.setMonth(endDate.getMonth() + months);

        const demandByNPL = {};

        productionPlan.forEach(plan => {
            const startDate = new Date(plan.start_date);
            // Chỉ tính các plan trong giai đoạn
            if (startDate > endDate) return;

            const productBOM = bom.filter(b => b.product_id === plan.product_id);
            productBOM.forEach(item => {
                const totalUsage = plan.quantity * item.usage_per_unit;
                demandByNPL[item.npl_code] = (demandByNPL[item.npl_code] || 0) + totalUsage;
            });
        });

        return demandByNPL;
    }

    /**
     * Tính lượng cần mua cho 1 NPL
     */
    function calculatePurchase(npl, demand, period) {
        const safetyStock = demand * SAFETY_STOCK_RATIO;
        const purchase = Math.max(
            0,
            demand - (npl.inventory || 0) - (npl.on_order || 0) + safetyStock
        );

        return {
            npl_code: npl.code,
            npl_name: npl.name,
            category: npl.category,
            inventory: npl.inventory || 0,
            on_order: npl.on_order || 0,
            demand: Math.round(demand),
            safety_stock: Math.round(safetyStock),
            purchase: Math.round(purchase),
            leadtime: npl.leadtime,
            unit_price: npl.unit_price || 0,
            total_cost: Math.round(purchase * (npl.unit_price || 0)),
            substitutes: npl.substitutes || []
        };
    }

    /**
     * Xác định trạng thái cảnh báo
     */
    function determineStatus(item, productionStartDate) {
        const today = new Date();
        const start = productionStartDate ? new Date(productionStartDate) : new Date(today.getTime() + 90*24*60*60*1000);
        const daysUntilProduction = Math.floor((start - today) / (1000 * 60 * 60 * 24));

        // Đủ hàng
        if (item.inventory >= item.demand) {
            return { status: 'ok', label: 'Đủ hàng' };
        }

        // Tính được kịp leadtime không
        const totalLeadDays = item.leadtime + BUFFER_DAYS;

        if (daysUntilProduction >= totalLeadDays) {
            return { status: 'warning', label: 'Cần đặt thêm' };
        } else {
            return { status: 'danger', label: 'Thiếu gấp' };
        }
    }

    /**
     * Tính ngày cần đặt hàng (working backwards from production start)
     */
    function calculateOrderDate(productionStartDate, leadtime) {
        const start = new Date(productionStartDate);
        start.setDate(start.getDate() - leadtime - BUFFER_DAYS);
        return start;
    }

    /**
     * Kiểm tra & đề xuất sử dụng NPL thay thế
     */
    function suggestSubstitute(mainNPL, substitutes, demand) {
        if (mainNPL.status !== 'danger' && mainNPL.inventory >= demand * MIN_INVENTORY_THRESHOLD) {
            return null;
        }

        // Tìm NPL thay thế có đủ tồn kho hoặc leadtime ngắn hơn
        const viable = substitutes.filter(sub =>
            sub.inventory >= demand * 0.5 || sub.leadtime < mainNPL.leadtime
        );

        if (viable.length === 0) return null;

        // Ưu tiên: tồn kho cao nhất, sau đó leadtime ngắn nhất
        viable.sort((a, b) => {
            if (b.inventory !== a.inventory) return b.inventory - a.inventory;
            return a.leadtime - b.leadtime;
        });

        return viable[0];
    }

    /**
     * Generate cảnh báo dạng ngôn ngữ tự nhiên
     */
    function generateWarnings(items, period) {
        const warnings = [];
        const dangerItems = items.filter(i => i.statusInfo.status === 'danger');
        const warningItems = items.filter(i => i.statusInfo.status === 'warning');

        if (dangerItems.length > 0) {
            warnings.push({
                level: 'critical',
                title: `${dangerItems.length} NPL có nguy cơ thiếu hàng nghiêm trọng`,
                desc: `Các NPL sau không kịp leadtime cho giai đoạn ${period} tháng: ${dangerItems.slice(0,5).map(i=>i.npl_code).join(', ')}${dangerItems.length>5?'...':''}. Cần xử lý ngay - cân nhắc dùng NPL thay thế hoặc đẩy nhanh sản xuất.`
            });
        }

        if (warningItems.length > 0) {
            warnings.push({
                level: 'warning',
                title: `${warningItems.length} NPL cần đặt hàng trong tuần này`,
                desc: `Còn vừa đủ thời gian leadtime. Hành động: đặt PO ngay để đảm bảo về kịp ngày sản xuất.`
            });
        }

        const substituteItems = items.filter(i => i.suggestedSubstitute);
        if (substituteItems.length > 0) {
            warnings.push({
                level: 'info',
                title: `${substituteItems.length} NPL nên dùng phương án thay thế`,
                desc: `Hệ thống đề xuất NPL thay thế dựa trên tồn kho và leadtime ngắn hơn. Kiểm tra cột "NPL thay thế" để biết chi tiết.`
            });
        }

        return warnings;
    }

    /**
     * Main entry point - xử lý toàn bộ dữ liệu
     */
    function processAll(rawData, period) {
        const { npl_list, production_plan, bom } = rawData;

        const demandByNPL = calculateDemand(production_plan, bom, period);

        const items = npl_list.map(npl => {
            const demand = demandByNPL[npl.code] || 0;
            const purchaseInfo = calculatePurchase(npl, demand, period);
            const earliestStart = production_plan
                .filter(p => bom.some(b => b.npl_code === npl.code && b.product_id === p.product_id))
                .map(p => new Date(p.start_date))
                .sort((a,b) => a-b)[0];

            const statusInfo = determineStatus({
                inventory: npl.inventory,
                demand: demand,
                leadtime: npl.leadtime
            }, earliestStart);

            const orderDate = earliestStart ? calculateOrderDate(earliestStart, npl.leadtime) : null;

            // Tìm NPL thay thế
            const substitutesData = (npl.substitutes || []).map(subCode => {
                return npl_list.find(n => n.code === subCode);
            }).filter(Boolean);

            const suggestedSub = suggestSubstitute(
                { ...npl, status: statusInfo.status },
                substitutesData,
                demand
            );

            return {
                ...purchaseInfo,
                statusInfo,
                orderDate,
                productionStart: earliestStart,
                suggestedSubstitute: suggestedSub
            };
        });

        const warnings = generateWarnings(items, period);

        return { items, warnings };
    }

    return {
        processAll,
        calculateDemand,
        calculatePurchase,
        determineStatus,
        calculateOrderDate,
        suggestSubstitute,
        CONSTANTS: {
            SAFETY_STOCK_RATIO,
            BUFFER_DAYS,
            MIN_INVENTORY_THRESHOLD
        }
    };
})();
