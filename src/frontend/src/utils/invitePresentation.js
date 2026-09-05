export function partitionInvites(invites) {
  return invites.reduce((groups, invite) => {
    groups[invite.status === 'pending' ? 'pending' : 'history'].push(invite);
    return groups;
  }, { pending: [], history: [] });
}

export function inviteStatusLabel(status) {
  return { pending: 'Pendiente', used: 'Usada', expired: 'Vencida' }[status] || 'Desconocida';
}
