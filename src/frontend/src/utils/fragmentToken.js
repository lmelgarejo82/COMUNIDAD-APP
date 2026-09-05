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
