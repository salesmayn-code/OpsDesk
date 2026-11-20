'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Priority, TicketDetail } from '@opsdesk/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/toast';
import { fetchUsers } from '@/features/admin/api';
import { useTeams } from '@/features/admin/hooks';
import { useAssets } from '@/features/assets/hooks';
import { useAssignTicket, useCategories, useUpdateTicket } from './hooks';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SELECT = 'h-9 w-full rounded-control border border-border bg-card px-2 text-sm';

interface Props {
  ticket: TicketDetail;
  canUpdate: boolean;
  canAssign: boolean;
  onError: (error: unknown) => void;
}

/**
 * Staff triage panel (TKT-5/6/7/15): priority, category, linked asset, team and assignee.
 * Field edits go through PATCH (SLA recalculated server-side); assignment through its own
 * action endpoint, chained on the version the update returns.
 */
export function TicketEditor({ ticket, canUpdate, canAssign, onError }: Props) {
  const initial = {
    priority: ticket.priority,
    categoryId: ticket.categoryId ?? '',
    subcategoryId: ticket.subcategoryId ?? '',
    assetId: ticket.assetId ?? '',
    teamId: ticket.team?.id ?? '',
    assigneeId: ticket.assignee?.id ?? '',
  };
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const categories = useCategories();
  const teams = useTeams();
  const assets = useAssets(`assignedUserId=${ticket.requester.id}&pageSize=50`);
  const members = useQuery({
    queryKey: ['admin', 'users', 'team', form.teamId],
    queryFn: () => fetchUsers(`teamId=${form.teamId}&status=ACTIVE&pageSize=100`),
    enabled: canAssign && Boolean(form.teamId),
  });
  const update = useUpdateTicket();
  const assign = useAssignTicket();
  const { toast } = useToast();

  const parent = categories.data?.data.find((category) => category.id === form.categoryId);
  const fieldsDirty =
    form.priority !== initial.priority ||
    form.categoryId !== initial.categoryId ||
    form.subcategoryId !== initial.subcategoryId ||
    form.assetId !== initial.assetId;
  const assignmentDirty = form.teamId !== initial.teamId || form.assigneeId !== initial.assigneeId;
  const saving = update.isPending || assign.isPending;

  const save = async () => {
    try {
      let version = ticket.version;
      if (canUpdate && fieldsDirty) {
        const updated = await update.mutateAsync({
          ticketId: ticket.id,
          version,
          ...(form.priority !== initial.priority ? { priority: form.priority } : {}),
          ...(form.categoryId !== initial.categoryId || form.subcategoryId !== initial.subcategoryId
            ? { categoryId: form.categoryId || null, subcategoryId: form.subcategoryId || null }
            : {}),
          ...(form.assetId !== initial.assetId ? { assetId: form.assetId || null } : {}),
        });
        version = updated.data.version;
      }
      if (canAssign && assignmentDirty) {
        await assign.mutateAsync({
          ticketId: ticket.id,
          version,
          teamId: form.teamId || null,
          assigneeId: form.assigneeId || null,
        });
      }
      toast('Ticket updated');
    } catch (error) {
      onError(error);
    }
  };

  return (
    <form
      className="rounded-card border border-border bg-card p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="text-title font-semibold">Triage &amp; assignment</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canUpdate ? (
          <>
            <Field label="Priority" htmlFor="edit-priority" hint="Changing it recalculates the SLA.">
              <select
                id="edit-priority"
                className={SELECT}
                value={form.priority}
                onChange={(event) => set({ priority: event.target.value as Priority })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority.charAt(0) + priority.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category" htmlFor="edit-category">
              <select
                id="edit-category"
                className={SELECT}
                value={form.categoryId}
                onChange={(event) => set({ categoryId: event.target.value, subcategoryId: '' })}
              >
                <option value="">Uncategorised</option>
                {categories.data?.data.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            {parent?.children?.length ? (
              <Field label="Subcategory" htmlFor="edit-subcategory">
                <select
                  id="edit-subcategory"
                  className={SELECT}
                  value={form.subcategoryId}
                  onChange={(event) => set({ subcategoryId: event.target.value })}
                >
                  <option value="">None</option>
                  {parent.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field
              label="Linked asset"
              htmlFor="edit-asset"
              hint={`Devices assigned to ${ticket.requester.firstName}.`}
            >
              <select
                id="edit-asset"
                className={SELECT}
                value={form.assetId}
                onChange={(event) => set({ assetId: event.target.value })}
              >
                <option value="">No asset</option>
                {ticket.asset && !assets.data?.data.some((asset) => asset.id === ticket.asset!.id) ? (
                  <option value={ticket.asset.id}>
                    {ticket.asset.tag} — {ticket.asset.name}
                  </option>
                ) : null}
                {assets.data?.data.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.tag} — {asset.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        {canAssign ? (
          <>
            <Field label="Team" htmlFor="edit-team">
              <select
                id="edit-team"
                className={SELECT}
                value={form.teamId}
                onChange={(event) => set({ teamId: event.target.value, assigneeId: '' })}
              >
                <option value="">No team</option>
                {teams.data?.data
                  .filter((team) => !team.archivedAt)
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Assignee" htmlFor="edit-assignee" hint="Only members of the team.">
              <select
                id="edit-assignee"
                className={SELECT}
                value={form.assigneeId}
                disabled={!form.teamId}
                onChange={(event) => set({ assigneeId: event.target.value })}
              >
                <option value="">Unassigned</option>
                {members.data?.data.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !(fieldsDirty || assignmentDirty)}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        {fieldsDirty || assignmentDirty ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setForm(initial)}>
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  );
}
