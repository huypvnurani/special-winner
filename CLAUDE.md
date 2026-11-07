# YuhTahnTax – Tính lương & thuế TNCN

PWA tĩnh theo chuẩn Yuh App — đọc `STANDARD.md` trước khi sửa.

- Sửa code trong `public/`; `dist/` do `deploy.sh` sinh ra.
- Tailwind Play CDN + JS module thuần; không thêm bước build.
- Giữ nguyên cơ chế chặn zoom (viewport + `base.css` + `nozoom.js`).
- Thêm file mới → thêm vào `SHELL` trong `public/sw.js`.
- Deploy: `./deploy.sh` (Firebase project `yuhtahntax`).
