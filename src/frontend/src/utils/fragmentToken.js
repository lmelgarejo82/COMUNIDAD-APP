export function consumeFragmentToken(windowLike) {
  const hash = windowLike.location.hash;
  if (!hash) return null;
  const token = new URLSearchParams(hash.slice(1)).get('token');
  if (!token) return null;
  windowLike.history.replaceState(
    null,
    '',
    `${windowLike.location.pathname}${windowLike.location.search}`
  );
  return token;
}

export function subscribeFragmentToken(windowLike, onToken) {
  const pathname = windowLike.location.pathname;
  let active = true;
  let consuming = false;

  function consume() {
    if (!active || consuming || windowLike.location.pathname !== pathname) return;
    consuming = true;
    try {
      const token = consumeFragmentToken(windowLike);
      if (active && token) onToken(token);
    } finally {
      consuming = false;
    }
  }

  windowLike.addEventListener('hashchange', consume);
  consume();
  return () => {
    active = false;
    windowLike.removeEventListener('hashchange', consume);
  };
}
