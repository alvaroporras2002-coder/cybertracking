export function readRoute() {
  const parts = location.hash.slice(1).split('/');
  return { page: parts[0] || 'home', id: parts[1], tab: parts[2] || 'learn' };
}
export function navigate(hash) { location.hash = hash; }
export function initRouter(onChange, { beforeChange = async () => {}, onError = () => {} } = {}) {
  let acceptedHash = location.hash, version = 0, queue = Promise.resolve();
  const change = () => {
    const targetHash = location.hash, request = ++version;
    queue = queue.catch(() => {}).then(async () => {
      await beforeChange();
      if (request !== version) return;
      await onChange({ isCurrent: () => request === version });
      if (request === version) acceptedHash = targetHash;
    }).catch(error => {
      if (request === version) {
        if (window.history?.replaceState) window.history.replaceState(null, '', acceptedHash || '#home');
        else location.hash = acceptedHash || '#home';
        onError(error);
      }
    });
    return queue;
  };
  window.addEventListener('hashchange', change);
  return change();
}
