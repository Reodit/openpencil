/**
 * AI Design Generation Screenshot Test
 *
 * Full flow: register → login → connect Claude → create workspace → enter editor → generate → screenshot
 */
import { test } from '@playwright/test'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const BASE_URL = process.env.TEST_URL ?? 'http://localhost:3000'
const SCREENSHOT_DIR = resolve('tests/screenshots')
const DIAG_DIR = join(homedir(), '.openpencil', 'diag')
const TEST_USER = { username: 'test-bot', password: 'test1234' }
const DEFAULT_PROMPT = process.env.TEST_PROMPT
  ?? '한국어 호텔 예약 앱 메인 화면을 디자인해줘. 상단바, 검색, 카테고리, 추천 호텔 카드, 하단 네비게이션 포함.'

test.describe('AI Design Generation', () => {
  test.beforeAll(() => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true })
  })

  test('generate design and capture screenshot', async ({ page, request }) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const shot = (name: string) => page.screenshot({ path: join(SCREENSHOT_DIR, `${name}-${ts}.png`) })

    // 1. Register (ignore if exists) & Login
    await request.post(`${BASE_URL}/api/auth/register`, {
      data: TEST_USER,
    }).catch(() => {})

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)

    const loginForm = page.locator('input[type="text"]').first()
    if (await loginForm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginForm.fill(TEST_USER.username)
      await page.locator('input[type="password"]').first().fill(TEST_USER.password)
      await page.locator('button[type="submit"]').first().click()
      await page.waitForTimeout(3000)
    }

    // 2. Connect Claude via API & inject settings into localStorage BEFORE entering editor
    const connectRes = await request.post(`${BASE_URL}/api/ai/connect-agent`, {
      data: { agent: 'claude-code' },
    })
    const connectData = await connectRes.json().catch(() => ({ connected: false, models: [] }))
    console.log(`[Test] Claude: connected=${connectData.connected}, models=${connectData.models?.length ?? 0}`)

    if (!connectData.connected) {
      console.log('[Test] Claude not available — aborting')
      await shot('no-claude')
      return
    }

    // Inject agent settings
    await page.evaluate(({ models }) => {
      const settings = {
        providers: {
          anthropic: { type: 'anthropic', displayName: 'Claude Code', isConnected: true, connectionMethod: 'oauth', models },
          openai: { type: 'openai', displayName: 'Codex CLI', isConnected: false, connectionMethod: null, models: [] },
          opencode: { type: 'opencode', displayName: 'OpenCode', isConnected: false, connectionMethod: null, models: [] },
          copilot: { type: 'copilot', displayName: 'GitHub Copilot', isConnected: false, connectionMethod: null, models: [] },
          gemini: { type: 'gemini', displayName: 'Gemini CLI', isConnected: false, connectionMethod: null, models: [] },
        },
      }
      localStorage.setItem('openpencil-agent-settings', JSON.stringify(settings))
      const firstModel = models?.[0]?.models?.[0]?.value ?? 'claude-sonnet-4-6'
      localStorage.setItem('openpencil-ai-model-preference', firstModel)
    }, { models: connectData.models })

    // 3. Enter a workspace → editor (click first workspace card)
    const wsCard = page.locator('a[href*="workspace"], [class*="workspace"]').first()
    if (await wsCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wsCard.click()
      await page.waitForTimeout(3000)
    }

    // Click "New Design" or "Create first design" to enter editor
    const newDesignBtn = page.locator('button:has-text("New Design"), button:has-text("Create first design")').first()
    if (await newDesignBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newDesignBtn.click()
      await page.waitForTimeout(5000)
    }

    await shot('editor-state')
    console.log('[Test] Editor state captured')

    // 4. Find chat input and send prompt
    const chatInput = page.locator('textarea').first()
    if (!await chatInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('[Test] No chat input found')
      await shot('no-chat')
      return
    }

    await chatInput.fill(DEFAULT_PROMPT)
    await page.waitForTimeout(300)
    await chatInput.press('Enter')
    console.log(`[Test] Prompt sent: ${DEFAULT_PROMPT.slice(0, 50)}...`)

    // 5. Wait for generation (poll until no more streaming indicators, max 5 min)
    await page.waitForTimeout(10000)
    for (let i = 0; i < 100; i++) {
      await page.waitForTimeout(3000)
      const isGenerating = await page.evaluate(() => {
        const text = document.body.innerText
        return text.includes('Generating...') || text.includes('Generating design')
          || !!document.querySelector('[data-streaming="true"]')
          || !!document.querySelector('.animate-spin')
      }).catch(() => false)
      if (!isGenerating) {
        console.log(`[Test] Generation complete (poll ${i})`)
        break
      }
      if (i % 10 === 0) console.log(`[Test] Still generating... (${i * 3}s)`)
    }
    await page.waitForTimeout(5000)

    // 6. Screenshots
    await shot('full')
    const canvas = page.locator('canvas').first()
    if (await canvas.isVisible().catch(() => false)) {
      await canvas.screenshot({ path: join(SCREENSHOT_DIR, `canvas-${ts}.png`) })
      console.log('[Test] Canvas screenshot saved')
    }

    // 7. Save diagnostic
    const diagPath = join(DIAG_DIR, `generation-${new Date().toISOString().slice(0, 10)}.log`)
    if (existsSync(diagPath)) {
      const content = readFileSync(diagPath, 'utf-8')
      const last = content.split('='.repeat(80)).pop()?.trim()
      if (last) writeFileSync(join(SCREENSHOT_DIR, `diag-${ts}.txt`), last)
    }
    console.log(`[Test] Done. Artifacts in ${SCREENSHOT_DIR}`)
  })
})
