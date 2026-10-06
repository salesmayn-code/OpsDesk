import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique, users } from './helpers';

test.describe('Optimistic concurrency (E2E-4)', () => {
  test('a stale version shows the conflict banner and reload recovers', async ({ browser }) => {
    const agentContext = await browser.newContext();
    const managerContext = await browser.newContext();
    await loginAs(agentContext, users.agent);
    await loginAs(managerContext, users.manager);

    try {
      const categories = (await (
        await agentContext.request.get(`${API_URL}/api/v1/categories`)
      ).json()) as { data: { id: string; name: string }[] };
      const hardware = categories.data.find((category) => category.name === 'Hardware')!;
      const created = await agentContext.request.post(`${API_URL}/api/v1/tickets`, {
        data: {
          title: unique('E2E conflict ticket'),
          description: 'Conflicting edits E2E.',
          type: 'INCIDENT',
          categoryId: hardware.id,
        },
      });
      const ticket = ((await created.json()) as { data: { id: string; version: number } }).data;

      const page = await agentContext.newPage();
      await page.goto(`/tickets/${ticket.id}`);

      // Someone else updates the ticket after the page loaded.
      const patch = await managerContext.request.patch(`${API_URL}/api/v1/tickets/${ticket.id}`, {
        data: { version: ticket.version, priority: 'HIGH' },
      });
      expect(patch.status()).toBe(200);

      // The stale UI action is rejected with 409 and shows the banner.
      // (Start work needs assignment; assign first through the API as the same agent.)
      const me = (await (await agentContext.request.get(`${API_URL}/api/v1/auth/me`)).json()) as {
        data: { id: string };
      };
      await agentContext.request.post(`${API_URL}/api/v1/tickets/${ticket.id}/assignment`, {
        data: { version: ticket.version + 1, assigneeId: me.data.id },
      });
      await page.reload();
      const fresh = (await (
        await agentContext.request.get(`${API_URL}/api/v1/tickets/${ticket.id}`)
      ).json()) as { data: { version: number } };
      // Bump the version externally once more so the loaded page goes stale.
      await managerContext.request.patch(`${API_URL}/api/v1/tickets/${ticket.id}`, {
        data: { version: fresh.data.version, priority: 'CRITICAL' },
      });

      await page.getByRole('button', { name: 'Start work' }).click();
      const banner = page.getByRole('alert').filter({ hasText: 'updated by someone else' });
      await expect(banner).toBeVisible();
      await page.getByRole('button', { name: 'Reload' }).click();
      await expect(banner).toHaveCount(0);
      await page.getByRole('button', { name: 'Start work' }).click();
      await expect(page.getByLabel('Status: In progress')).toBeVisible();
    } finally {
      await agentContext.close();
      await managerContext.close();
    }
  });
});
