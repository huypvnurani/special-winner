# YuhTahnTax – Tính lương & thuế TNCN

PWA tĩnh theo chuẩn Yuh App — đọc `STANDARD.md` trước khi sửa.

- Sửa code trong `public/`; `dist/` do `deploy.sh` sinh ra.
- Tailwind Play CDN + JS module thuần; không thêm bước build.
- Giữ nguyên cơ chế chặn zoom (viewport + `base.css` + `nozoom.js`).
- Thêm file mới → thêm vào `SHELL` trong `public/sw.js`.
- Deploy: `./deploy.sh` (Firebase project `yuhtahntax`).

## Dữ liệu người dùng & file `.yuhtax` — đọc `FORMAT.md` trước khi sửa

- Dữ liệu chỉ lưu trên máy người dùng (IndexedDB, `public/db.js`); không thêm backend lưu dữ liệu.
- File `.yuhtax` cũ phải luôn mở được: chỉ thêm trường (có mặc định trong `public/datafile.js`), đổi cấu trúc thì tăng `FILE_FORMAT` + thêm migration, không xoá file mẫu trong `tools/fixtures/`.
- Kiểm tra: `node tools/check-yuhtax.mjs` (deploy.sh tự chạy).
- Kết quả hiển thị, PDF và Excel đều dựng từ cùng object `report` (`monthReport()` / `yearReport()` trong `app.js`, xuất file ở `export.js`).
