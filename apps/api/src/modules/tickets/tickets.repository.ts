import { Injectable } from '@nestjs/common';
import type { Prisma, Priority, SlaState, TicketType } from '@prisma/client';
import type { TicketQuery, TicketStatus } from '@opsdesk/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../../common/auth-user';

export const TICKET_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'dueAt',
  'priority',
  'status',
  'key',
] as const;

const SUMMARY_INCLUDE = {
  requester: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
  team: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  asset: { select: { id: true, tag: true, name: true, status: true } },
  watchers: { select: { userId: true } },
  team: { select: { id: true, name: true, managerId: true } },
  slaTimers: { where: { isCurrent: true }, orderBy: { kind: 'asc' } },
  incidentLink: {
    include: {
      incident: { select: { id: true, key: true, title: true, status: true, severity: true } },
    },
  },
} satisfies Prisma.TicketInclude;

export type TicketSummaryRow = Prisma.TicketGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
export type TicketDetailRow = Prisma.TicketGetPayload<{ include: typeof DETAIL_INCLUDE }>;

export function ticketLookup(idOrKey: string): Prisma.TicketWhereUniqueInput {
  return idOrKey.toUpperCase().startsWith('TKT-') ? { key: idOrKey.toUpperCase() } : { id: idOrKey };
}

@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Query scoping (TRD §5.1 layer 4): unauthorized rows are never fetched. */
  buildScope(user: AuthUser): Prisma.TicketWhereInput | undefined {
    if (user.roleKeys.includes('ADMIN') || user.permissions.includes('ticket:admin_override')) {
      return undefined;
    }
    const own: Prisma.TicketWhereInput[] = [
      { requesterId: user.id },
      { assigneeId: user.id },
      { watchers: { some: { userId: user.id } } },
    ];
    if (user.permissions.includes('ticket:view_all')) {
      return { OR: [...own, { team: { managerId: user.id } }] };
    }
    if (user.permissions.includes('ticket:view_team')) {
      return { OR: [...own, { teamId: { in: user.teamIds } }] };
    }
    return { OR: own };
  }

  buildWhere(query: TicketQuery, scope: Prisma.TicketWhereInput | undefined, user: AuthUser) {
    const conditions: Prisma.TicketWhereInput[] = [];
    if (scope) conditions.push(scope);
    if (query.q) {
      conditions.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { key: { equals: query.q.toUpperCase() } },
        ],
      });
    }
    if (query.status?.length) conditions.push({ status: { in: query.status as TicketStatus[] } });
    if (query.priority?.length) {
      conditions.push({ priority: { in: query.priority as Priority[] } });
    }
    if (query.type?.length) conditions.push({ type: { in: query.type as TicketType[] } });
    if (query.categoryId) {
      conditions.push({
        OR: [{ categoryId: query.categoryId }, { subcategoryId: query.categoryId }],
      });
    }
    if (query.teamId) conditions.push({ teamId: query.teamId });
    if (query.assigneeId) conditions.push({ assigneeId: query.assigneeId });
    if (query.requesterId) conditions.push({ requesterId: query.requesterId });
    if (query.departmentId) conditions.push({ departmentId: query.departmentId });
    if (query.assetId) conditions.push({ assetId: query.assetId });
    if (query.slaState?.length) {
      conditions.push({ slaState: { in: query.slaState as SlaState[] } });
    }
    if (query.createdFrom || query.createdTo) {
      conditions.push({
        createdAt: {
          ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
          ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
        },
      });
    }
    if (query.updatedFrom || query.updatedTo) {
      conditions.push({
        updatedAt: {
          ...(query.updatedFrom ? { gte: new Date(query.updatedFrom) } : {}),
          ...(query.updatedTo ? { lte: new Date(query.updatedTo) } : {}),
        },
      });
    }
    if (query.view === 'mine') {
      conditions.push({ OR: [{ assigneeId: user.id }, { requesterId: user.id }] });
    } else if (query.view === 'team') {
      conditions.push({ teamId: { in: user.teamIds } });
    } else if (query.view === 'unassigned') {
      conditions.push({ assigneeId: null, teamId: { in: user.teamIds } });
    }
    return conditions.length > 0 ? { AND: conditions } : {};
  }

  async list(where: Prisma.TicketWhereInput, orderBy: Prisma.TicketOrderByWithRelationInput[], skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({ where, orderBy, skip, take, include: SUMMARY_INCLUDE }),
    ]);
  }

  findDetail(idOrKey: string): Promise<TicketDetailRow | null> {
    return this.prisma.ticket.findUnique({
      where: ticketLookup(idOrKey),
      include: DETAIL_INCLUDE,
    });
  }

  countPublicComments(ticketId: string): Promise<number> {
    return this.prisma.ticketComment.count({ where: { ticketId, visibility: 'PUBLIC' } });
  }
}
