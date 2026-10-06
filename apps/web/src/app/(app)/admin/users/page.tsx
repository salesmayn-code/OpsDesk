'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { UserStatus } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import {
  useAdminUsers,
  useChangeUserStatus,
  useDepartments,
  useInviteUser,
  useRoles,
  useTeams,
  useUpdateUserRoles,
} from '@/features/admin/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/toast';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_TONES: Record<UserStatus, string> = {
  ACTIVE: 'bg-status-success-bg text-status-success-fg',
  INVITED: 'bg-status-info-bg text-status-info-fg',
  SUSPENDED: 'bg-status-warning-bg text-status-warning-fg',
  DISABLED: 'bg-status-muted-bg text-status-muted-fg',
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-title font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rolesFor, setRolesFor] = useState<{ id: string; name: string; roleIds: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (search.trim()) query.set('q', search.trim());
  if (status) query.set('status', status);
  // Recently active first keeps the console useful as the directory grows.
  query.set('sort', '-lastLoginAt');
  query.set('pageSize', '50');

  const users = useAdminUsers(query.toString());
  const roles = useRoles();
  const departments = useDepartments();
  const teams = useTeams();
  const invite = useInviteUser();
  const changeStatus = useChangeUserStatus();
  const updateRoles = useUpdateUserRoles();
  const { toast } = useToast();

  const onError = (mutationError: unknown) =>
    setError(
      mutationError instanceof ApiClientError ? mutationError.message : 'Something went wrong.',
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-semibold tracking-tight">Users</h1>
        {can('user:create') ? <Button onClick={() => setInviteOpen(true)}>Invite user</Button> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <Input
          id="user-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or email…"
          className="max-w-xs"
        />
        <label htmlFor="user-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="user-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="INVITED">Invited</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DISABLED">Disabled</option>
        </select>
      </div>

      {users.isLoading ? (
        <div role="status" aria-label="Loading users" className="space-y-3 rounded-card border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
          ))}
        </div>
      ) : users.isError ? (
        <p role="alert" className="text-sm text-status-danger-fg">
          Could not load users.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Email</th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Department</th>
                <th scope="col" className="px-3 py-2 font-medium">Roles</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Last login</th>
                <th scope="col" className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users.data?.data ?? []).map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-card-muted">
                  <td className="px-3 py-2">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {user.departmentName ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    {user.roles.map((role) => role.name).join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                        STATUS_TONES[user.status],
                      )}
                    >
                      {user.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                    {user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'Never'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {can('role:manage') ? (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() =>
                            setRolesFor({
                              id: user.id,
                              name: `${user.firstName} ${user.lastName}`,
                              roleIds: user.roles.map((role) => role.id),
                            })
                          }
                        >
                          Roles
                        </button>
                      ) : null}
                      {can('user:disable') && user.status !== 'ACTIVE' ? (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() =>
                            changeStatus.mutate({ id: user.id, status: 'ACTIVE' }, { onError })
                          }
                        >
                          Activate
                        </button>
                      ) : null}
                      {can('user:disable') && user.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          className="text-xs text-status-warning-fg hover:underline"
                          onClick={() =>
                            changeStatus.mutate(
                              { id: user.id, status: 'SUSPENDED', reason: 'Admin action' },
                              { onError },
                            )
                          }
                        >
                          Suspend
                        </button>
                      ) : null}
                      {can('user:disable') && user.status !== 'DISABLED' ? (
                        <button
                          type="button"
                          className="text-xs text-status-danger-fg hover:underline"
                          onClick={() =>
                            changeStatus.mutate(
                              { id: user.id, status: 'DISABLED', reason: 'Admin action' },
                              { onError },
                            )
                          }
                        >
                          Disable
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen ? (
        <Modal title="Invite user" onClose={() => setInviteOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const roleIds = form.getAll('roleIds').map(String);
              const teamIds = form.getAll('teamIds').map(String);
              if (roleIds.length === 0) {
                setError('Select at least one role.');
                return;
              }
              invite.mutate(
                {
                  email: String(form.get('email')),
                  firstName: String(form.get('firstName')),
                  lastName: String(form.get('lastName')),
                  jobTitle: String(form.get('jobTitle') || '') || undefined,
                  departmentId: String(form.get('departmentId') || '') || undefined,
                  roleIds,
                  teamIds,
                },
                {
                  onSuccess: () => {
                    setInviteOpen(false);
                    toast('Invitation sent');
                  },
                  onError,
                },
              );
            }}
          >
            <Field label="Email" htmlFor="invite-email" required>
              <Input id="invite-email" name="email" type="email" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" htmlFor="invite-first" required>
                <Input id="invite-first" name="firstName" required />
              </Field>
              <Field label="Last name" htmlFor="invite-last" required>
                <Input id="invite-last" name="lastName" required />
              </Field>
            </div>
            <Field label="Job title" htmlFor="invite-title">
              <Input id="invite-title" name="jobTitle" />
            </Field>
            <Field label="Department" htmlFor="invite-department">
              <select
                id="invite-department"
                name="departmentId"
                className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
              >
                <option value="">No department</option>
                {(departments.data?.data ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend className="text-sm font-medium">Roles *</legend>
              {(roles.data?.data ?? []).map((role) => (
                <label key={role.id} className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="roleIds" value={role.id} />
                  {role.name}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Support teams</legend>
              {(teams.data?.data ?? []).map((team) => (
                <label key={team.id} className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="teamIds" value={team.id} />
                  {team.name}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? 'Sending…' : 'Send invitation'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {rolesFor ? (
        <Modal title={`Roles · ${rolesFor.name}`} onClose={() => setRolesFor(null)}>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const roleIds = form.getAll('roleIds').map(String);
              if (roleIds.length === 0) {
                setError('Select at least one role.');
                return;
              }
              updateRoles.mutate(
                { id: rolesFor.id, roleIds },
                { onSuccess: () => setRolesFor(null), onError },
              );
            }}
          >
            {(roles.data?.data ?? []).map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="roleIds"
                  value={role.id}
                  defaultChecked={rolesFor.roleIds.includes(role.id)}
                />
                {role.name}
              </label>
            ))}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={updateRoles.isPending}>
                Save roles
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRolesFor(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
