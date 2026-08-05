import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// SQLite by default allows a single writer and errors out immediately
// ("database is locked") when a write collides with another one in
// progress. With many participants registering concurrently, this fires
// right when the organizer starts the draw. WAL lets reads and writes
// coexist, and busy_timeout makes writers wait instead of failing fast.
if (!globalForPrisma.prisma) {
  db.$executeRawUnsafe('PRAGMA journal_mode = WAL;')
    .then(() => db.$executeRawUnsafe('PRAGMA busy_timeout = 5000;'))
    .catch((err) => console.error('Failed to configure SQLite pragmas:', err))
}