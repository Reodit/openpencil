import { getCookie, setCookie, type H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { getDB } from './db'

const COOKIE_NAME = 'openpencil_uid'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

const USER_COLORS = [
  '#F24822', '#FF7262', '#FFC700', '#0FA958',
  '#1ABCFE', '#A259FF', '#F2439C', '#FF6B00',
]

export interface SessionUser {
  id: string
  name: string
  color: string
}

/**
 * Get current user from cookie. Returns null if not logged in.
 */
export function getSessionUser(event: H3Event): SessionUser | null {
  const uid = getCookie(event, COOKIE_NAME)
  if (!uid) return null

  const db = getDB()
  const row = db.query('SELECT id, name, color FROM users WHERE id = ?').get(uid) as SessionUser | null
  return row
}

/**
 * Create a new user and set cookie.
 */
export function createSessionUser(event: H3Event, name: string): SessionUser {
  const id = randomUUID()
  const db = getDB()
  const count = (db.query('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  const color = USER_COLORS[count % USER_COLORS.length]

  db.run('INSERT INTO users (id, name, color) VALUES (?, ?, ?)', [id, name, color])

  setCookie(event, COOKIE_NAME, id, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
  })

  return { id, name, color }
}

/**
 * Update user name.
 */
export function updateSessionUser(event: H3Event, name: string): SessionUser | null {
  const uid = getCookie(event, COOKIE_NAME)
  if (!uid) return null

  const db = getDB()
  db.run('UPDATE users SET name = ? WHERE id = ?', [name, uid])
  return db.query('SELECT id, name, color FROM users WHERE id = ?').get(uid) as SessionUser | null
}
