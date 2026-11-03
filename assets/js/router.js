export function readRoute() {
  const parts = location.hash.slice(1).split('/');
  return { page: parts[0] || 'home', id: parts[1], tab: parts[2] || 'learn' };
}
export function navigate(hash) { location.hash = hash; }
export function initRouter(onChange) { window.addEventListener('hashchange', onChange); onChange(); }
