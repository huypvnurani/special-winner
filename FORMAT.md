# Định dạng dữ liệu YuhTahnTax & file `.yuhtax`

Cam kết: **file `.yuhtax` người dùng lưu ở bất kỳ phiên bản nào cũng phải mở được ở mọi phiên bản app sau này.**

## Nơi lưu

- Trên máy người dùng: IndexedDB `yuhtahntax`, object store `kv` (key → value). Không gửi lên server.
  Trình duyệt không có IndexedDB thì lùi về `localStorage` với tiền tố `ytt:`.
- File sao lưu `.yuhtax`: JSON UTF-8 chứa toàn bộ các key đó.

## Cấu trúc file (format 1)

```json
{
  "app": "YuhTahnTax",
  "format": 1,
  "build": "20261107100000",
  "exportedAt": "2026-11-07T02:55:50.692Z",
  "data": {
    "month": { … },
    "year:2026": { … },
    "yearSel": 2026,
    "tab": "year"
  }
}
```

| Key | Nội dung | Làm sạch bằng |
|---|---|---|
| `month` | Ô nhập tab Lương tháng: `mode` (g2n/n2g), `amount`, `ym`, `region`, `dep`, `insMode`, `insSalary`, `exempt`, `contract` (ld/short), `meal`, `union`, `syncYear` | `normalizeMonth` |
| `year:YYYY` | Quyết toán năm: `region`, `months[12]` (`taxable`, `ins`, `withheld`, `dep`), `depMonths`, `depAuto`, `sources[]` (`name`, `kind` ld/vl, `income`, `ins`, `withheld`), `charity`, `pension` | `normalizeYear` |
| `yearSel`, `tab` | Năm / tab đang mở | kiểm tra trong `app.js` |

Số tiền luôn là số nguyên VNĐ (không phải chuỗi). Trường lạ được giữ nguyên khi nạp.

## Quy tắc khi sửa app

1. **Chỉ thêm trường**, không đổi tên / đổi ý nghĩa / xoá trường cũ. Trường mới phải có giá trị mặc định trong `normalize*` của `public/datafile.js`.
2. Bắt buộc phải đổi cấu trúc → tăng `FILE_FORMAT` và thêm `MIGRATIONS[n]` (format n → n+1) trong `datafile.js`. **Không bao giờ xoá migration cũ.**
3. Mọi dữ liệu nạp vào (file hay IndexedDB) đều đi qua `parse` + `normalize*` → thiếu thì lấy mặc định, sai kiểu thì sửa.
4. Mỗi khi đổi format: xuất một file thật từ app, thêm vào `tools/fixtures/` kèm `_expect`. **Không sửa/xoá file mẫu cũ.**
5. `deploy.sh` chạy `node tools/check-yuhtax.mjs` trước khi deploy: file mẫu nào không mở được thì dừng deploy.

## Lịch sử

| Format | Thời gian | Thay đổi |
|---|---|---|
| (không có) | 11/2026, bản đầu | Chỉ lưu trên máy (localStorage), năm có `otherInc`/`otherTax` → tự chuyển thành `sources[0]` |
| 1 | 11/2026 | IndexedDB + file `.yuhtax`; nhiều nguồn thu nhập; loại hợp đồng, phụ cấp ăn trưa, công đoàn |
