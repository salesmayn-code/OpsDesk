import { expect, test } from '@playwright/test';
import { API_URL, fetchInviteToken, loginAs, unique, users } from './helpers';

async function createTicket(
  request: import('@playwright/test').APIRequestContext,
  title: string,
): Promise<{ id: string; key: string }> {
  const categories = await request.get(`${API_URL}/api/v1/categories`);
  const body = (await categories.json()) as { data: { id: string; name: string }[] };
  const hardware = body.data.find((category) => category.name === 'Hardware')!;
  const ticket = await request.post(`${API_URL}/api/v1/tickets`, {
    data: {
      title,
      description: 'E2E visibility ticket.',
      type: 'INCIDENT',
      categoryId: hardware.id,
    },
  });
  expect(ticket.status()).toBe(201);
  return ((await ticket.json()) as { data: { id: string; key: string } }).data;
}

test.describe('Ticket visibility & internal notes (E2E-3)', () => {
  test('internal notes are staff-only and another employee gets a 404', async ({
    browser,
    playwright,
  }) => {
    const employeeContext = await browser.newContext();
    const agentContext = await browser.newContext();
    await loginAs(employeeContext, users.employee);
    await loginAs(agentContext, users.agent);

    try {
      const ticket = await createTicket(employeeContext.request, unique('E2E visibility'));
      const noteText = unique('internal diagnosis');

      const note = await agentContext.request.post(
        `${API_URL}/api/v1/tickets/${ticket.id}/comments`,
        { data: { body: noteText, visibility: 'INTERNAL' } },
      );
      expect(note.status()).toBe(201);

      const employeePage = await employeeContext.newPage();
      await employeePage.goto(`/tickets/${ticket.key}`);
      await expect(employeePage.getByLabel('Status: New')).toBeVisible();
      await expect(employeePage.getByText(noteText)).toHaveCount(0);

      const agentPage = await agentContext.newPage();
      await agentPage.goto(`/tickets/${ticket.key}`);
      await expect(agentPage.getByText(noteText)).toBeVisible();
      await expect(agentPage.getByText('Internal note', { exact: true }).first()).toBeVisible();

      // Second employee: invited and accepted via Mailpit, then 404 on the ticket.
      const adminContext = await browser.newContext();
      await loginAs(adminContext, users.admin);
      const roles = (await (
        await adminContext.request.get(`${API_URL}/api/v1/roles`)
      ).json()) as { data: { id: string; key: string }[] };
      const employeeRole = roles.data.find((role) => role.key === 'EMPLOYEE')!;
      const email = `${unique('other.employee').replace(' ', '.')}@opsdesk.local`;
      await adminContext.request.post(`${API_URL}/api/v1/users`, {
        data: {
          email,
          firstName: 'Other',
          lastName: 'Employee',
          roleIds: [employeeRole.id],
          teamIds: [],
        },
      });
      const token = await fetchInviteToken(adminContext.request, email);
      await adminContext.request.post(`${API_URL}/api/v1/auth/invitations/accept`, {
        data: { token, password: 'FreshPassword!2345' },
      });

      const otherApi = await playwright.request.newContext();
      const login = await otherApi.post(`${API_URL}/api/v1/auth/login`, {
        data: { email, password: 'FreshPassword!2345' },
      });
      expect(login.ok()).toBeTruthy();
      const detail = await otherApi.get(`${API_URL}/api/v1/tickets/${ticket.id}`);
      expect(detail.status()).toBe(404);
      await otherApi.dispose();
      await adminContext.close();
    } finally {
      await employeeContext.close();
      await agentContext.close();
    }
  });
});
