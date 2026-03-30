import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*screenshot*.ts',
  timeout: 240000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
