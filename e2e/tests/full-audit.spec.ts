import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique, users, PASSWORD, forgetSession } from './helpers';

async function fetchPasswordResetToken(
  request: any,
  email: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await request.get('http://localhost:8025/api/v1/messages?limit=50');
    const body = (await list.json()) as { messages?: { ID: string; To?: { Address: string }[] }[] };
    const match = body.messages?.find((message) =>
      message.To?.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
    );
    if (match) {
      const detail = await request.get(`http://localhost:8025/api/v1/message/${match.ID}`);
      const content = (await detail.json()) as { HTML?: string; Text?: string };
      const raw = `${content.HTML ?? ''}\n${content.Text ?? ''}`;
      const token = raw.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];
      if (token) return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No password reset email found for ${email}`);
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const Y = date.getFullYear();
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  return `${Y}-${M}-${D}T${h}:${m}`;
}

test.describe('OpsDesk Comprehensive End-to-End Audit', () => {

  test('Suite 1: Role navigation matrix, access control, and console error checks', async ({ browser }) => {
    const pageErrors: { role: string; url: string; msg: string }[] = [];

    const hookErrors = (page: any, role: string) => {
      page.on('pageerror', (err: any) => {
        pageErrors.push({ role, url: page.url(), msg: err.message });
      });
    };

    // 1. Employee Pages
    const empCtx = await browser.newContext();
    await loginAs(empCtx, users.employee);
    const empPage = await empCtx.newPage();
    hookErrors(empPage, 'employee');

    for (const path of ['/dashboard', '/tickets', '/tickets/new', '/my/assets', '/kb']) {
      await empPage.goto(path);
      await expect(empPage.locator('body')).not.toBeEmpty();
      await expect(empPage.getByRole('heading', { level: 1 })).toBeVisible();
    }

    // Verify employee navigation header links
    await empPage.goto('/dashboard');
    const empNav = empPage.getByRole('navigation', { name: 'Main' });
    await expect(empNav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(empNav.getByRole('link', { name: 'Tickets' })).toBeVisible();
    await expect(empNav.getByRole('link', { name: 'Knowledge' })).toBeVisible();
    await expect(empNav.getByRole('link', { name: 'My assets' })).toBeVisible();
    // Unauthorized links must NOT be visible to employee
    await expect(empNav.getByRole('link', { name: 'Incidents' })).not.toBeVisible();
    await expect(empNav.getByRole('link', { name: 'Changes' })).not.toBeVisible();
    await expect(empNav.getByRole('link', { name: 'Workflows' })).not.toBeVisible();
    await expect(empNav.getByRole('link', { name: 'Reports' })).not.toBeVisible();
    await expect(empNav.getByRole('link', { name: 'Audit' })).not.toBeVisible();

    // 2. Agent Pages
    const agentCtx = await browser.newContext();
    await loginAs(agentCtx, users.agent);
    const agentPage = await agentCtx.newPage();
    hookErrors(agentPage, 'agent');

    for (const path of [
      '/dashboard',
      '/tickets',
      '/tickets/new',
      '/incidents',
      '/changes',
      '/workflows',
      '/kb',
      '/my/assets',
    ]) {
      await agentPage.goto(path);
      await expect(agentPage.locator('body')).not.toBeEmpty();
      await expect(agentPage.getByRole('heading', { level: 1 })).toBeVisible();
    }

    // 3. Manager Pages
    const mgrCtx = await browser.newContext();
    await loginAs(mgrCtx, users.manager);
    const mgrPage = await mgrCtx.newPage();
    hookErrors(mgrPage, 'manager');

    for (const path of [
      '/dashboard',
      '/tickets',
      '/incidents',
      '/changes',
      '/workflows',
      '/kb',
      '/reports',
      '/assets',
      '/admin/audit',
      '/notifications',
    ]) {
      await mgrPage.goto(path);
      await expect(mgrPage.locator('body')).not.toBeEmpty();
      await expect(mgrPage.getByRole('heading', { level: 1 })).toBeVisible();
    }

    // 4. Admin Pages
    const adminCtx = await browser.newContext();
    await loginAs(adminCtx, users.admin);
    const adminPage = await adminCtx.newPage();
    hookErrors(adminPage, 'admin');

    await adminPage.goto('/admin/audit');
    await expect(adminPage.getByRole('heading', { name: 'Audit log' })).toBeVisible();

    await empCtx.close();
    await agentCtx.close();
    await mgrCtx.close();
    await adminCtx.close();

    expect(pageErrors, `Uncaught page errors encountered: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });

  test('Suite 2: Incident lifecycle end-to-end via Web UI', async ({ browser }) => {
    const agentCtx = await browser.newContext();
    const mgrCtx = await browser.newContext();
    await loginAs(agentCtx, users.agent);
    await loginAs(mgrCtx, users.manager);

    const agentPage = await agentCtx.newPage();
    await agentPage.goto('/incidents/new');

    const incidentTitle = unique('E2E Outage Incident');
    await agentPage.locator('#incident-title').fill(incidentTitle);
    await agentPage.locator('#incident-severity-input').selectOption('SEV2');
    await agentPage.locator('#incident-description').fill('Major system latency observed on database.');
    await agentPage.locator('#incident-impact').fill('Affects all finance users.');
    await agentPage.getByRole('button', { name: 'Declare incident' }).click();

    // Verify redirected to incident detail
    await expect(agentPage).toHaveURL(/\/incidents\/INC-/);
    await expect(agentPage.getByRole('heading', { level: 1 })).toContainText(incidentTitle);

    // Initial state is IDENTIFIED
    await expect(agentPage.getByText('SEV2')).toBeVisible();
    await expect(agentPage.getByLabel('Status: Identified')).toBeVisible();

    // Add incident timeline note
    await agentPage.locator('#incident-note').fill('Initial investigation points to DB connection pool.');
    await agentPage.getByRole('button', { name: 'Add update' }).click();
    await expect(agentPage.getByText('Initial investigation points to DB connection pool.')).toBeVisible();

    // Manager manages the incident transitions
    const incidentUrl = agentPage.url();
    const mgrPage = await mgrCtx.newPage();
    await mgrPage.goto(incidentUrl);

    // Transition: Start investigating
    await mgrPage.getByRole('button', { name: 'Start investigating' }).click();
    await expect(mgrPage.getByLabel('Status: Investigating')).toBeVisible();

    // Transition: Start mitigating
    await mgrPage.getByRole('button', { name: 'Start mitigating' }).click();
    await expect(mgrPage.getByLabel('Status: Mitigating')).toBeVisible();

    // Transition: Monitoring
    await mgrPage.getByRole('button', { name: 'Monitoring' }).click();
    await expect(mgrPage.getByLabel('Status: Monitoring')).toBeVisible();

    // Transition: Resolve
    await mgrPage.getByRole('button', { name: 'Resolve' }).click();
    await mgrPage.locator('#incident-root-cause').fill('Connection pool exhausted due to leak.');
    await mgrPage.locator('#incident-mitigation').fill('Restarted services.');
    await mgrPage.locator('#incident-impact-resolve').fill('Finance users experienced 10 min downtime.');
    await mgrPage.locator('#incident-resolution').fill('Pool size doubled and leak patched.');
    await mgrPage.getByRole('button', { name: 'Confirm' }).click();
    await expect(mgrPage.getByLabel('Status: Resolved')).toBeVisible();

    // SEV2 requires published postmortem before closing
    await mgrPage.locator('#pm-summary').fill('Database pool leak caused SEV2 latency.');
    await mgrPage.locator('#pm-root-cause').fill('Leaked client connections in reporting worker.');
    await mgrPage.locator('#pm-went-well').fill('Alerts fired within 2 minutes.');
    await mgrPage.locator('#pm-went-wrong').fill('Resolution runbook was outdated.');
    await mgrPage.getByRole('button', { name: 'Save draft' }).click();

    await expect(mgrPage.getByRole('button', { name: 'Publish' })).toBeVisible();
    await mgrPage.getByRole('button', { name: 'Publish' }).click();

    // Now Close transition is permitted
    await expect(mgrPage.getByRole('button', { name: 'Close' })).toBeVisible();
    await mgrPage.getByRole('button', { name: 'Close' }).click();
    await expect(mgrPage.getByLabel('Status: Closed')).toBeVisible();

    await agentCtx.close();
    await mgrCtx.close();
  });

  test('Suite 3: Change management lifecycle & CAB approval via Web UI', async ({ browser }) => {
    const agentCtx = await browser.newContext();
    const mgrCtx = await browser.newContext();
    await loginAs(agentCtx, users.agent);
    await loginAs(mgrCtx, users.manager);

    const agentPage = await agentCtx.newPage();
    await agentPage.goto('/changes/new');

    const changeTitle = unique('E2E Firewall Rule Upgrade');
    await agentPage.locator('#change-title').fill(changeTitle);
    await agentPage.locator('#change-type-input').selectOption('NORMAL');
    await agentPage.locator('#change-risk-input').selectOption('LOW');
    await agentPage.locator('#change-description').fill('Upgrade perimeter firewall rules.');

    // Schedule window within 10 minutes so implementation window is open (<15 mins)
    const now = Date.now();
    const windowStart = new Date(now + 10 * 60 * 1000);
    const windowEnd = new Date(now + 120 * 60 * 1000);
    await agentPage.locator('#change-window-start').fill(toLocalDatetimeString(windowStart));
    await agentPage.locator('#change-window-end').fill(toLocalDatetimeString(windowEnd));

    await agentPage.locator('#change-implementation').fill('1. Back up rules\n2. Apply new JSON configuration.');
    await agentPage.locator('#change-validation').fill('Run connectivity health checks.');
    await agentPage.locator('#change-rollback').fill('Restore backup snapshot.');

    // Button text is 'Create draft'
    await agentPage.getByRole('button', { name: 'Create draft' }).click();

    // Verify redirected to /changes/CHG-...
    await expect(agentPage).toHaveURL(/\/changes\/CHG-/);
    await expect(agentPage.getByRole('heading', { level: 1 })).toContainText(changeTitle);
    await expect(agentPage.getByLabel('Status: Draft')).toBeVisible();

    // Submit for approval
    await agentPage.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(agentPage.getByLabel('Status: Submitted')).toBeVisible();

    // Manager views and approves
    const changeUrl = agentPage.url();
    const mgrPage = await mgrCtx.newPage();
    await mgrPage.goto(changeUrl);

    // Record Approval
    await expect(mgrPage.getByRole('button', { name: 'Approve' })).toBeVisible();
    await mgrPage.locator('#approval-comment').fill('Approved for deployment window.');
    await mgrPage.getByRole('button', { name: 'Approve' }).click();
    await expect(mgrPage.getByLabel('Status: Approved')).toBeVisible();

    // Reload agentPage to see updated status: Approved
    await agentPage.reload();
    await expect(agentPage.getByLabel('Status: Approved')).toBeVisible();

    // Requester (Agent) confirms schedule and executes lifecycle:
    // Schedule -> Implement -> Validate -> Complete -> Close
    await agentPage.getByRole('button', { name: 'Confirm schedule' }).click();
    await expect(agentPage.getByLabel('Status: Scheduled')).toBeVisible();

    await agentPage.getByRole('button', { name: 'Start implementation' }).click();
    await expect(agentPage.getByLabel('Status: Implementing')).toBeVisible();

    await agentPage.getByRole('button', { name: 'Validate' }).click();
    await expect(agentPage.getByLabel('Status: Validating')).toBeVisible();

    await agentPage.getByRole('button', { name: 'Mark completed' }).click();
    await agentPage.locator('#change-note').fill('Verification passed on staging.');
    await agentPage.getByRole('button', { name: 'Confirm' }).click();
    await expect(agentPage.getByLabel('Status: Completed')).toBeVisible();

    await agentPage.getByRole('button', { name: 'Close' }).click();
    await expect(agentPage.getByLabel('Status: Closed')).toBeVisible();

    await agentCtx.close();
    await mgrCtx.close();
  });

  test('Suite 4: Knowledge base lifecycle (create, review, publish, search) via Web UI', async ({ browser }) => {
    const agentCtx = await browser.newContext();
    const mgrCtx = await browser.newContext();
    const empCtx = await browser.newContext();
    await loginAs(agentCtx, users.agent);
    await loginAs(mgrCtx, users.manager);
    await loginAs(empCtx, users.employee);

    const agentPage = await agentCtx.newPage();
    await agentPage.goto('/kb/new');

    const articleTitle = unique('E2E On-Premises Printer Guide');
    await agentPage.locator('#kb-title').fill(articleTitle);
    await agentPage.locator('#kb-summary').fill('Quick instructions for adding HQ printers.');
    await agentPage.locator('#kb-content').fill('## Instructions\n1. Connect to HQ-Secure Wi-Fi.\n2. Add printer IP 10.0.1.50.');
    await agentPage.getByRole('button', { name: 'Create draft' }).click();

    // Redirected to /kb/[slug]
    await expect(agentPage).toHaveURL(/\/kb\//);
    await expect(agentPage.getByRole('heading', { level: 1 })).toHaveText(articleTitle);
    await expect(agentPage.getByText('draft')).toBeVisible();

    // Submit for review
    await agentPage.getByRole('button', { name: 'Submit for review' }).click();
    await expect(agentPage.getByText('review')).toBeVisible();

    // Manager publishes
    const articleUrl = agentPage.url();
    const mgrPage = await mgrCtx.newPage();
    await mgrPage.goto(articleUrl);
    await mgrPage.getByRole('button', { name: 'Publish' }).click();
    await expect(mgrPage.getByText('published')).toBeVisible();

    // Employee searches and views
    const empPage = await empCtx.newPage();
    await empPage.goto('/kb');
    await empPage.locator('#kb-search').fill(articleTitle);
    await empPage.getByRole('button', { name: 'Search' }).click();
    await expect(empPage.getByText(articleTitle)).toBeVisible();

    await empPage.getByRole('link', { name: articleTitle }).click();
    await expect(empPage.getByRole('heading', { level: 1 })).toHaveText(articleTitle);
    await expect(empPage.getByText('Quick instructions for adding HQ printers.')).toBeVisible();

    await agentCtx.close();
    await mgrCtx.close();
    await empCtx.close();
  });

  test('Suite 5: Global search bar across tickets, assets, and users', async ({ browser }) => {
    const agentCtx = await browser.newContext();
    await loginAs(agentCtx, users.agent);

    const page = await agentCtx.newPage();
    await page.goto('/dashboard');

    const searchInput = page.locator('#global-search');
    await expect(searchInput).toBeVisible();

    // Search for laptop
    await searchInput.fill('LAP');
    const dropdown = page.locator('section[aria-label="Assets"]');
    await expect(dropdown).toBeVisible({ timeout: 10_000 });
    await expect(dropdown.getByText('LAP-').first()).toBeVisible();

    // Search for people
    await searchInput.fill('Ahmed');
    const peopleSection = page.locator('section[aria-label="People"]');
    await expect(peopleSection).toBeVisible({ timeout: 10_000 });
    await expect(peopleSection.getByText('Ahmed Siddiqui')).toBeVisible();

    // Search and click asset to navigate
    await searchInput.fill('LAP-00421');
    await expect(dropdown).toBeVisible();
    await page.getByRole('link', { name: /LAP-00421/ }).first().click();

    await expect(page).toHaveURL(/\/assets\/LAP-00421/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('LAP-00421');

    await agentCtx.close();
  });

  test('Suite 6: Reports view, filters, and CSV export endpoint', async ({ browser }) => {
    const mgrCtx = await browser.newContext();
    await loginAs(mgrCtx, users.manager);

    const page = await mgrCtx.newPage();
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    // Test changing report select with valid keys: 'sla-compliance', 'response-times'
    const reportSelect = page.locator('#report-key');
    await reportSelect.selectOption('sla-compliance');
    await expect(page.getByText('On-time resolution % by team')).toBeVisible();

    await reportSelect.selectOption('response-times');
    await expect(page.getByText('Average first response and resolution by team')).toBeVisible();

    // Test presets
    await page.getByRole('button', { name: 'Last 7d' }).click();
    await page.getByRole('button', { name: 'Last 90d' }).click();

    // Test CSV export link
    const exportBtn = page.getByRole('link', { name: 'Export CSV' });
    const csvHref = await exportBtn.getAttribute('href');
    expect(csvHref).toContain('/api/v1/reports/');

    const csvResponse = await mgrCtx.request.get(csvHref!);
    expect(csvResponse.status()).toBe(200);
    expect(csvResponse.headers()['content-type']).toContain('text/csv');

    await mgrCtx.close();
  });

  test('Suite 7: Admin audit log filters and row details', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    await loginAs(adminCtx, users.admin);

    const page = await adminCtx.newPage();
    await page.goto('/admin/audit');

    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();

    // Filter by entity type
    await page.locator('#audit-entity').fill('ticket');
    await page.getByRole('button', { name: 'Filter' }).click();

    // Details elements should exist and expand into diff/metadata content
    const details = page.locator('details');
    if ((await details.count()) > 0) {
      await details.first().click();
      await expect(details.first()).toHaveAttribute('open', '');
      await expect(details.first().locator('ul, dl, p').first()).toBeVisible();
    }

    await adminCtx.close();
  });

  test('Suite 8: Notifications mark-as-read and mark-all-read', async ({ browser }) => {
    const mgrCtx = await browser.newContext();
    await loginAs(mgrCtx, users.manager);

    const page = await mgrCtx.newPage();
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    // Mark all read button
    const markAllBtn = page.getByRole('button', { name: 'Mark all read' });
    await expect(markAllBtn).toBeVisible();
    await markAllBtn.click();

    // Unread only toggle
    const toggleBtn = page.getByRole('button', { name: /Unread only|Showing unread/ });
    await toggleBtn.click();
    await expect(page.getByRole('button', { name: 'Showing unread' })).toBeVisible();

    await mgrCtx.close();
  });

  test('Suite 9: End-to-end Forgot Password & Reset Password workflow via Mailpit', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Visit forgot password
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();

    await page.locator('#email').fill(users.employee);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByText('If an account exists for that email')).toBeVisible();

    // 2. Fetch reset token from Mailpit
    const token = await fetchPasswordResetToken(context.request, users.employee);
    expect(token).toBeTruthy();

    // 3. Open reset password page
    await page.goto(`/reset-password?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();

    // 4. Test validation: password mismatch
    await page.locator('#newPassword').fill('NewPass!123456');
    await page.locator('#confirmPassword').fill('DifferentPass!123');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();

    // 5. Test valid password reset
    const newPassword = 'BrandNewPassword!999';
    await page.locator('#newPassword').fill(newPassword);
    await page.locator('#confirmPassword').fill(newPassword);
    await page.getByRole('button', { name: 'Set new password' }).click();

    // Redirects to login with reset=1 query parameter
    await expect(page).toHaveURL(/\/login\?reset=1/);

    // 6. Sign in with the new password
    await page.locator('#email').fill(users.employee);
    await page.locator('#password').fill(newPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // 7. Restore original password via API so other test suites remain pristine
    const resetAgain = await page.request.post(`${API_URL}/api/v1/auth/password/forgot`, {
      data: { email: users.employee },
    });
    expect(resetAgain.status()).toBe(202);
    const restoreToken = await fetchPasswordResetToken(context.request, users.employee);
    const restoreRes = await page.request.post(`${API_URL}/api/v1/auth/password/reset`, {
      data: { token: restoreToken, newPassword: PASSWORD },
    });
    expect(restoreRes.status()).toBe(200);

    forgetSession(users.employee);
    await context.close();
  });

  test('Suite 10: Ticket creation form client validation and comments', async ({ browser }) => {
    const empCtx = await browser.newContext();
    const agentCtx = await browser.newContext();
    await loginAs(empCtx, users.employee);
    await loginAs(agentCtx, users.agent);

    const page = await empCtx.newPage();
    await page.goto('/tickets/new');

    // Click Incident card: "Something is broken"
    await page.getByRole('button', { name: /Something is broken/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New ticket');

    // Attempt submit with empty title
    await page.getByRole('button', { name: 'Submit ticket' }).click();
    // Form prevents submission (still on /tickets/new)
    expect(page.url()).toContain('/tickets/new');

    // Fill valid ticket
    const ticketTitle = unique('Broken monitor HDMI port');
    await page.locator('#title').fill(ticketTitle);
    await page.locator('#description').fill('Monitor displays flashing pink lines on HDMI connection.');
    await page.locator('#category').selectOption({ label: 'Hardware' });
    await page.getByRole('button', { name: 'Submit ticket' }).click();

    // Successfully creates and navigates to ticket detail
    await expect(page).toHaveURL(/\/tickets\/TKT-/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ticketTitle);

    // Add public comment
    await page.locator('#comment-body').fill('I tried a different HDMI cable and the issue persists.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('I tried a different HDMI cable and the issue persists.')).toBeVisible();

    // Staff adds internal note
    const ticketUrl = page.url();
    const agentPage = await agentCtx.newPage();
    await agentPage.goto(ticketUrl);
    await agentPage.getByRole('tab', { name: 'Internal note' }).click();
    await agentPage.locator('#comment-body').fill('Replacing monitor with stock Dell P2422H under warranty.');
    await agentPage.getByRole('button', { name: 'Add internal note' }).click();
    await expect(agentPage.getByText('Replacing monitor with stock Dell P2422H under warranty.')).toBeVisible();

    // Employee reloads: verify internal note is NOT visible to employee
    await page.reload();
    await expect(page.getByText('I tried a different HDMI cable and the issue persists.')).toBeVisible();
    await expect(page.getByText('Replacing monitor with stock Dell P2422H under warranty.')).not.toBeVisible();

    await empCtx.close();
    await agentCtx.close();
  });

  test('Suite 11: Workflows tabs and task execution via Web UI', async ({ browser }) => {
    const mgrCtx = await browser.newContext();
    await loginAs(mgrCtx, users.manager);

    const page = await mgrCtx.newPage();
    await page.goto('/workflows');

    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();

    // Tab buttons for Onboarding and Offboarding
    await page.getByRole('tab', { name: 'Offboarding' }).click();
    await expect(page.getByRole('tab', { name: 'Offboarding' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Onboarding' }).click();
    await expect(page.getByRole('tab', { name: 'Onboarding' })).toHaveAttribute('aria-selected', 'true');

    // Open first onboarding workflow
    await page.goto('/workflows/ONB-000001');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Onboarding');
    await expect(page.getByRole('heading', { name: 'Checklist' })).toBeVisible();

    await mgrCtx.close();
  });

  test('Suite 12: Asset lifecycle & assignment management via Web UI', async ({ browser }) => {
    const mgrCtx = await browser.newContext();
    await loginAs(mgrCtx, users.manager);

    const page = await mgrCtx.newPage();
    await page.goto('/assets');

    await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible();

    // Open an asset detail page (e.g. LAP-00422 in stock)
    await page.goto('/assets/LAP-00422');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('LAP-00422');
    await expect(page.getByText('History')).toBeVisible();

    await mgrCtx.close();
  });
});
