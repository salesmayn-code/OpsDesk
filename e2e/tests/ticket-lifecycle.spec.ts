import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique, users } from './helpers';

test.describe('Ticket lifecycle (E2E-1)', () => {
  test('employee creates, agent works and resolves, employee closes', async ({
    browser,
  }) => {
    const title = unique('E2E laptop freezes');
    const employeeContext = await browser.newContext();
    const agentContext = await browser.newContext();
    await loginAs(employeeContext, users.employee);
    await loginAs(agentContext, users.agent);

    try {
      const employeePage = await employeeContext.newPage();
      await employeePage.goto('/tickets/new');
      await employeePage.getByRole('button', { name: /Something is broken/ }).click();
      await employeePage.getByLabel('Title').fill(title);
      await employeePage.getByLabel('Category').selectOption({ label: 'Hardware' });
      await employeePage
        .getByLabel('Description')
        .fill('Frozen several times today. Event log attached in person.');
      await employeePage.getByRole('button', { name: 'Submit ticket' }).click();
      await expect(employeePage).toHaveURL(/\/tickets\/TKT-\d+/);
      const ticketUrl = employeePage.url();
      const key = ticketUrl.split('/').pop()!;

      const agentPage = await agentContext.newPage();
      await agentPage.goto(`/tickets/${key}`);
      await agentPage.getByRole('button', { name: 'Assign to me' }).click();
      await expect(agentPage.getByLabel('Status: Assigned')).toBeVisible();

      await agentPage.getByRole('button', { name: 'Start work' }).click();
      await expect(agentPage.getByLabel('Status: In progress')).toBeVisible();

      // Reply publicly, then park the ticket on the user.
      await agentPage.getByLabel('Message').fill('Could you send the event log file?');
      await agentPage.getByRole('button', { name: 'Send reply' }).click();
      await expect(agentPage.getByText('Could you send the event log file?')).toBeVisible();
      await agentPage.getByRole('button', { name: 'Waiting for user' }).click();
      await expect(agentPage.getByLabel('Status: Waiting for user')).toBeVisible();

      // Employee sees the waiting banner and replies; the ticket resumes automatically.
      await employeePage.reload();
      await expect(employeePage.getByText('IT is waiting for your reply.')).toBeVisible();
      await employeePage.getByLabel('Message').fill('Here is the log, attached tomorrow.');
      await employeePage.getByRole('button', { name: 'Send reply' }).click();
      await expect(employeePage.getByText('Here is the log, attached tomorrow.')).toBeVisible();
      await expect(employeePage.getByLabel('Status: In progress')).toBeVisible();

      // Agent resolves with a code and summary.
      await agentPage.reload();
      await agentPage.getByRole('button', { name: 'Resolve' }).click();
      await agentPage.getByLabel('Resolution code').selectOption({ label: 'Fixed' });
      await agentPage.getByLabel('Resolution summary').fill('Replaced the failing SSD.');
      await agentPage.getByRole('button', { name: 'Confirm' }).click();
      await expect(agentPage.getByLabel('Status: Resolved')).toBeVisible();
      await expect(agentPage.getByText('Replaced the failing SSD.')).toBeVisible();

      // Requester confirms resolution.
      await employeePage.reload();
      await expect(employeePage.getByLabel('Status: Resolved')).toBeVisible();
      await employeePage.getByRole('button', { name: 'Close' }).click();
      await expect(employeePage.getByLabel('Status: Closed')).toBeVisible();
      await expect(employeePage.getByText('This ticket is closed and read-only.')).toBeVisible();

      // The requester notification is generated asynchronously by the outbox dispatcher
      // (the worker runs alongside the API in this suite).
      await expect
        .poll(
          async () => {
            const notifications = await employeeContext.request.get(
              `${API_URL}/api/v1/notifications?limit=50`,
            );
            const body = (await notifications.json()) as {
              data: { title: string }[];
            };
            return body.data.some((notification) => notification.title.includes(key));
          },
          { timeout: 15_000, message: 'expected an outbox-generated notification' },
        )
        .toBe(true);
    } finally {
      await employeeContext.close();
      await agentContext.close();
    }
  });
});
