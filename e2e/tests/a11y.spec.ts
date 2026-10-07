import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API_URL, loginAs, unique, users } from './helpers';

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map((violation) => `${violation.id} @ ${violation.nodes[0]?.target?.join(' ')}`),
  ).toEqual([]);
}

test.describe('Accessibility (WCAG 2.2 AA spot checks)', () => {
  test('login and register pages have no serious violations', async ({ page }) => {
    await page.goto('/login');
    await expectNoSeriousViolations(page);
    await page.goto('/register');
    await expectNoSeriousViolations(page);
  });

  test('employee pages have no serious violations', async ({ browser }) => {
    const context = await browser.newContext();
    await loginAs(context, users.employee);
    try {
      const page = await context.newPage();
      for (const path of ['/dashboard', '/tickets', '/tickets/new', '/my/assets', '/notifications']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectNoSeriousViolations(page);
      }
    } finally {
      await context.close();
    }
  });

  test('agent and admin pages have no serious violations', async ({ browser }) => {
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
          title: unique('E2E a11y ticket'),
          description: 'Accessibility audit ticket.',
          type: 'INCIDENT',
          categoryId: hardware.id,
        },
      });
      const ticket = ((await created.json()) as { data: { key: string } }).data;

      const agentPage = await agentContext.newPage();
      for (const path of ['/tickets', `/tickets/${ticket.key}`, '/assets']) {
        await agentPage.goto(path);
        await agentPage.waitForLoadState('networkidle');
        await expectNoSeriousViolations(agentPage);
      }

      const managerPage = await managerContext.newPage();
      await managerPage.goto('/admin/audit');
      await managerPage.waitForLoadState('networkidle');
      await expectNoSeriousViolations(managerPage);
    } finally {
      await agentContext.close();
      await managerContext.close();
    }
  });
});
