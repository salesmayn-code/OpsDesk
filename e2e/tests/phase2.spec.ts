import { expect, test } from '@playwright/test';
import { API_URL, fetchInviteToken, loginAs, unique, users } from './helpers';

test.describe('Phase 2 flows (E2E-10/11/12)', () => {
  test('E2E-10: multi-level change approval through the UI', async ({ browser }) => {
    test.setTimeout(120_000);
    const agentCtx = await browser.newContext();
    const manager1Ctx = await browser.newContext();
    const manager2Ctx = await browser.newContext();
    await loginAs(agentCtx, users.agent);
    await loginAs(manager1Ctx, users.manager);
    await loginAs(manager2Ctx, 'manager2@opsdesk.local');

    try {
      // The requester (agent) creates and submits a NORMAL/HIGH change (2 approvals).
      const created = await agentCtx.request.post(`${API_URL}/api/v1/changes`, {
        data: {
          title: unique('E2E approval change'),
          description: 'Change approval flow.',
          type: 'NORMAL',
          risk: 'HIGH',
          implementationPlan: 'Apply update.',
          validationPlan: 'Smoke tests.',
          rollbackPlan: 'Restore previous version.',
          scheduledStart: new Date(Date.now() + 2 * 3_600_000).toISOString(),
          scheduledEnd: new Date(Date.now() + 3 * 3_600_000).toISOString(),
        },
      });
      expect(created.status()).toBe(201);
      const change = ((await created.json()) as { data: { id: string; key: string } }).data;
      const submitted = await agentCtx.request.post(
        `${API_URL}/api/v1/changes/${change.id}/submit`,
      );
      expect(submitted.status()).toBe(200);

      // First manager approves; the change stays under review (1 of 2).
      const page1 = await manager1Ctx.newPage();
      await page1.goto(`/changes/${change.key}`);
      await expect(page1.getByLabel('Status: Submitted')).toBeVisible();
      await page1.getByRole('button', { name: 'Approve' }).click();
      await expect(page1.getByLabel('Status: Under review')).toBeVisible();
      await expect(page1.getByText('1/2 approved')).toBeVisible();

      // Second manager approves; the change becomes approved.
      const page2 = await manager2Ctx.newPage();
      await page2.goto(`/changes/${change.key}`);
      await page2.getByRole('button', { name: 'Approve' }).click();
      await expect(page2.getByLabel('Status: Approved')).toBeVisible();
    } finally {
      await agentCtx.close();
      await manager1Ctx.close();
      await manager2Ctx.close();
    }
  });

  test('E2E-11: declare an incident, link a ticket, add timeline, resolve and close', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const agentCtx = await browser.newContext();
    const managerCtx = await browser.newContext();
    const employeeCtx = await browser.newContext();
    await loginAs(agentCtx, users.agent);
    await loginAs(managerCtx, users.manager);
    await loginAs(employeeCtx, users.employee);

    try {
      const categories = (await (
        await employeeCtx.request.get(`${API_URL}/api/v1/categories`)
      ).json()) as { data: { id: string; name: string }[] };
      const hardware = categories.data.find((category) => category.name === 'Hardware')!;
      const ticketResponse = await employeeCtx.request.post(`${API_URL}/api/v1/tickets`, {
        data: {
          title: unique('E2E incident ticket'),
          description: 'Ticket linked to an incident.',
          type: 'INCIDENT',
          categoryId: hardware.id,
        },
      });
      const ticket = ((await ticketResponse.json()) as { data: { id: string; key: string } }).data;

      // Agent declares the incident through the UI.
      const agentPage = await agentCtx.newPage();
      await agentPage.goto('/incidents/new');
      await agentPage.getByLabel('Title').fill(unique('E2E outage'));
      await agentPage.getByLabel('Severity').selectOption('SEV3');
      await agentPage.getByLabel('Description').fill('Email delivery is degraded.');
      await agentPage.getByRole('button', { name: 'Declare incident' }).click();
      await expect(agentPage).toHaveURL(/\/incidents\/INC-\d{4}-\d{3}/);
      const incidentKey = agentPage.url().split('/').pop()!;

      // Manager links the ticket from the ticket detail page.
      const managerPage = await managerCtx.newPage();
      await managerPage.goto(`/tickets/${ticket.key}`);
      await managerPage.getByLabel('Find incident by key').fill(incidentKey);
      await managerPage.getByRole('button', { name: new RegExp(incidentKey) }).click();
      await expect(
        managerPage.getByRole('link', { name: new RegExp(incidentKey) }),
      ).toBeVisible();

      // Timeline update on the incident.
      await agentPage.getByLabel('Update', { exact: true }).fill('Investigating the mail relay.');
      await agentPage.getByRole('button', { name: 'Add update' }).click();
      await expect(agentPage.getByText('Investigating the mail relay.')).toBeVisible();

      // Lifecycle: investigate → mitigate → monitor → resolve → close.
      await managerPage.goto(`/incidents/${incidentKey}`);
      await managerPage.getByRole('button', { name: 'Start investigating' }).click();
      await managerPage.getByRole('button', { name: 'Start mitigating' }).click();
      await managerPage.getByRole('button', { name: 'Monitoring' }).click();
      await managerPage.getByRole('button', { name: 'Resolve' }).click();
      await managerPage.locator('#incident-root-cause').fill('Mail relay disk full');
      await managerPage.locator('#incident-mitigation').fill('Cleared the relay spool');
      await managerPage.locator('#incident-impact-resolve').fill('Delayed outbound mail');
      await managerPage.getByRole('button', { name: 'Confirm' }).click();
      await expect(managerPage.getByLabel('Status: Resolved')).toBeVisible();
      await managerPage.getByRole('button', { name: 'Close' }).click();
      await expect(managerPage.getByLabel('Status: Closed')).toBeVisible();
    } finally {
      await agentCtx.close();
      await managerCtx.close();
      await employeeCtx.close();
    }
  });

  test('E2E-12: offboarding recovers the asset and disables the account', async ({ browser }) => {
    test.setTimeout(180_000);
    const adminCtx = await browser.newContext();
    const managerCtx = await browser.newContext();
    const agentCtx = await browser.newContext();
    await loginAs(adminCtx, users.admin);
    await loginAs(managerCtx, users.manager);
    await loginAs(agentCtx, users.agent);

    try {
      // Invite and activate a dedicated leaver account.
      const roles = (await (
        await adminCtx.request.get(`${API_URL}/api/v1/roles`)
      ).json()) as { data: { id: string; key: string }[] };
      const employeeRole = roles.data.find((role) => role.key === 'EMPLOYEE')!;
      const email = `${unique('leaver').replace(' ', '.')}@opsdesk.local`;
      await adminCtx.request.post(`${API_URL}/api/v1/users`, {
        data: {
          email,
          firstName: 'Leaver',
          lastName: 'E2E',
          roleIds: [employeeRole.id],
          teamIds: [],
        },
      });
      const token = await fetchInviteToken(adminCtx.request, email);
      await adminCtx.request.post(`${API_URL}/api/v1/auth/invitations/accept`, {
        data: { token, password: 'FreshPassword!2345' },
      });
      const leaverList = (await (
        await adminCtx.request.get(`${API_URL}/api/v1/users?q=${encodeURIComponent(email)}`)
      ).json()) as { data: { id: string }[] };
      const leaverId = leaverList.data[0]!.id;

      // Provision an asset and assign it to the leaver.
      const types = (await (
        await adminCtx.request.get(`${API_URL}/api/v1/asset-types`)
      ).json()) as { data: { id: string; name: string }[] };
      const laptop = types.data.find((type) => type.name === 'Laptop')!;
      const assetResponse = await adminCtx.request.post(`${API_URL}/api/v1/assets`, {
        data: { typeId: laptop.id, name: unique('Offboarding laptop') },
      });
      const asset = ((await assetResponse.json()) as { data: { id: string; tag: string; version: number } })
        .data;
      const received = await agentCtx.request.post(
        `${API_URL}/api/v1/assets/${asset.id}/transitions`,
        { data: { version: asset.version, to: 'IN_STOCK' } },
      );
      const receivedBody = (await received.json()) as { data: { version: number } };
      await agentCtx.request.post(`${API_URL}/api/v1/assets/${asset.id}/assign`, {
        data: { version: receivedBody.data.version, userId: leaverId },
      });

      // Manager starts offboarding through the UI.
      const page = await managerCtx.newPage();
      await page.goto('/workflows/new');
      await page.getByRole('tab', { name: 'Offboarding' }).click();
      await page.getByLabel('Person').fill(email);
      await page.getByRole('button', { name: new RegExp(email) }).click();
      await page.getByLabel('Effective date').fill('2026-12-01');
      await page.getByRole('button', { name: 'Create workflow' }).click();
      await expect(page).toHaveURL(/\/workflows\/OFF-\d{6}/);
      await expect(page.getByText(asset.tag)).toBeVisible();
      const workflowKey = page.url().split('/').pop()!;

      // Complete every task via the API (the UI checklist was verified above),
      // then reload to confirm the UI reflects completion.
      const detail = (await (
        await managerCtx.request.get(`${API_URL}/api/v1/offboarding/${workflowKey}`)
      ).json()) as { data: { tasks: { id: string; version: number; status: string }[] } };
      for (const task of detail.data.tasks) {
        if (task.status !== 'PENDING') continue;
        const started = (await (
          await managerCtx.request.post(`${API_URL}/api/v1/workflow-tasks/${task.id}/transitions`, {
            data: { version: task.version, to: 'IN_PROGRESS' },
          })
        ).json()) as { data: { tasks: { id: string; version: number }[] } };
        const startedTask = started.data.tasks.find((entry) => entry.id === task.id)!;
        await managerCtx.request.post(`${API_URL}/api/v1/workflow-tasks/${task.id}/transitions`, {
          data: { version: startedTask.version, to: 'COMPLETED' },
        });
      }
      await page.reload();
      await expect(page.getByText('completed', { exact: true }).first()).toBeVisible();

      // Asset returned to stock, leaver disabled and unable to sign in.
      const assetAfter = (await (
        await adminCtx.request.get(`${API_URL}/api/v1/assets/${asset.id}`)
      ).json()) as { data: { status: string; currentAssignee: unknown } };
      expect(assetAfter.data.status).toBe('IN_STOCK');
      expect(assetAfter.data.currentAssignee).toBeNull();

      const blocked = await managerCtx.request.post(`${API_URL}/api/v1/auth/login`, {
        data: { email, password: 'FreshPassword!2345' },
      });
      expect(blocked.status()).toBe(403);
    } finally {
      await adminCtx.close();
      await managerCtx.close();
      await agentCtx.close();
    }
  });
});
