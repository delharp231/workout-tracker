// Keeps the screen on during a workout (spec §7.2, settings.keepScreenOn). The browser drops the
// lock whenever the page is hidden, so it's re-requested on return. Every failure is silent: this
// is a convenience, never a reason to block logging.
let sentinel = null;
let wanted = false;

async function request() {
  if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') request();
});

export async function acquire() {
  wanted = true;
  await request();
}

export async function release() {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  try { await s?.release(); } catch { /* already released */ }
}

export const isHeld = () => !!sentinel;
