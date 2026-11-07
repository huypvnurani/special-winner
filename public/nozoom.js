// Chặn mọi kiểu zoom: pinch, chạm đúp (mobile) và Ctrl/⌘ + cuộn / + - 0 (máy tính).
// iOS Safari bỏ qua user-scalable=no trong viewport nên phải chặn bằng JS.
(function () {
  const stop = (e) => e.preventDefault();

  // Pinch zoom trên Safari
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  document.addEventListener('gestureend', stop);

  // Pinch 2 ngón trên các trình duyệt khác
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // Dự phòng double-tap zoom: 2 lần touchend cách nhau < 300ms
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const t = e.target;
    const tag = t && t.tagName;
    if (now - lastTouchEnd < 300 && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      // preventDefault làm mất click → tự bấm lại để chạm nhanh liên tiếp vẫn ăn
      const btn = t.closest && t.closest('button, a, label, [role="button"]');
      if (btn && !btn.disabled) btn.click();
    }
    lastTouchEnd = now;
  }, { passive: false });

  // Máy tính: Ctrl/⌘ + lăn chuột, Ctrl/⌘ + = - 0
  document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].includes(e.key)) e.preventDefault();
  });
})();
