import type { UserStatus } from '@opsdesk/contracts';

/** Authenticated actor resolved on each request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  departmentId: string | null;
  roleKeys: string[];
  permissions: string[];
  teamIds: string[];
}
