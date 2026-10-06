import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { UserQuery } from '@opsdesk/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  buildWhere(query: UserQuery): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.teamId) where.teams = { some: { teamId: query.teamId } };
    if (query.role) where.roles = { some: { role: { key: query.role } } };
    return where;
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        department: true,
        roles: { include: { role: true } },
        teams: { select: { teamId: true } },
      },
    });
  }

  list(where: Prisma.UserWhereInput, orderBy: Prisma.UserOrderByWithRelationInput[], skipCount: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: skipCount,
        take,
        include: {
          department: { select: { name: true } },
          roles: { include: { role: true } },
          teams: { select: { teamId: true } },
        },
      }),
    ]);
  }
}
