import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Reset game - delete all participants and create a new session
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { gameId } = body

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 })
    }

    const game = await db.gameSession.findUnique({
      where: { id: gameId },
      include: { participants: true }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Delete all participants
    await db.participant.deleteMany({
      where: { gameSessionId: gameId }
    })

    // Delete the old game session
    await db.gameSession.delete({
      where: { id: gameId }
    })

    // Generate new PIN
    const newPin = Math.random().toString(36).substring(2, 8).toUpperCase()

    // Create new game session
    const newGame = await db.gameSession.create({
      data: { pin: newPin },
      include: { participants: true }
    })

    return NextResponse.json({ game: newGame })
  } catch (error) {
    console.error('Error resetting game:', error)
    return NextResponse.json({ error: 'Failed to reset game' }, { status: 500 })
  }
}
