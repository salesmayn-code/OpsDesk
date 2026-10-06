import type { AuthUser } from '../../common/auth-user';

export interface TicketVisibility {
  requesterId: string;
  assigneeId: string | null;
  teamId: string | null;
  teamManagerId: string | null;
  watcherIds: string[];
}

function isAdmin(user: AuthUser): boolean {
  return user.roleKeys.includes('ADMIN') || user.permissions.includes('ticket:admin_override');
}

/** Ownership + organizational scope (TRD §5.1). Unauthorized rows resolve to 404 at the service. */
export function canViewTicket(user: AuthUser, ticket: TicketVisibility): boolean {
  if (isAdmin(user)) return true;
  const own =
    ticket.requesterId === user.id ||
    ticket.assigneeId === user.id ||
    ticket.watcherIds.includes(user.id);
  if (user.permissions.includes('ticket:view_all')) {
    return own || (ticket.teamManagerId !== null && ticket.teamManagerId === user.id);
  }
  if (user.permissions.includes('ticket:view_team')) {
    return own || (ticket.teamId !== null && user.teamIds.includes(ticket.teamId));
  }
  if (user.permissions.includes('ticket:view')) return own;
  return false;
}

export function isAdminOverride(user: AuthUser): boolean {
  return user.permissions.includes('ticket:admin_override');
}
