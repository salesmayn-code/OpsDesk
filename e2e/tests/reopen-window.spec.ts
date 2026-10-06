import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique, users } from './helpers';

test.describe('Reopen window (E2E-8)', () => {
  test('reopen works within the window and is rejected after it', async ({ browser }) => {
    test.setTimeout(180_000);
    const adminContext = await browser.newContext();
    const employeeContext = await browser.newContext();
    const agentContext = await browser.newContext();
    await loginAs(adminContext, users.admin);
    await loginAs(employeeContext, users.employee);
    await loginAs(agentContext, users.agent);

    const settings = (await (
      await adminContext.request.get(`${API_URL}/api/v1/settings`)
    ).json()) as { data: { reopen_window_days?: number } };
    const originalDays = settings.data.reopen_window_days ?? 7;

    const categories = (await (
      await employeeContext.request.get(`${API_URL}/api/v1/categories`)
    ).json()) as { data: { id: string; name: string }[] };
    const hardware = categories.data.find((category) => category.name === 'Hardware')!;

    async function resolvedTicket() {
      const created = await employeeContext.request.post(`${API_URL}/api/v1/tickets`, {
        data: {
          title: unique('E2E reopen ticket'),
          description: 'Reopen window E2E.',
          type: 'INCIDENT',
          categoryId: hardware.id,
        },
      });
      const ticket = ((await created.json()) as {
        data: { id: string; key: string; version: number };
      }).data;
      const me = (await (await agentContext.request.get(`${API_URL}/api/v1/auth/me`)).json()) as {
        data: { id: string };
      };
      const assigned = await agentContext.request.post(
        `${API_URL}/api/v1/tickets/${ticket.id}/assignment`,
        { data: { version: ticket.version, assigneeId: me.data.id } },
      );
      const assignedBody = (await assigned.json()) as { data: { version: number } };
      const inProgress = await agentContext.request.post(
        `${API_URL}/api/v1/tickets/${ticket.id}/transitions`,
        { data: { version: assignedBody.data.version, to: 'IN_PROGRESS' } },
      );
      const inProgressBody = (await inProgress.json()) as { data: { version: number } };
      const resolved = await agentContext.request.post(
        `${API_URL}/api/v1/tickets/${ticket.id}/transitions`,
        {
          data: {
            version: inProgressBody.data.version,
            to: 'RESOLVED',
            resolution: { code: 'FIXED', summary: 'Resolved for reopen-window E2E.' },
          },
        },
      );
      expect(resolved.status()).toBe(200);
      return ((await resolved.json()) as { data: { id: string; key: string; version: number } })
        .data;
    }

    try {
      // Within the window: the requester can reopen from the UI.
      const within = await resolvedTicket();
      const page = await employeeContext.newPage();
      await page.goto(`/tickets/${within.id}`);
      await expect(page.getByLabel('Status: Resolved')).toBeVisible();
      await page.getByRole('button', { name: 'Reopen' }).click();
      await page.getByLabel('Reason').fill('The issue returned after a restart.');
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByLabel('Status: Reopened')).toBeVisible();

      // After the window (0 days): option hidden and the API rejects.
      await adminContext.request.patch(`${API_URL}/api/v1/settings`, {
        data: { reopen_window_days: 0 },
      });
      const expired = await resolvedTicket();
      await page.goto(`/tickets/${expired.id}`);
      await expect(page.getByLabel('Status: Resolved')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reopen' })).toHaveCount(0);

      const blocked = await employeeContext.request.post(
        `${API_URL}/api/v1/tickets/${expired.id}/transitions`,
        { data: { version: expired.version, to: 'REOPENED', reason: 'too late' } },
      );
      expect(blocked.status()).toBe(422);
      expect(((await blocked.json()) as { code: string }).code).toBe('REOPEN_WINDOW_EXPIRED');
    } finally {
      await adminContext.request.patch(`${API_URL}/api/v1/settings`, {
        data: { reopen_window_days: originalDays },
      });
      await adminContext.close();
      await employeeContext.close();
      await agentContext.close();
    }
  });
});
