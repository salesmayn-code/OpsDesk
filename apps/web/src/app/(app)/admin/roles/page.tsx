'use client';

import { useRoles } from '@/features/admin/hooks';

/** RBAC-4: read-only role → permission matrix, grouped by resource. */
export default function AdminRolesPage() {
  const roles = useRoles();
  const rank = (key: string) => {
    const index = ['EMPLOYEE', 'AGENT', 'MANAGER', 'ADMIN'].indexOf(key);
    return index === -1 ? 99 : index;
  };
  // Least to most privileged, so each column reads as a superset of the previous one.
  const list = [...(roles.data?.data ?? [])].sort((a, b) => rank(a.key) - rank(b.key));
  const permissions = [...new Set(list.flatMap((role) => role.permissions))].sort();
  const groups = Object.entries(
    permissions.reduce<Record<string, string[]>>((acc, permission) => {
      const resource = permission.split(':')[0]!;
      (acc[resource] ??= []).push(permission);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-display font-semibold tracking-tight">Roles &amp; permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What each system role can do. The API enforces these together with ownership and team
          scope; hiding a button in the UI is never the only control.
        </p>
      </div>

      {roles.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading roles…</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Permissions granted to each role</caption>
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Permission
                </th>
                {list.map((role) => (
                  <th key={role.id} scope="col" className="px-3 py-2 text-center font-medium">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map(([resource, keys]) => (
              <tbody key={resource}>
                <tr className="bg-card-muted">
                  <th
                    scope="colgroup"
                    colSpan={list.length + 1}
                    className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {resource}
                  </th>
                </tr>
                {keys.map((permission) => (
                  <tr key={permission} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-1.5 text-left font-mono text-xs font-normal">
                      {permission}
                    </th>
                    {list.map((role) => {
                      const granted = role.permissions.includes(permission);
                      return (
                        <td key={role.id} className="px-3 py-1.5 text-center">
                          {granted ? (
                            <span className="text-status-success-fg" aria-label="Granted">
                              ✓
                            </span>
                          ) : (
                            <span className="text-muted-foreground" aria-label="Not granted">
                              –
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
