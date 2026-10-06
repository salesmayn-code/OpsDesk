import { expect, test } from '@playwright/test';
import { loginAs, unique, users } from './helpers';

test.describe('New OpsDesk Admin & Intake Modules Audit', () => {
  test('Suite 13: Admin Users Management & Invite Flow', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    await loginAs(adminCtx, users.admin);
    const page = await adminCtx.newPage();

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();

    // Verify user table headers and seeded users
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Roles' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(page.getByText('admin@opsdesk.local')).toBeVisible();

    // Test filter by status
    await page.locator('#user-status').selectOption('ACTIVE');
    await expect(page.getByText('admin@opsdesk.local')).toBeVisible();

    // Test search filter
    await page.locator('#user-search').fill('employee');
    await expect(page.getByText('employee@opsdesk.local')).toBeVisible();
    await page.locator('#user-search').fill('');

    // Test Open Invite User Modal
    await page.getByRole('button', { name: 'Invite user' }).click();
    await expect(page.getByRole('dialog', { name: 'Invite user' })).toBeVisible();

    const inviteEmail = `newhire_${Date.now().toString(36)}@opsdesk.local`;
    await page.locator('#invite-email').fill(inviteEmail);
    await page.locator('#invite-first').fill('Jane');
    await page.locator('#invite-last').fill('Doe');
    await page.locator('#invite-title').fill('Security Analyst');

    // Check role checkbox
    await page.getByLabel('Support Agent').check();

    // Submit invite
    await page.getByRole('button', { name: 'Send invitation' }).click();

    // Verify dialog closes and invited user appears
    await expect(page.getByRole('dialog', { name: 'Invite user' })).not.toBeVisible();
    await page.locator('#user-status').selectOption('');
    await page.locator('#user-search').fill(inviteEmail);
    await expect(page.getByText(inviteEmail)).toBeVisible();
    await expect(page.getByText('invited', { exact: true })).toBeVisible();

    await adminCtx.close();
  });

  test('Suite 14: SLA Policies, Calendars & Interactive Preview Calculator', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    await loginAs(adminCtx, users.admin);
    const page = await adminCtx.newPage();

    await page.goto('/admin/sla');
    await expect(page.getByRole('heading', { level: 1, name: 'SLA policies' })).toBeVisible();

    // Policies section
    const policiesSection = page.locator('section', { hasText: 'Policies' });
    await expect(policiesSection.getByRole('heading', { level: 2, name: 'Policies' })).toBeVisible();
    await expect(policiesSection.getByRole('cell', { name: 'Critical', exact: true })).toBeVisible();
    await expect(policiesSection.getByRole('cell', { name: 'High', exact: true })).toBeVisible();
    await expect(policiesSection.getByRole('cell', { name: 'Medium', exact: true })).toBeVisible();
    await expect(policiesSection.getByRole('cell', { name: 'Low', exact: true })).toBeVisible();

    // Business calendars section
    const calendarSection = page.locator('section', { hasText: 'Business calendars' });
    await expect(calendarSection.getByRole('heading', { level: 2, name: 'Business calendars' })).toBeVisible();
    await expect(calendarSection.getByText('Business Hours PK')).toBeVisible();
    await expect(calendarSection.getByText('24x7')).toBeVisible();

    // Interactive Preview Calculator
    await expect(page.getByRole('heading', { level: 2, name: 'Preview calculator' })).toBeVisible();
    await page.locator('#preview-priority').selectOption('CRITICAL');
    await page.locator('#preview-type').selectOption('INCIDENT');
    await page.getByRole('button', { name: 'Preview' }).click();

    await expect(page.getByText('Response due')).toBeVisible();
    await expect(page.getByText('Resolution due')).toBeVisible();

    await adminCtx.close();
  });

  test('Suite 15: Asset Registration Form (/assets/new)', async ({ browser }) => {
    const mgrCtx = await browser.newContext();
    await loginAs(mgrCtx, users.manager);
    const page = await mgrCtx.newPage();

    await page.goto('/assets/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Register asset' })).toBeVisible();

    // Fill form
    await page.locator('#asset-type').selectOption({ index: 1 }); // Select first type (e.g. Laptop)
    const assetName = unique('MacBook Pro M3 Max');
    await page.locator('#asset-name').fill(assetName);
    await page.locator('#asset-manufacturer').fill('Apple');
    await page.locator('#asset-model').fill('A2992');
    await page.locator('#asset-serial').fill(unique('SN-MBP'));
    await page.locator('#asset-cost').fill('3499.00');
    await page.locator('#asset-notes').fill('Engineering high-spec unit');

    await page.getByRole('button', { name: 'Register asset' }).click();

    // Redirects to /assets/[tag]
    await expect(page).toHaveURL(/\/assets\/[A-Z]+-/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(assetName);

    await mgrCtx.close();
  });

  test('Suite 16: Workflow Intake Form (/workflows/new)', async ({ browser }) => {
    const mgrCtx = await browser.newContext();
    await loginAs(mgrCtx, users.manager);
    const page = await mgrCtx.newPage();

    await page.goto('/workflows/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New workflow' })).toBeVisible();

    // Search subject person
    await page.locator('#workflow-subject').fill('Ahmed');
    await expect(page.getByRole('button', { name: /Ahmed Siddiqui/i })).toBeVisible();
    await page.getByRole('button', { name: /Ahmed Siddiqui/i }).click();

    // Fill effective date
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#workflow-date').fill(today);
    await page.locator('#workflow-notes').fill('Standard IT onboarding checklist');

    await page.getByRole('button', { name: 'Create workflow' }).click();

    // Redirects to /workflows/ONB-...
    await expect(page).toHaveURL(/\/workflows\/ONB-/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Onboarding');
    await expect(page.getByRole('heading', { name: 'Checklist' })).toBeVisible();

    await mgrCtx.close();
  });

  test('Suite 17: App Shell Sidebar, Quick Actions (+) New, and Account Menu', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    await loginAs(adminCtx, users.admin);
    const page = await adminCtx.newPage();

    await page.goto('/dashboard');

    // Sidebar navigation visible
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tickets' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'All assets' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Workflows' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'SLA policies' })).toBeVisible();

    // Test Sidebar Collapse & Expand
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    const expandBtn = page.getByRole('button', { name: 'Expand sidebar' });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await expect(collapseBtn).toBeVisible();

    // Test (+) New Quick Menu
    const newBtn = page.getByRole('button', { name: 'New' });
    await newBtn.click();
    await expect(page.getByRole('menuitem', { name: 'New ticket' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Declare incident' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'New change' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Register asset' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'New workflow' })).toBeVisible();

    // Close menu by clicking elsewhere
    await page.keyboard.press('Escape');

    // Test Account Menu Dropdown
    const userMenuBtn = page.getByRole('button', { name: /Account menu for/i });
    await userMenuBtn.click();
    await expect(page.getByRole('menuitem', { name: 'My assets' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();

    await adminCtx.close();
  });
});
