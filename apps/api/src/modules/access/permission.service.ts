import { Injectable } from '@nestjs/common';
import type { UserStatus } from '@opsdesk/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../../common/auth-user';

interface CacheEntry {
  user: AuthUser | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

/**
 * Resolves the authenticated actor (roles -> permissions -> teams).
 * ponytail: in-process 60s cache; move to Redis when the API runs multi-instance,
 * and publish invalidation on role/status changes (TRD §5.1).
 */
@Injectable()
export class PermissionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getAuthUser(userId: string): Promise<AuthUser | null> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.user;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true } },
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: { select: { key: true } } } },
              },
            },
          },
        },
        teams: { select: { teamId: true } },
      },
    });

    const authUser: AuthUser | null = user
      ? {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status as UserStatus,
          departmentId: user.departmentId,
          roleKeys: user.roles.map((entry) => entry.role.key),
          permissions: [
            ...new Set(
              user.roles.flatMap((entry) =>
                entry.role.permissions.map((rp) => rp.permission.key),
              ),
            ),
          ],
          teamIds: user.teams.map((team) => team.teamId),
        }
      : null;

    this.cache.set(userId, { user: authUser, expiresAt: Date.now() + CACHE_TTL_MS });
    return authUser;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
