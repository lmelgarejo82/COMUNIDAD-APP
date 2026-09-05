export function createLatestRequestTracker() {
  let latestRequest = 0;

  return {
    begin() {
      latestRequest += 1;
      return latestRequest;
    },
    isCurrent(requestId) {
      return requestId === latestRequest;
    },
    invalidate() {
      latestRequest += 1;
    },
  };
}

export async function runLatestRequest(tracker, request, { onSuccess, onError, onFinally }) {
  const requestId = tracker.begin();

  try {
    const result = await request();
    if (tracker.isCurrent(requestId)) onSuccess(result);
  } catch (error) {
    if (tracker.isCurrent(requestId)) onError(error);
  } finally {
    if (tracker.isCurrent(requestId)) onFinally();
  }
}
