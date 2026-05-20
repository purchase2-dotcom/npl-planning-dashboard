# Hướng Dẫn Deploy: GitHub + Vercel

> Hướng dẫn từng bước cho người mới bắt đầu. Tổng thời gian setup khoảng 15–20 phút.

---

## Phần 1: Tạo tài khoản GitHub

### Bước 1.1 – Đăng ký GitHub

1. Truy cập https://github.com/signup
2. Nhập email (nên dùng email công ty hoặc email cá nhân chính)
3. Tạo mật khẩu mạnh (lưu vào trình quản lý mật khẩu)
4. Chọn username (ví dụ: `serena-npl` — username này sẽ xuất hiện trên URL)
5. Xác thực email qua mã 6 số gửi về hộp thư

### Bước 1.2 – Cài Git trên máy

**Windows:** Tải https://git-scm.com/download/win → cài đặt mặc định

**Mac:** Mở Terminal, gõ `git --version` → nếu chưa có sẽ tự đề xuất cài

### Bước 1.3 – Cấu hình Git lần đầu

Mở Terminal / Command Prompt, gõ:

```bash
git config --global user.name "Tên của bạn"
git config --global user.email "email@example.com"
```

(Dùng đúng email đã đăng ký GitHub).

---

## Phần 2: Đưa project lên GitHub

### Bước 2.1 – Tạo repository trên GitHub

1. Vào https://github.com/new
2. **Repository name:** `npl-planning-dashboard`
3. **Description:** "Hệ thống lập kế hoạch mua NPL ngành may"
4. Chọn **Public** (để Vercel free deploy được) hoặc **Private** (cần plan trả phí Vercel)
5. **KHÔNG tick** "Add a README file" (vì project đã có sẵn)
6. Bấm **Create repository**

GitHub sẽ hiện trang hướng dẫn — copy URL repo (dạng `https://github.com/username/npl-planning-dashboard.git`).

### Bước 2.2 – Push code lên GitHub

Mở Terminal trong folder `npl-planning-dashboard`:

```bash
cd "đường/dẫn/tới/npl-planning-dashboard"

git init
git add .
git commit -m "Initial commit: NPL Planning Dashboard"
git branch -M main
git remote add origin https://github.com/USERNAME/npl-planning-dashboard.git
git push -u origin main
```

> Thay `USERNAME` bằng username GitHub của bạn.

Lần đầu push, GitHub có thể yêu cầu đăng nhập. Hai cách:

**Cách A – Personal Access Token (khuyên dùng):**
1. Vào https://github.com/settings/tokens
2. Bấm **Generate new token (classic)**
3. Tick scope **repo**, đặt expiration 90 ngày
4. Copy token → dán vào ô password khi git hỏi

**Cách B – GitHub Desktop:** tải https://desktop.github.com → đăng nhập → tự xử lý auth.

### Bước 2.3 – Kiểm tra

Refresh trang repo GitHub, bạn sẽ thấy đầy đủ các file.

---

## Phần 3: Deploy lên Vercel

### Bước 3.1 – Đăng ký Vercel

1. Truy cập https://vercel.com/signup
2. Bấm **Continue with GitHub** (nên dùng cách này — tự đồng bộ)
3. Vercel sẽ xin quyền đọc repo trên GitHub → bấm **Authorize Vercel**
4. Hoàn tất tạo profile (chọn Hobby plan – miễn phí)

### Bước 3.2 – Import project

1. Trên Vercel dashboard, bấm **Add New → Project**
2. Vercel hiện danh sách repo GitHub của bạn → tìm `npl-planning-dashboard`
3. Bấm **Import**

### Bước 3.3 – Cấu hình deploy

Vercel sẽ tự detect đây là static site. Các tùy chọn:

| Mục | Giá trị |
|---|---|
| Framework Preset | **Other** |
| Root Directory | `./` (mặc định) |
| Build Command | bỏ trống (static, không cần build) |
| Output Directory | bỏ trống |
| Install Command | bỏ trống |

Bấm **Deploy**.

### Bước 3.4 – Chờ deploy

Quá trình deploy mất 30–60 giây. Khi xong, Vercel hiện URL dạng:

```
https://npl-planning-dashboard.vercel.app
```

→ Click vào để xem dashboard live.

---

## Phần 4: Custom domain (tùy chọn)

Nếu có tên miền riêng (ví dụ `npl.congtycuaban.com`):

1. Trên Vercel project → **Settings → Domains**
2. Nhập domain, làm theo hướng dẫn cấu hình DNS

---

## Phần 5: Workflow cập nhật về sau

Mỗi khi sửa file:

```bash
git add .
git commit -m "Mô tả thay đổi"
git push
```

→ Vercel **tự động deploy lại** trong 30 giây. Không cần thao tác gì thêm.

---

## Phần 6: Lỗi thường gặp

### "Permission denied" khi push

Token sai hoặc hết hạn. Tạo token mới ở https://github.com/settings/tokens.

### Vercel deploy thành công nhưng trang trắng

Mở Developer Tools (F12) → tab Console → kiểm tra lỗi. Thường do:
- File `data/sample-data.json` không tồn tại (case-sensitive trên Linux)
- Đường dẫn CSS/JS sai (phải dùng relative path, không leading slash)

### Cập nhật xong nhưng Vercel không deploy

Kiểm tra trên https://vercel.com/dashboard → tab **Deployments** xem lỗi build. Hoặc check repo GitHub xem code có push lên đúng branch `main` không.

---

## Checklist hoàn thành

- [ ] Tài khoản GitHub đã tạo
- [ ] Git đã cài và config
- [ ] Repo `npl-planning-dashboard` đã tạo trên GitHub
- [ ] Code đã push thành công
- [ ] Tài khoản Vercel đã tạo (qua GitHub)
- [ ] Project đã import vào Vercel
- [ ] URL live đã hoạt động
- [ ] Test thử mở từ điện thoại

Khi xong hết, gửi URL Vercel để tôi kiểm tra giúp bạn.
