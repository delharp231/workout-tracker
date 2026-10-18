// Back-gesture rules. The history stack is never deeper than two entries: Home, and the one
// screen opened from it. So back from any screen goes to Home, and back from Home leaves the app.
// depth is 0 on Home and 1 anywhere else. Returns what showScreen does with the history stack.
export function navAction(depth, name) {
  if (name === 'home') return depth > 0 ? 'back' : 'none';
  return depth === 0 ? 'push' : 'replace';
}
