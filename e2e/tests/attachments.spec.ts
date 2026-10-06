import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique, users } from './helpers';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);

test.describe('Attachments (E2E-7)', () => {
  test('rejects disallowed types and hides internal attachments from employees', async ({
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
          title: unique('E2E attachment ticket'),
          description: 'Attachment E2E.',
          type: 'INCIDENT',
          categoryId: hardware.id,
        },
      });
      const ticket = ((await created.json()) as { data: { id: string; key: string } }).data;

      const page = await employeeContext.newPage();
      await page.goto(`/tickets/${ticket.id}`);

      await page.setInputFiles('#composer-file', {
        name: 'logo.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      });
      await page.getByRole('button', { name: 'Send reply' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'not allowed' })).toBeVisible();

      await page.setInputFiles('#composer-file', {
        name: 'screenshot.png',
        mimeType: 'image/png',
        buffer: PNG,
      });
      await page.getByRole('button', { name: 'Send reply' }).click();
      await expect(page.getByRole('link', { name: 'screenshot.png' })).toBeVisible();

      // Agent uploads an internal attachment through the API.
      const internal = await agentContext.request.post(
        `${API_URL}/api/v1/tickets/${ticket.id}/attachments?isInternal=true`,
        {
          multipart: {
            file: { name: 'secret-internal.png', mimeType: 'image/png', buffer: PNG },
          },
        },
      );
      expect(internal.status()).toBe(201);

      await page.reload();
      await expect(page.getByText('secret-internal.png')).toHaveCount(0);

      const agentPage = await agentContext.newPage();
      await agentPage.goto(`/tickets/${ticket.id}`);
      await expect(agentPage.getByText('secret-internal.png')).toBeVisible();
    } finally {
      await employeeContext.close();
      await agentContext.close();
    }
  });
});
