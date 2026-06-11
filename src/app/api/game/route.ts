import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Create a new game session
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { pin } = body

    if (!pin || pin.length < 4) {
      return NextResponse.json({ error: 'PIN must be at least 4 characters' }, { status: 400 })
    }

    // If PIN already exists, delete the old game (participants cascade)
    const existing = await db.gameSession.findUnique({ where: { pin } })
    if (existing) {
      await db.gameSession.delete({ where: { pin } })
    }

    const game = await db.gameSession.create({
      data: { pin },
      include: { participants: true }
    })

    return NextResponse.json({ game })
  } catch (error) {
    console.error('Error creating game:', error)
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 })
  }
}

// Get game session
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameId = searchParams.get('gameId')
    const pin = searchParams.get('pin')

    if (gameId) {
      const game = await db.gameSession.findUnique({
        where: { id: gameId },
        include: { participants: true }
      })
      if (!game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 })
      }
      return NextResponse.json({ game })
    }

    if (pin) {
      const game = await db.gameSession.findUnique({
        where: { pin },
        include: { participants: true }
      })
      if (!game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 })
      }
      return NextResponse.json({ game })
    }

    return NextResponse.json({ error: 'Provide gameId or pin' }, { status: 400 })
  } catch (error) {
    console.error('Error getting game:', error)
    return NextResponse.json({ error: 'Failed to get game' }, { status: 500 })
  }
}
