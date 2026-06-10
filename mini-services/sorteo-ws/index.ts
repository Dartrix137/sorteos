import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Store game state in memory (synced with DB via API)
const gameRooms = new Map<string, {
  participants: { id: string; name: string; email: string; whatsapp: string }[]
  status: 'waiting' | 'spinning' | 'finished'
  winner: { id: string; name: string } | null
}>()

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`)

  // Join a game room
  socket.on('join-game', (data: { gameId: string; role: 'organizer' | 'participant' }) => {
    const { gameId, role } = data
    const room = `game-${gameId}`
    socket.join(room)

    // Initialize room if not exists
    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, {
        participants: [],
        status: 'waiting',
        winner: null
      })
    }

    // Send current state to the newly joined socket
    const gameState = gameRooms.get(gameId)!
    socket.emit('game-state', gameState)

    console.log(`${role} joined game ${gameId}`)
  })

  // New participant registered (called from API after DB insert)
  socket.on('participant-registered', (data: { gameId: string; participant: { id: string; name: string; email: string; whatsapp: string } }) => {
    const { gameId, participant } = data
    const room = `game-${gameId}`

    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, {
        participants: [],
        status: 'waiting',
        winner: null
      })
    }

    const gameState = gameRooms.get(gameId)!
    if (!gameState.participants.find(p => p.id === participant.id)) {
      gameState.participants.push(participant)
    }

    // Broadcast to all in the room
    io.to(room).emit('participant-added', participant)
    io.to(room).emit('participant-count', gameState.participants.length)

    console.log(`Participant ${participant.name} registered in game ${gameId}. Total: ${gameState.participants.length}`)
  })

  // Start spin (from organizer)
  socket.on('start-spin', (data: { gameId: string }) => {
    const { gameId } = data
    const room = `game-${gameId}`

    if (gameRooms.has(gameId)) {
      const gameState = gameRooms.get(gameId)!
      gameState.status = 'spinning'
      gameState.winner = null
    }

    // Broadcast spin start to all
    io.to(room).emit('spin-started', { gameId })

    console.log(`Spin started for game ${gameId}`)
  })

  // Winner selected (from organizer after spin)
  socket.on('winner-selected', (data: { gameId: string; winner: { id: string; name: string } }) => {
    const { gameId, winner } = data
    const room = `game-${gameId}`

    if (gameRooms.has(gameId)) {
      const gameState = gameRooms.get(gameId)!
      gameState.status = 'finished'
      gameState.winner = winner
    }

    // Broadcast winner to all
    io.to(room).emit('spin-result', { winner })

    console.log(`Winner selected for game ${gameId}: ${winner.name}`)
  })

  // Reset game (from organizer)
  socket.on('reset-game', (data: { gameId: string }) => {
    const { gameId } = data
    const room = `game-${gameId}`

    gameRooms.delete(gameId)

    // Broadcast reset to all
    io.to(room).emit('game-reset', { gameId })

    console.log(`Game ${gameId} reset`)
  })

  // Sync participants from DB (called after API operations)
  socket.on('sync-participants', (data: { gameId: string; participants: { id: string; name: string; email: string; whatsapp: string }[] }) => {
    const { gameId, participants } = data

    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, {
        participants: [],
        status: 'waiting',
        winner: null
      })
    }

    const gameState = gameRooms.get(gameId)!
    gameState.participants = participants

    const room = `game-${gameId}`
    io.to(room).emit('participant-count', participants.length)
  })

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`)
  })

  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`Sorteo WebSocket server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...')
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})
