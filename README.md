# NPL Planning Dashboard

> Hệ thống lập kế hoạch mua nguyên phụ liệu (NPL) cho ngành may mặc.

Dashboard tính toán nhu cầu mua NPL theo các giai đoạn 3, 6, 8 tháng dựa trên kế hoạch sản xuất, tồn kho, leadtime và đề xuất NPL thay thế khi cần.

## Tính năng

- Tính nhu cầu NPL theo 3 / 6 / 8 tháng
- KPI tổng quan: số NPL, NPL cần mua gấp, NPL thiếu, tổng giá trị
- Bảng chi tiết: tồn kho, nhu cầu, lượng cần mua, ngày đặt
- Cảnh báo theo mức độ (đủ hàng / cần đặt / thiếu gấp)
- Đề xuất NPL thay thế dựa trên tồn kho và leadtime
- Lọc theo nhóm NPL, trạng thái, từ khóa
- Xuất CSV

## Cấu trúc dự án

```
npl-planning-dashboard/
├── index.html              # Trang chính
├── css/
│   └── style.css           # Style chính
├── js/
│   ├── app.js              # UI logic + event handlers
│   └── calculator.js       # Logic tính toán NPL
├── data/
│   └── sample-data.json    # Dữ liệu mẫu
├── docs/
│   ├── LOGIC_REVIEW.md     # Review chi tiết logic
│   └── DEPLOY_GUIDE.md     # Hướng dẫn deploy GitHub + Vercel
├── vercel.json             # Config Vercel
├── .gitignore
└── README.md
```

## Chạy local

Mở `index.html` trực tiếp trong trình duyệt — hoặc dùng live server.

Nếu fetch JSON bị chặn do CORS khi mở file trực tiếp, chạy 1 trong các lệnh sau ở thư mục project:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Sau đó mở `http://localhost:8000`.

## Deploy

Xem hướng dẫn chi tiết tại [docs/DEPLOY_GUIDE.md](./docs/DEPLOY_GUIDE.md).

## Logic & Tài liệu

Logic tính toán được review chi tiết tại [docs/LOGIC_REVIEW.md](./docs/LOGIC_REVIEW.md) — bao gồm phân tích điểm mạnh, lỗ hổng và lộ trình cải tiến.

## Tùy biến dữ liệu

Thay file `data/sample-data.json` bằng dữ liệu thực tế. Cấu trúc:

```json
{
  "npl_list":       [{ code, name, category, inventory, on_order, leadtime, unit_price, substitutes }],
  "production_plan":[{ product_id, product_name, quantity, start_date }],
  "bom":            [{ product_id, npl_code, usage_per_unit }]
}
```
