# NPL Planning Dashboard v3

Hệ thống lập kế hoạch mua nguyên phụ liệu (NPL) cho Phụ trách mua hàng "My".

## Tính năng

- **Upload 5+ file**: Data MH (3 sheet), Tồn kho XML, Nhu cầu T0-T11, Đơn đang về, KHSX
- **Family inventory**: tự tổng tồn của các mã trong cùng nhóm thay thế + mã gốc
- **4 mức khẩn cấp**: Cực gấp / Cao / Trung bình / Thấp dựa trên thời điểm thiếu vs leadtime
- **Quản lý hạn dùng**: cảnh báo đã hết hạn / còn 3T / 6T / 12T, phát hiện rủi ro hết hạn trước khi dùng
- **Cảnh báo**: thiếu hàng, hết hạn, có tồn không KHSX, lô gần hạn vượt nhu cầu
- **Lọc theo phụ trách**: mặc định "My", đổi trong Cài đặt
- **Modal chi tiết**: click vào mã NPL xem family breakdown, lô tồn, đơn đang về

## Cấu trúc

```
npl-planning-dashboard/
├── index.html              # Shell + sidebar + modal
├── css/style.css           # Theme light/dark, gradient hero
├── js/
│   ├── calculator.js       # Logic family + urgency + expiry
│   ├── uploader.js         # Parser Excel/XML cho 6 file format thực tế
│   └── app.js              # UI controller
└── vercel.json             # Deploy config
```

## Logic chính

**Family inventory**: với mã NPL X, family = X ∪ {các mã cùng nhóm thay thế của X} ∪ {mã gốc của X} ∪ {các mã có X làm gốc} ∪ second-pass

**Tồn lọc theo 8 mã kho**: 152.0101 / 0102 / 0103 / 0201 / 0401 / 0501 / 0601 / 0701

**On_order**: SL kế hoạch − SL thực hiện (lọc ±5%, chỉ giữ dương)

**Urgency**:
- CRITICAL: thiếu T0 hoặc thiếu trong leadtime
- HIGH: thiếu trong T1-T2
- MEDIUM: thiếu T3-T5
- LOW: thiếu T6-T8

## Deploy

Push lên GitHub bằng GitHub Desktop → Vercel auto deploy. Mọi update cũng theo flow này.
