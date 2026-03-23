import { getCookie, setCookie, type H3Event } from 'h3'
import { randomUUID, createHash } from 'node:crypto'
import { getDB } from './db'

const COOKIE_NAME = 'openpencil_uid'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

const USER_COLORS = [
  '#F24822', '#FF7262', '#FFC700', '#0FA958',
  '#1ABCFE', '#A259FF', '#F2439C', '#FF6B00',
]

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export interface SessionUser {
  id: string
  username: string
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
  const row = db.query('SELECT id, username, name, color FROM users WHERE id = ?').get(uid) as SessionUser | null
  return row
}

function setSessionCookie(event: H3Event, uid: string) {
  setCookie(event, COOKIE_NAME, uid, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
  })
}

/**
 * Register a new user.
 */
export function registerUser(event: H3Event, username: string, password: string, displayName: string): SessionUser | { error: string } {
  const db = getDB()
  const existing = db.query('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return { error: 'Username already taken' }

  const id = randomUUID()
  const count = (db.query('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  const color = USER_COLORS[count % USER_COLORS.length]
  const hash = hashPassword(password)

  db.run('INSERT INTO users (id, username, password_hash, name, color) VALUES (?, ?, ?, ?, ?)', [id, username, hash, displayName, color])
  setSessionCookie(event, id)

  return { id, username, name: displayName, color }
}

/**
 * Login with username and password.
 */
export function loginUser(event: H3Event, username: string, password: string): SessionUser | { error: string } {
  const db = getDB()
  const row = db.query('SELECT id, username, name, color, password_hash FROM users WHERE username = ?').get(username) as (SessionUser & { password_hash: string }) | null
  if (!row) return { error: 'Invalid username or password' }

  if (row.password_hash !== hashPassword(password)) {
    return { error: 'Invalid username or password' }
  }

  setSessionCookie(event, row.id)
  return { id: row.id, username: row.username, name: row.name, color: row.color }
}

/**
 * Update user display name.
 */
export function updateSessionUser(event: H3Event, name: string): SessionUser | null {
  const uid = getCookie(event, COOKIE_NAME)
  if (!uid) return null

  const db = getDB()
  db.run('UPDATE users SET name = ? WHERE id = ?', [name, uid])
  return db.query('SELECT id, username, name, color FROM users WHERE id = ?').get(uid) as SessionUser | null
}

/**
 * Logout: clear cookie.
 */
export function logoutUser(event: H3Event) {
  setCookie(event, COOKIE_NAME, '', { maxAge: 0, path: '/' })
}
