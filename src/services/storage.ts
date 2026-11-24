import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type StoredDocument = {
  id: string
  name: string
  size: number
  bytes: ArrayBuffer
  updatedAt: number
}

interface PdfStudioDb extends DBSchema {
  documents: {
    key: string
    value: StoredDocument
  }
}

let dbPromise: Promise<IDBPDatabase<PdfStudioDb>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<PdfStudioDb>('pdf-studio', 1, {
      upgrade(db) {
        db.createObjectStore('documents', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export async function saveDocument(file: File) {
  const db = await getDb()
  const document: StoredDocument = {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    bytes: await file.arrayBuffer(),
    updatedAt: Date.now(),
  }
  await db.put('documents', document)
  return document
}

export async function listDocuments() {
  const db = await getDb()
  return db.getAll('documents')
}

export async function deleteDocument(id: string) {
  const db = await getDb()
  await db.delete('documents', id)
}
