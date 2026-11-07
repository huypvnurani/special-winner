// Đăng ký service worker + tự reload khi có bản deploy mới.
// Chỉ chạy trên https (localhost dev không cache để sửa code thấy ngay).
export function registerPWA() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;

  // SW mới nắm quyền → reload để thấy giao diện mới ngay (bỏ qua lần cài đầu tiên)
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    // PWA hay được mở lại từ nền: kiểm tra bản mới mỗi lần quay lại app
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
  }).catch(console.error);
}
