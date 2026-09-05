export function partitionInvites(invites) {
  return invites.reduce((groups, invite) => {
    groups[invite.status === 'pending' ? 'pending' : 'history'].push(invite);
    return groups;
  }, { pending: [], history: [] });
}

export function inviteStatusLabel(status) {
  return { pending: 'Pendiente', used: 'Usada', expired: 'Vencida' }[status] || 'Desconocida';
}

export function inviteListViewState(loading, error, invites = []) {
  if (loading) return 'loading';
  if (error) return 'error';
  return invites.length > 0 ? 'loaded-data' : 'loaded-empty';
}

export function createInviteRequestTracker() {
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

export function addResendingInvite(resendingIds, inviteId) {
  if (resendingIds.has(inviteId)) return resendingIds;
  return new Set(resendingIds).add(inviteId);
}

export function removeResendingInvite(resendingIds, inviteId) {
  if (!resendingIds.has(inviteId)) return resendingIds;
  const nextIds = new Set(resendingIds);
  nextIds.delete(inviteId);
  return nextIds;
}
