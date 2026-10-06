import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique, users } from './helpers';

test.describe('SLA pause/resume (E2E-2)', () => {
  test('waiting for user pauses the resolution timer and a reply resumes it', async ({
    browser,
  }) => {
    const employeeContext = await browser.newContext();
    const agentContext = await browser.newContext();
    await loginAs(employeeContext, users.employee);
    await loginAs(agentContext, users.agent);

    try {
      const categories = (await (
        await employeeContext.request.get(`${API_URL}/api/v1/categories`)
      ).json()) as { data: { id: string; name: string }[] };
      const hardware = categories.data.find((category) => category.name === 'Hardware')!;
      const created = await employeeContext.request.post(`${API_URL}/api/v1/tickets`, {
        data: {
          title: unique('E2E SLA ticket'),
          description: 'SLA pause/resume E2E.',
          type: 'INCIDENT',
          categoryId: hardware.id,
        },
      });
      const ticket = ((await created.json()) as { data: { id: string; version: number } }).data;

      const me = (await (await agentContext.request.get(`${API_URL}/api/v1/auth/me`)).json()) as {
        data: { id: string };
      };
      const assigned = await agentContext.request.post(
        `${API_URL}/api/v1/tickets/${ticket.id}/assignment`,
        { data: { version: ticket.version, assigneeId: me.data.id } },
      );
      expect(assigned.status()).toBe(200);

      const page = await agentContext.newPage();
      await page.goto(`/tickets/${ticket.id}`);
      await page.getByRole('button', { name: 'Start work' }).click();
      await expect(page.getByLabel('Status: In progress')).toBeVisible();
      await page.getByLabel('Message').fill('Could you confirm the error message?');
      await page.getByRole('button', { name: 'Send reply' }).click();
      await page.getByRole('button', { name: 'Waiting for user' }).click();
      await expect(page.getByLabel('Status: Waiting for user')).toBeVisible();

      const paused = (await (
        await agentContext.request.get(`${API_URL}/api/v1/tickets/${ticket.id}/sla`)
      ).json()) as { data: { timers: { kind: string; state: string; pausedAt: string | null }[] } };
      const pausedResolution = paused.data.timers.find((timer) => timer.kind === 'RESOLUTION')!;
      expect(pausedResolution.state).toBe('PAUSED');
      expect(pausedResolution.pausedAt).not.toBeNull();

      // Employee replies through the UI; the ticket resumes automatically.
      const employeePage = await employeeContext.newPage();
      await employeePage.goto(`/tickets/${ticket.id}`);
      await expect(employeePage.getByText('IT is waiting for your reply.')).toBeVisible();
      await employeePage.getByLabel('Message').fill('The error is E-4012 after login.');
      await employeePage.getByRole('button', { name: 'Send reply' }).click();
      await expect(employeePage.getByLabel('Status: In progress')).toBeVisible();

      const resumed = (await (
        await employeeContext.request.get(`${API_URL}/api/v1/tickets/${ticket.id}/sla`)
      ).json()) as {
        data: {
          timers: { kind: string; state: string; pausedAt: string | null; pausedMinutes: number }[];
          events: { type: string }[];
        };
      };
      const resolution = resumed.data.timers.find((timer) => timer.kind === 'RESOLUTION')!;
      expect(resolution.state).not.toBe('PAUSED');
      expect(resolution.pausedAt).toBeNull();
      expect(resumed.data.events.some((event) => event.type === 'RESUMED')).toBe(true);
    } finally {
      await employeeContext.close();
      await agentContext.close();
    }
  });
});
