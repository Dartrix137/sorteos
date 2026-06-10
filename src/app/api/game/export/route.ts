import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Export participants as Excel-ready JSON data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameId = searchParams.get('gameId')

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

    const data = game.participants.map((p, i) => ({
      '#': i + 1,
      Nombre: p.name,
      Correo: p.email,
      WhatsApp: p.whatsapp,
      Ganador: p.isWinner ? 'Sí' : 'No',
      'Fecha Registro': p.createdAt.toLocaleString('es')
    }))

    return NextResponse.json({ participants: data, total: game.participants.length })
  } catch (error) {
    console.error('Error exporting data:', error)
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}
