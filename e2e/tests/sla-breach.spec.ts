import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique, users } from './helpers';

test.describe('SLA breach (E2E-5)', () => {
  test('breach marks the ticket and notifies the team manager', async ({ browser }) => {
    test.setTimeout(320_000);
    const adminContext = await browser.newContext();
    const employeeContext = await browser.newContext();
    const agentContext = await browser.newContext();
    const managerContext = await browser.newContext();
    await loginAs(adminContext, users.admin);
    await loginAs(employeeContext, users.employee);
    await loginAs(agentContext, users.agent);
    await loginAs(managerContext, users.manager);

    const categories = (await (
      await employeeContext.request.get(`${API_URL}/api/v1/categories`)
    ).json()) as { data: { id: string; name: string }[] };
    const hardware = categories.data.find((category) => category.name === 'Hardware')!;
    const calendars = (await (
      await adminContext.request.get(`${API_URL}/api/v1/business-calendars`)
    ).json()) as { data: { id: string; is24x7: boolean }[] };
    const allDay = calendars.data.find((calendar) => calendar.is24x7)!;

    // A 1-minute CRITICAL policy scoped to Hardware out-scores the seeded policy.
    const policyResponse = await adminContext.request.post(`${API_URL}/api/v1/sla-policies`, {
      data: {
        name: unique('E2E breach policy'),
        priority: 'CRITICAL',
        categoryId: hardware.id,
        calendarId: allDay.id,
        firstResponseMinutes: 1,
        resolutionMinutes: 1,
        warningPercent: 50,
        escalationPercent: 80,
        pauseOnStatuses: ['WAITING_FOR_USER'],
        isDefault: false,
        isActive: true,
        sortOrder: 99,
      },
    });
    expect(policyResponse.status()).toBe(201);
    const policy = ((await policyResponse.json()) as { data: { id: string } }).data;

    try {
      const created = await employeeContext.request.post(`${API_URL}/api/v1/tickets`, {
        data: {
          title: unique('E2E breach ticket'),
          description: 'SLA breach E2E.',
          type: 'INCIDENT',
          categoryId: hardware.id,
        },
      });
      const ticket = ((await created.json()) as {
        data: { id: string; key: string; version: number };
      }).data;

      const elevated = await agentContext.request.patch(`${API_URL}/api/v1/tickets/${ticket.id}`, {
        data: { version: ticket.version, priority: 'CRITICAL' },
      });
      const elevatedBody = (await elevated.json()) as { data: { version: number } };
      const me = (await (await agentContext.request.get(`${API_URL}/api/v1/auth/me`)).json()) as {
        data: { id: string };
      };
      await agentContext.request.post(`${API_URL}/api/v1/tickets/${ticket.id}/assignment`, {
        data: { version: elevatedBody.data.version, assigneeId: me.data.id },
      });

      // Evaluator runs every 60s; the 1-minute target is breached shortly after.
      await expect
        .poll(
          async () => {
            const detail = await agentContext.request.get(
              `${API_URL}/api/v1/tickets/${ticket.id}`,
            );
            const body = (await detail.json()) as { data: { slaState: string | null } };
            return body.data.slaState;
          },
          { timeout: 280_000, intervals: [15_000], message: 'expected the ticket to breach' },
        )
        .toBe('BREACHED');

      // The team manager (Desktop Support) receives the breach notification.
      await expect
        .poll(
          async () => {
            const list = await managerContext.request.get(
              `${API_URL}/api/v1/notifications?limit=50`,
            );
            const body = (await list.json()) as {
              data: { type: string; title: string }[];
            };
            return body.data.some(
              (notification) =>
                notification.type === 'SLA_BREACHED' && notification.title.includes(ticket.key),
            );
          },
          { timeout: 60_000, intervals: [5_000], message: 'expected a breach notification' },
        )
        .toBe(true);
    } finally {
      await adminContext.request.patch(`${API_URL}/api/v1/sla-policies/${policy.id}`, {
        data: { isActive: false },
      });
      await adminContext.close();
      await employeeContext.close();
      await agentContext.close();
      await managerContext.close();
    }
  });
});
