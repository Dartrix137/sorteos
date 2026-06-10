import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Start the spin / select winner
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

    if (game.participants.length === 0) {
      return NextResponse.json({ error: 'No participants in this game' }, { status: 400 })
    }

    if (game.status === 'spinning') {
      return NextResponse.json({ error: 'Game is already spinning' }, { status: 400 })
    }

    // Select random winner
    const randomIndex = Math.floor(Math.random() * game.participants.length)
    const winner = game.participants[randomIndex]

    // Update game status
    await db.gameSession.update({
      where: { id: gameId },
      data: { status: 'spinning' }
    })

    // Mark winner after a delay (the spin animation will show, then we confirm)
    // We return the winner info so the organizer can emit it after the animation
    return NextResponse.json({
      winner: { id: winner.id, name: winner.name },
      totalParticipants: game.participants.length
    })
  } catch (error) {
    console.error('Error starting spin:', error)
    return NextResponse.json({ error: 'Failed to start spin' }, { status: 500 })
  }
}

// Confirm winner (after animation completes)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { gameId, winnerId } = body

    if (!gameId || !winnerId) {
      return NextResponse.json({ error: 'Game ID and winner ID are required' }, { status: 400 })
    }

    // Update game status and winner
    await db.gameSession.update({
      where: { id: gameId },
      data: { status: 'finished' }
    })

    // Mark the winner
    await db.participant.update({
      where: { id: winnerId },
      data: { isWinner: true }
    })

    const winner = await db.participant.findUnique({ where: { id: winnerId } })

    return NextResponse.json({ winner })
  } catch (error) {
    console.error('Error confirming winner:', error)
    return NextResponse.json({ error: 'Failed to confirm winner' }, { status: 500 })
  }
}
