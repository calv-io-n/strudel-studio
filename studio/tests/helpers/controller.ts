import type { Page } from '@playwright/test';

export async function openController(page: Page) {
  await page.locator('.project-menu').evaluate((element: HTMLDetailsElement) => { element.open = true; });
  await page.getByRole('button', { name: 'On-screen controller', exact: true }).click();
  await page.locator('.project-menu').evaluate((element: HTMLDetailsElement) => { element.open = false; });
}
