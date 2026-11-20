'use client';

import { useState, type FormEvent } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/toast';
import type { TeamDto } from '@/features/admin/api';
import {
  useAdminUsers,
  useCreateDepartment,
  useCreateTeam,
  useDepartments,
  useSetTeamMembers,
  useTeam,
  useTeams,
  useUpdateDepartment,
  useUpdateTeam,
} from '@/features/admin/hooks';

const SELECT = 'h-9 w-full rounded-control border border-border bg-card px-2 text-sm';
const TH = 'px-3 py-2 font-medium';

function useErrorToast() {
  const { toast } = useToast();
  return (error: unknown) =>
    toast(error instanceof ApiClientError ? error.message : 'Something went wrong.');
}

/** ORG-1/2/3: departments and support teams, team membership and leads. */
export default function AdminOrgPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-display font-semibold tracking-tight">Teams &amp; departments</h1>
      <TeamsSection />
      <DepartmentsSection />
    </div>
  );
}

function TeamsSection() {
  const teams = useTeams();
  const users = useAdminUsers('status=ACTIVE&pageSize=100');
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const onError = useErrorToast();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [membersOf, setMembersOf] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<TeamDto | null>(null);

  const userName = (id: string | null) => {
    const user = users.data?.data.find((u) => u.id === id);
    return user ? `${user.firstName} ${user.lastName}` : '—';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
      {
        onSuccess: () => {
          toast(`Team “${name.trim()}” created`);
          setName('');
          setDescription('');
        },
        onError,
      },
    );
  };

  return (
    <section className="space-y-3">
      <h2 className="text-title font-semibold">Support teams</h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4">
        <Field label="New team" htmlFor="team-name">
          <Input id="team-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Applications" />
        </Field>
        <div className="min-w-60 flex-1">
          <Field label="Description" htmlFor="team-description">
            <Input id="team-description" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" size="sm" disabled={create.isPending}>
          Add team
        </Button>
      </form>

      <div className="overflow-x-auto rounded-card border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className={TH}>Team</th>
              <th scope="col" className={TH}>Members</th>
              <th scope="col" className={TH}>Lead</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {(teams.data?.data ?? []).map((team) => (
              <tr key={team.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  {renaming?.id === team.id ? (
                    <RenameForm
                      label={`Rename ${team.name}`}
                      initial={team.name}
                      pending={update.isPending}
                      onCancel={() => setRenaming(null)}
                      onSave={(value) =>
                        update.mutate({ id: team.id, name: value }, { onSuccess: () => setRenaming(null), onError })
                      }
                    />
                  ) : (
                    <>
                      <p className="font-medium">{team.name}</p>
                      {team.description ? <p className="text-xs text-muted-foreground">{team.description}</p> : null}
                    </>
                  )}
                </td>
                <td className="px-3 py-2">{team.memberCount}</td>
                <td className="px-3 py-2 text-muted-foreground">{userName(team.leadId)}</td>
                <td className="px-3 py-2 text-muted-foreground">{team.archivedAt ? 'Archived' : 'Active'}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Manage members of ${team.name}`} onClick={() => setMembersOf(membersOf === team.id ? null : team.id)}>
                      Members
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Rename ${team.name}`} onClick={() => setRenaming(team)}>
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${team.archivedAt ? 'Restore' : 'Archive'} ${team.name}`}
                      onClick={() => update.mutate({ id: team.id, archived: !team.archivedAt }, { onError })}
                    >
                      {team.archivedAt ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {membersOf ? <TeamMembersPanel key={membersOf} teamId={membersOf} onDone={() => setMembersOf(null)} /> : null}
    </section>
  );
}

function TeamMembersPanel({ teamId, onDone }: { teamId: string; onDone: () => void }) {
  const team = useTeam(teamId);
  const users = useAdminUsers('status=ACTIVE&pageSize=100');
  const save = useSetTeamMembers();
  const onError = useErrorToast();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [leadId, setLeadId] = useState<string | null | undefined>(undefined);

  if (!team.data || !users.data) {
    return <p className="text-sm text-muted-foreground">Loading members…</p>;
  }
  const members = selected ?? team.data.data.members.map((m) => m.id);
  const lead = leadId === undefined ? team.data.data.leadId : leadId;
  // Only staff work tickets; employees never belong to support teams.
  const staff = users.data.data.filter((u) => u.roles.some((r) => r.key !== 'EMPLOYEE'));

  const toggle = (id: string, checked: boolean) => {
    setSelected(checked ? [...members, id] : members.filter((m) => m !== id));
    if (!checked && lead === id) setLeadId(null);
  };

  return (
    <form
      className="space-y-4 rounded-card border border-border bg-card p-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(
          { id: teamId, userIds: members, leadId: lead && members.includes(lead) ? lead : null },
          {
            onSuccess: () => {
              toast('Team members saved');
              onDone();
            },
            onError,
          },
        );
      }}
    >
      <h3 className="text-title font-semibold">Members of {team.data.data.name}</h3>
      <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">Team members</legend>
        {staff.map((user) => (
          <label key={user.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={members.includes(user.id)} onChange={(e) => toggle(user.id, e.target.checked)} />
            {user.firstName} {user.lastName}
            <span className="text-xs text-muted-foreground">{user.roles.map((r) => r.name).join(', ')}</span>
          </label>
        ))}
      </fieldset>
      <div className="max-w-xs">
        <Field label="Team lead" htmlFor="team-lead" hint="Receives SLA escalations for this team.">
          <select id="team-lead" className={SELECT} value={lead ?? ''} onChange={(e) => setLeadId(e.target.value || null)}>
            <option value="">No lead</option>
            {staff
              .filter((u) => members.includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save members'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DepartmentsSection() {
  const departments = useDepartments();
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const onError = useErrorToast();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { name: name.trim(), code: code.trim().toUpperCase() },
      {
        onSuccess: () => {
          toast(`Department “${name.trim()}” created`);
          setName('');
          setCode('');
        },
        onError,
      },
    );
  };

  return (
    <section className="space-y-3">
      <h2 className="text-title font-semibold">Departments</h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4">
        <Field label="New department" htmlFor="dept-name">
          <Input id="dept-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing" />
        </Field>
        <Field label="Code" htmlFor="dept-code">
          <Input id="dept-code" required maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="MKT" className="w-28 uppercase" />
        </Field>
        <Button type="submit" size="sm" disabled={create.isPending}>
          Add department
        </Button>
      </form>

      <div className="overflow-x-auto rounded-card border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className={TH}>Department</th>
              <th scope="col" className={TH}>Code</th>
              <th scope="col" className={TH}>Members</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {(departments.data?.data ?? []).map((department) => (
              <tr key={department.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  {renaming === department.id ? (
                    <RenameForm
                      label={`Rename ${department.name}`}
                      initial={department.name}
                      pending={update.isPending}
                      onCancel={() => setRenaming(null)}
                      onSave={(value) =>
                        update.mutate({ id: department.id, name: value }, { onSuccess: () => setRenaming(null), onError })
                      }
                    />
                  ) : (
                    department.name
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{department.code}</td>
                <td className="px-3 py-2">{department.memberCount}</td>
                <td className="px-3 py-2 text-muted-foreground">{department.archivedAt ? 'Archived' : 'Active'}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Rename ${department.name}`} onClick={() => setRenaming(department.id)}>
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${department.archivedAt ? 'Restore' : 'Archive'} ${department.name}`}
                      onClick={() => update.mutate({ id: department.id, archived: !department.archivedAt }, { onError })}
                    >
                      {department.archivedAt ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RenameForm(props: {
  label: string;
  initial: string;
  pending: boolean;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) props.onSave(value.trim());
      }}
    >
      <Input aria-label={props.label} autoFocus required maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 max-w-56" />
      <Button type="submit" size="sm" disabled={props.pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
        Cancel
      </Button>
    </form>
  );
}
