# Chuẩn Yuh App (PWA)

Rút ra từ YuhScan, HumiHome (YuhTahnLan2), Bé Vui Học, Solar Insight. App mới làm theo đúng các mục dưới đây.

## 1. Stack

| Phần | Dùng | Ghi chú |
|---|---|---|
| HTML | 1 file `public/index.html` | Không framework, không bước build |
| CSS | **Tailwind Play CDN** (`cdn.tailwindcss.com`) + `base.css` | Màu thương hiệu khai báo trong `tailwind.config` → `bg-brand`, `text-brand` |
| JS | ES module thuần (`app.js`, `type="module"`) | Cần state/binding nhiều → thêm **Alpine.js 3.14.9** (jsDelivr, ghim version) |
| Thư viện ngoài | Chỉ CDN, **ghim version** | cdnjs / jsDelivr. Ví dụ jsPDF 2.5.1, JSZip 3.10.1 |
| Font | Mặc định hệ thống | Cần font riêng → Google Fonts kèm `subset=vietnamese` |
| Backend | Firebase (Hosting; Firestore/Auth/RTDB khi cần) | Cloudflare Pages chỉ khi cần Functions/D1 (như Bé Vui Học) |
| Ngôn ngữ UI | Tiếng Việt, `lang="vi"` | Comment code cũng tiếng Việt |

## 2. Cấu trúc thư mục

```
MyApp/
  public/            ← mã nguồn (sửa ở đây)
    index.html
    app.js           ← logic chính, gọi registerPWA()
    pwa.js           ← đăng ký SW + tự reload khi có bản mới
    nozoom.js        ← chặn zoom (load trong <head>, trước mọi thứ)
    base.css         ← reset chung (no-zoom, safe-area, chọn chữ…)
    sw.js            ← service worker
    manifest.json
    icons/           ← icon-192, icon-512, icon-maskable-512, apple-touch-icon
  tools/make_icons.py
  deploy.sh          ← copy public → dist, thay __BUILD__, firebase deploy
  firebase.json, .firebaserc, .gitignore
```

`dist/` là bản build, không sửa tay, không commit.

## 3. PWA (cài lên màn hình chính)

- `manifest.json`: `display: standalone`, `start_url`/`scope` = `./`, `lang: vi`, đủ 3 icon (192, 512, maskable 512).
- `<head>` phải có: `link rel=manifest`, `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title`.
- Icon maskable chừa lề an toàn (~30%) để Android cắt tròn không mất hình.
- **Service worker** (`sw.js`):
  - Tên cache `slug-__BUILD__` → mỗi lần deploy là cache mới, cache cũ bị xoá.
  - File cùng origin: **network-first**, offline thì lấy cache.
  - CDN: **stale-while-revalidate**. API (googleapis, Firestore…) không đụng tới.
  - `skipWaiting` + `clients.claim`; trang nghe `controllerchange` để **tự reload** khi có bản mới, và gọi `reg.update()` mỗi khi app quay lại foreground.
  - Chỉ đăng ký trên `https:` (localhost không cache cho dễ dev).
- Thêm file mới vào app → nhớ thêm vào `SHELL` trong `sw.js`.

## 4. Không zoom, cảm giác như app native

Cả 3 lớp, thiếu lớp nào là iOS/Android vẫn zoom được:

1. **Viewport**: `width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`
2. **CSS (`base.css`)**:
   - `touch-action: manipulation` (bỏ double-tap zoom)
   - `input, textarea, select { font-size: 16px }` (iOS tự zoom khi focus ô < 16px)
   - `overscroll-behavior: none` (bỏ pull-to-refresh / nảy)
   - `user-select: none` + `-webkit-touch-callout: none` ở body; ô nhập vẫn chọn chữ được
   - `-webkit-tap-highlight-color: transparent`
3. **JS (`nozoom.js`)**: chặn `gesturestart/change/end` (Safari), `touchmove` 2 ngón, double-tap < 300ms (tự `click()` lại nút), và Ctrl/⌘ + lăn chuột / `+ - 0` trên máy tính.

Vùng tự xử lý cử chỉ (canvas kéo góc, bản đồ…) thì gắn `touch-action: none` riêng (class `.touch-none-all`).

## 5. Giao diện

- Nền `bg-slate-100`, chữ `text-slate-900`, thẻ `bg-white rounded-2xl border border-slate-200 shadow-sm`.
- Header `sticky top-0` màu brand + `.safe-top`; thanh dưới cố định dùng `.safe-bottom` (tai thỏ / thanh home).
- Nút: `rounded-xl py-3 font-semibold`, phản hồi bằng `active:` (không dựa vào `hover:` trên mobile).
- Nội dung giới hạn `max-w-3xl`–`max-w-6xl mx-auto px-4`.
- Thiết kế mobile trước, rồi `sm:`/`lg:` cho máy tính.

## 6. Deploy

- `./deploy.sh`: tự chuyển Node ≥ 20 qua nvm, kiểm tra account `huypvn.urani@gmail.com`, build `dist/` với `BUILD=YYYYmmddHHMMSS` thay vào mọi `__BUILD__`, rồi `firebase deploy --only hosting`.
- `firebase.json`: `html/js/css/json/png` → `Cache-Control: no-cache`; `sw.js` → `no-store`.
- Asset trong HTML/manifest gắn `?v=__BUILD__` để icon/manifest luôn mới sau deploy.
- Firebase web config (nếu dùng Firestore/Auth): sinh ra `public/firebase-config.js` lúc deploy, không commit (xem `YuhTahnLan2/deploy.sh`).

## 7. Chạy local

```bash
python3 -m http.server 5300 -d MyApp/public
```

`new-app.sh` tự thêm cấu hình vào `.claude/launch.json` để Claude mở preview được.

## 8. Checklist trước khi giao

- [ ] Mở trên iPhone + Android: chụm 2 ngón, chạm đúp, focus ô nhập → **không zoom**
- [ ] "Thêm vào màn hình chính" ra đúng icon + tên, mở lên không có thanh địa chỉ
- [ ] Tắt mạng mở lại app → vẫn lên giao diện
- [ ] Deploy lần 2 → app đang mở tự reload sang bản mới
- [ ] Không còn `__APP_NAME__`/`__THEME__`… sót trong code
