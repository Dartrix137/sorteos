import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Participant joins a game
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { gameId, name, email, whatsapp } = body

    if (!gameId || !name || !email || !whatsapp) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    // Check game exists and is in waiting status
    const game = await db.gameSession.findUnique({
      where: { id: gameId },
      include: { participants: true }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Registration stays open regardless of game status (waiting/spinning/finished)
    // so people can keep joining for a future re-draw even after a winner was picked.

    // Check for duplicate email or whatsapp in this game
    const existingEmail = await db.participant.findUnique({
      where: { email_gameSessionId: { email, gameSessionId: gameId } }
    })
    if (existingEmail) {
      return NextResponse.json({ error: 'Este correo ya está registrado en este sorteo' }, { status: 400 })
    }

    const existingWhatsapp = await db.participant.findUnique({
      where: { whatsapp_gameSessionId: { whatsapp, gameSessionId: gameId } }
    })
    if (existingWhatsapp) {
      return NextResponse.json({ error: 'Este número de WhatsApp ya está registrado en este sorteo' }, { status: 400 })
    }

    const participant = await db.participant.create({
      data: {
        name,
        email,
        whatsapp,
        gameSessionId: gameId
      }
    })

    return NextResponse.json({ participant })
  } catch (error) {
    console.error('Error joining game:', error)
    return NextResponse.json({ error: 'Failed to join game' }, { status: 500 })
  }
}
