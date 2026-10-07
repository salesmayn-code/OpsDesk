import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, fetchInviteToken, loginAs, unique, users } from './helpers';

test.describe('Auth & RBAC (E2E-9)', () => {
  test('login rejects a wrong password with a generic message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(users.employee);
    await page.getByLabel('Password').fill('WrongPassword!2345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Email or password is incorrect')).toBeVisible();
  });

  test('admin invites, user accepts and signs in, suspension revokes the session', async ({
    page,
    context,
    playwright,
  }) => {
    const request = context.request;
    await loginAs(context, users.admin);

    // Invite via the API (admin user-management UI still on the backlog).
    const roles = await request.get(`${API_URL}/api/v1/roles`);
    const roleBody = (await roles.json()) as { data: { id: string; key: string }[] };
    const employeeRole = roleBody.data.find((role) => role.key === 'EMPLOYEE')!;
    const email = `${unique('invitee').replace(' ', '.')}@opsdesk.local`;

    const invite = await request.post(`${API_URL}/api/v1/users`, {
      data: {
        email,
        firstName: 'E2E',
        lastName: 'Invitee',
        roleIds: [employeeRole.id],
        teamIds: [],
      },
    });
    expect(invite.status()).toBe(201);
    const invited = (await invite.json()) as { data: { id: string } };

    // Accept via the emailed link token (Mailpit).
    const token = await fetchInviteToken(request, email);
    const accept = await request.post(`${API_URL}/api/v1/auth/invitations/accept`, {
      data: { token, password: 'FreshPassword!2345' },
    });
    expect(accept.ok()).toBeTruthy();

    // Sign in through the UI with the new credentials (drop the admin session first).
    await context.clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('FreshPassword!2345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back, E2E');

    // Admin suspends the user through a separate API session.
    const adminApi = await playwright.request.newContext();
    await adminApi.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: users.admin, password: PASSWORD },
    });
    await adminApi.post(`${API_URL}/api/v1/users/${invited.data.id}/status`, {
      data: { status: 'SUSPENDED', reason: 'e2e test' },
    });

    // The suspended user's next navigation bounces to the login page.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // Cleanup: disable keeps the database tidy for repeat runs.
    await adminApi.post(`${API_URL}/api/v1/users/${invited.data.id}/status`, {
      data: { status: 'DISABLED' },
    });
    await adminApi.dispose();
  });

  test('demo persona pill signs in with one click', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Demo login as Employee' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back,');
  });

  test('self-service registration creates an account and starts a session', async ({ page }) => {
    const email = `e2e-${Date.now()}@opsdesk.local`;
    await page.goto('/register');
    await page.getByLabel('First name').fill('E2E');
    await page.getByLabel('Last name').fill('Registered');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel(/^Password/).fill('FreshPassword!2345');
    await page.getByLabel('Confirm password').fill('FreshPassword!2345');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back, E2E');
  });

  test('sign out ends the session', async ({ page, context }) => {
    await loginAs(context, users.employee);
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
