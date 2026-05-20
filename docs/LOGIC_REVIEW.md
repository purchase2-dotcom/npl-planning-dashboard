# Review Logic Hệ Thống Lập Kế Hoạch Mua NPL

> Tài liệu này review chi tiết logic tính toán của dashboard, chỉ ra điểm mạnh, lỗ hổng và đề xuất cải tiến.

---

## 1. Logic Tính Nhu Cầu NPL

### Công thức hiện tại

```
demand_N = Σ (sản_lượng_sp_i × định_mức_npl_i)
```

Trong đó: `N` là số tháng (3 / 6 / 8), `i` là từng sản phẩm trong kế hoạch sản xuất trong khoảng thời gian đó.

### Đánh giá

Logic cơ bản đúng và đơn giản — đúng với cách hầu hết nhà máy may đang tính. Tuy nhiên có 4 điểm cần lưu ý:

**Điểm cần cải tiến:**

1. **Chưa tính tỷ lệ hao hụt (waste ratio).** Trong thực tế, vải và phụ liệu luôn có hao hụt 3–8% do cắt, lỗi may, mất mát. Công thức nên là: `demand = sản_lượng × định_mức × (1 + waste_ratio)`.
2. **Chưa phân biệt định mức theo size.** 1 áo size XL tốn vải nhiều hơn size S khoảng 10–15%. Nếu BOM chỉ có 1 định mức trung bình, kết quả có thể lệch khi tỷ lệ size thay đổi.
3. **Chưa xét sản phẩm đã làm xong một phần.** Nếu plan SP001 đã hoàn thành 30% trước ngày tính, hệ thống vẫn cộng full nhu cầu.
4. **Date range hơi cứng.** Hiện tại dùng "ngày hôm nay + N tháng" — nhưng kế hoạch sản xuất thường tính theo "ngày khởi đầu plan" hơn là "ngày hôm nay".

---

## 2. Logic Tính Lượng Cần Mua

### Công thức hiện tại

```
purchase = max(0, demand - inventory - on_order + safety_stock)
safety_stock = demand × 10%
```

### Đánh giá

Đây là công thức MRP (Material Requirements Planning) chuẩn sách giáo khoa. Đúng về mặt nguyên lý.

**Điểm cần cải tiến:**

1. **Safety stock 10% áp dụng đồng đều cho tất cả NPL — chưa hợp lý.** Vải lụa nhập khẩu (leadtime 75 ngày, giá 120k/m) nên có safety stock cao hơn (15–20%), trong khi túi PE (leadtime 15 ngày, 200đ/cái) chỉ cần 5%. Nên cho phép cấu hình safety stock theo từng NPL hoặc theo nhóm.
2. **Chưa tính MOQ (Minimum Order Quantity).** Nhiều nhà cung cấp yêu cầu đặt tối thiểu (ví dụ 500m vải). Nếu hệ thống tính ra cần mua 320m, thực tế phải đặt 500m.
3. **Chưa tính bội số đặt hàng.** Vải thường bán theo cuộn (mỗi cuộn 50m), không thể mua 327m lẻ.
4. **Chưa xét lô tối ưu (EOQ).** Có thể tối ưu chi phí bằng cách gộp nhiều đợt đặt thành 1 PO lớn.

---

## 3. Logic Cảnh Báo Thiếu Hàng

### Quy tắc hiện tại

| Trạng thái | Điều kiện |
|---|---|
| **OK** | Tồn kho ≥ Nhu cầu |
| **Warning** | Tồn kho < Nhu cầu **VÀ** còn đủ thời gian leadtime |
| **Danger** | Tồn kho < Nhu cầu **VÀ** không kịp leadtime |

Tính: `days_until_production ≥ leadtime + 7 (buffer)` → kịp; ngược lại → không kịp.

### Đánh giá

Logic rõ ràng và dễ hiểu. Tuy nhiên:

**Điểm cần cải tiến:**

1. **Buffer 7 ngày là cố định — thực tế nên động.** Hàng nhập khẩu container biển nên có buffer 14–21 ngày (rủi ro tắc cảng, thông quan). Hàng nội địa 3–5 ngày là đủ. Nên có field `import_type` hoặc `risk_level` cho từng NPL.
2. **Không cảnh báo over-stock.** Nếu tồn kho gấp 3 lần nhu cầu, vẫn hiển thị "OK". Đáng lẽ nên cảnh báo "tồn kho dư thừa" → ảnh hưởng dòng tiền.
3. **Không phân biệt mức độ thiếu.** Thiếu 10% và thiếu 90% đều ra "warning" hoặc "danger" như nhau. Nên có thêm "% thiếu hụt" hiển thị trong cảnh báo.
4. **Không tính tới on_order partial.** Nếu lô on_order về trước ngày sản xuất 5 ngày, nó nên được tính. Nếu về sau, không nên tính. Hiện tại đơn giản là cộng on_order vào tổng có sẵn.

---

## 4. Logic Đề Xuất NPL Thay Thế

### Quy tắc hiện tại

NPL thay thế được đề xuất khi:
- NPL chính ở trạng thái `danger`, **HOẶC**
- Tồn kho NPL chính < 20% nhu cầu

NPL thay thế khả dụng phải:
- Tồn kho ≥ 50% nhu cầu, **HOẶC**
- Leadtime ngắn hơn NPL chính

Ưu tiên: tồn kho cao nhất → leadtime ngắn nhất.

### Đánh giá

Logic này có 1 lỗ hổng tương đối quan trọng:

**Điểm cần cải tiến:**

1. **Chưa kiểm tra NPL thay thế có "rảnh" không.** Nếu VAI-002 là thay thế của VAI-001, nhưng VAI-002 cũng đang được dùng cho sản phẩm khác → tồn kho 8000m của nó không phải là 8000m "free". Cần trừ đi nhu cầu của các sản phẩm khác đã claim trước. **Đây là lỗi tiềm ẩn quan trọng — có thể dẫn đến double counting.**
2. **Chưa xét chất lượng/giá.** NPL thay thế có thể chất lượng khác hoặc giá khác — quyết định cuối cùng nên có cả thông tin price gap. Hiện tại chỉ xét tồn kho và leadtime.
3. **Chưa xét tỷ lệ thay thế.** Ví dụ 1m VAI-001 = 1.1m VAI-002 (do co rút khác nhau). Hiện tại giả định 1:1.
4. **Đề xuất chỉ 1 NPL thay thế.** Nên đề xuất thứ tự ưu tiên (1, 2, 3) để planner có thêm phương án.

---

## 5. Logic Tính Ngày Đặt Hàng

### Công thức hiện tại

```
order_date = production_start_date − leadtime − 7 (buffer)
```

### Đánh giá

Đúng nguyên tắc, nhưng:

**Điểm cần cải tiến:**

1. **Không trừ ngày nghỉ.** Nếu rơi vào Tết, Chủ nhật, lễ → cần dời lùi thêm. Hệ thống chưa có working days calendar.
2. **Không tính thời gian QC nội bộ.** Sau khi NPL về, thường cần 2–5 ngày kiểm hàng trước khi cho sản xuất. Buffer 7 ngày bao gồm cái này luôn nhưng không rõ ràng.

---

## 6. Tổng Kết & Mức Độ Ưu Tiên Cải Tiến

| # | Cải tiến | Mức ưu tiên | Ảnh hưởng |
|---|---|---|---|
| 1 | Tính waste ratio cho từng NPL | **CAO** | Có thể thiếu 3–8% NPL khi sản xuất |
| 2 | Kiểm tra NPL thay thế có "rảnh" không | **CAO** | Tránh double counting, sai kế hoạch |
| 3 | Cấu hình safety stock theo từng NPL | **CAO** | Tối ưu tồn kho và rủi ro |
| 4 | Thêm MOQ và bội số đặt hàng | **TRUNG BÌNH** | Tránh kế hoạch không thực thi được |
| 5 | Buffer leadtime động theo import_type | **TRUNG BÌNH** | Giảm rủi ro hàng nhập khẩu chậm |
| 6 | Cảnh báo over-stock | **TRUNG BÌNH** | Tối ưu dòng tiền |
| 7 | Tính tỷ lệ thay thế (conversion ratio) | **THẤP** | Tinh chỉnh độ chính xác |
| 8 | Working days calendar | **THẤP** | Tính ngày đặt chính xác hơn |

---

## 7. Kết Luận

**Logic hiện tại của dashboard:** đúng về nguyên lý MRP cơ bản, đủ dùng cho dự báo nhanh và quan sát tổng thể. Phù hợp với vai trò "trợ lý lập kế hoạch" giúp planner ra quyết định nhanh.

**Không nên dùng làm hệ thống duy nhất** cho ra PO chính thức nếu chưa bổ sung:
- Waste ratio (Cải tiến #1)
- Kiểm tra NPL thay thế rảnh (Cải tiến #2)
- MOQ (Cải tiến #4)

Đó là 3 điểm có thể gây sai số đáng kể trong vận hành thực tế.
