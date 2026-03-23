/**
 * IndexedDB persistence layer for user-added fonts.
 * Stores font binary data (ArrayBuffer) keyed by a nanoid.
 */

const DB_NAME = 'openpencil-fonts'
const DB_VERSION = 1
const STORE_NAME = 'user-fonts'

export interface StoredFont {
  id: string
  family: string
  source: 'google' | 'custom'
  weights: number[]
  addedAt: number
  files: Array<{
    weight: number
    format: 'woff2' | 'ttf' | 'otf'
    data: ArrayBuffer
  }>
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAllUserFonts(): Promise<StoredFont[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as StoredFont[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function addUserFont(font: StoredFont): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(font)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function removeUserFont(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getUserFontByFamily(family: string): Promise<StoredFont | null> {
  const all = await getAllUserFonts()
  return all.find(f => f.family.toLowerCase() === family.toLowerCase()) ?? null
}
