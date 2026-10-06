import type { TicketType } from '@opsdesk/contracts';

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  INCIDENT: 'Incident',
  SERVICE_REQUEST: 'Service request',
  ACCESS_REQUEST: 'Access request',
  HARDWARE_REQUEST: 'Hardware request',
  SOFTWARE_REQUEST: 'Software request',
};

export const TICKET_TYPE_CARDS: { type: TicketType; title: string; description: string }[] = [
  { type: 'INCIDENT', title: 'Something is broken', description: 'Report a problem or outage' },
  { type: 'HARDWARE_REQUEST', title: 'Request equipment', description: 'Laptop, monitor, phone…' },
  { type: 'SOFTWARE_REQUEST', title: 'Request software', description: 'Install or license a tool' },
  { type: 'ACCESS_REQUEST', title: 'Request access', description: 'Accounts, VPN, permissions' },
  { type: 'SERVICE_REQUEST', title: 'Other service', description: 'Anything else IT can help with' },
];
