import { expect, test } from '@playwright/test';
import { API_URL, loginAs, unique } from './helpers';

test.describe('Asset lifecycle (E2E-6)', () => {
  test('assign, return, repair and return again; retired assets cannot be assigned', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const agentContext = await browser.newContext();
    await loginAs(adminContext, 'admin@opsdesk.local');
    await loginAs(agentContext, 'agent@opsdesk.local');

    try {
      const types = (await (
        await adminContext.request.get(`${API_URL}/api/v1/asset-types`)
      ).json()) as { data: { id: string; name: string }[] };
      const laptop = types.data.find((type) => type.name === 'Laptop')!;

      const created = await adminContext.request.post(`${API_URL}/api/v1/assets`, {
        data: { typeId: laptop.id, name: unique('E2E laptop'), manufacturer: 'Dell' },
      });
      expect(created.status()).toBe(201);
      const asset = ((await created.json()) as { data: { id: string; tag: string; version: number } })
        .data;
      const received = await adminContext.request.post(
        `${API_URL}/api/v1/assets/${asset.id}/transitions`,
        { data: { version: asset.version, to: 'IN_STOCK' } },
      );
      expect(received.status()).toBe(200);
      let version = ((await received.json()) as { data: { version: number } }).data.version;

      const page = await agentContext.newPage();
      await page.goto(`/assets/${asset.tag}`);
      await expect(page.getByLabel('Status: In stock')).toBeVisible();

      await page.getByRole('button', { name: 'Assign to me' }).click();
      await expect(page.getByLabel('Status: Assigned')).toBeVisible();

      await page.getByRole('button', { name: 'Return to stock', exact: true }).click();
      await expect(page.getByLabel('Status: In stock')).toBeVisible();

      await page.getByRole('button', { name: 'Send to repair' }).click();
      await page.getByLabel('Note').fill('Screen flickers under load');
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByLabel('Status: In repair')).toBeVisible();

      await page.getByRole('button', { name: 'Receive / return to stock' }).click();
      await page.getByLabel('Note').fill('Panel replaced under warranty');
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByLabel('Status: In stock')).toBeVisible();

      // History is complete.
      await page.reload();
      await expect(page.getByText('sent to repair')).toBeVisible();
      await expect(page.getByText('returned from repair')).toBeVisible();

      // Retire via API (admin) and confirm assignment is rejected.
      const detail = (await (
        await adminContext.request.get(`${API_URL}/api/v1/assets/${asset.id}`)
      ).json()) as { data: { version: number } };
      version = detail.data.version;
      const retired = await adminContext.request.post(
        `${API_URL}/api/v1/assets/${asset.id}/transitions`,
        { data: { version, to: 'RETIRED' } },
      );
      expect(retired.status()).toBe(200);

      const failed = await agentContext.request.post(
        `${API_URL}/api/v1/assets/${asset.id}/assign`,
        {
          data: {
            version: ((await retired.json()) as { data: { version: number } }).data.version,
            userId: '00000000-0000-7000-8000-000000000000',
          },
        },
      );
      expect(failed.status()).toBe(422);
      expect(((await failed.json()) as { code: string }).code).toBe('ASSET_NOT_ASSIGNABLE');
    } finally {
      await adminContext.close();
      await agentContext.close();
    }
  });
});
