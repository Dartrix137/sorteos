'use client'

import React, { useRef, useEffect, useCallback, useState } from 'react'

interface SlotMachineProps {
  participants: { id: string; name: string }[]
  isSpinning: boolean
  onSpinComplete: (winner: { id: string; name: string }) => void
  winnerId?: string | null
}

export default function SlotMachine({ participants, isSpinning, onSpinComplete, winnerId }: SlotMachineProps) {
  const [displayNames, setDisplayNames] = useState<string[]>(['', '', ''])
  const [isAnimating, setIsAnimating] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [winnerName, setWinnerName] = useState('')
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasSpunRef = useRef(false)
  const iterationRef = useRef(0)
  const totalIterationsRef = useRef(0)

  // Reset when spinning stops
  useEffect(() => {
    if (!isSpinning) {
      hasSpunRef.current = false
    }
  }, [isSpinning])

  const getWinnerIndex = useCallback(() => {
    if (!winnerId) return Math.floor(Math.random() * participants.length)
    const idx = participants.findIndex(p => p.id === winnerId)
    return idx >= 0 ? idx : 0
  }, [winnerId, participants])

  const getRandomNames = useCallback((count: number, excludeWinner = true): string[] => {
    const names: string[] = []
    const available = participants.length > 2 ? participants.filter(p => true) : participants
    for (let i = 0; i < count; i++) {
      const randomIdx = Math.floor(Math.random() * available.length)
      names.push(available[randomIdx]?.name || '---')
    }
    return names
  }, [participants])

  // Start spin animation
  useEffect(() => {
    if (!isSpinning || hasSpunRef.current || participants.length === 0) return

    hasSpunRef.current = true
    setIsAnimating(true)
    setShowWinner(false)

    const winnerIndex = getWinnerIndex()
    const winner = participants[winnerIndex]
    setWinnerName(winner.name)

    // Total iterations: fast at start, slow at end (~5 seconds)
    // We'll use decreasing speed intervals
    const totalDuration = 5000
    const initialSpeed = 50 // ms between iterations at start
    const finalSpeed = 300 // ms between iterations at end

    let elapsed = 0
    let iteration = 0

    const animate = () => {
      const progress = Math.min(elapsed / totalDuration, 1)
      
      // Easing: start fast, end slow (cubic)
      const eased = progress * progress * progress
      
      // Current speed: interpolate from initial to final
      const currentSpeed = initialSpeed + (finalSpeed - initialSpeed) * eased

      // Get 3 random names, with the winner potentially in the center near the end
      let names: string[]
      
      if (progress > 0.85) {
        // Near the end, start placing the winner in the center
        const other1 = participants[Math.floor(Math.random() * participants.length)]?.name || '---'
        const other2 = participants[Math.floor(Math.random() * participants.length)]?.name || '---'
        names = [other1, winner.name, other2]
      } else {
        names = getRandomNames(3)
      }

      setDisplayNames(names)
      iteration++
      iterationRef.current = iteration
      elapsed += currentSpeed

      if (progress < 1) {
        animationRef.current = setTimeout(animate, currentSpeed)
      } else {
        // Final frame: show winner in center
        const other1 = participants.find(p => p.id !== winner.id)
        const other1Name = other1?.name || '---'
        const other2 = participants.find(p => p.id !== winner.id && p.id !== other1?.id)
        const other2Name = other2?.name || '---'
        
        setDisplayNames([other1Name, winner.name, other2Name])
        
        // Brief pause then show winner effect
        setTimeout(() => {
          setIsAnimating(false)
          setShowWinner(true)
          // Small delay before triggering completion callback for the zoom effect
          setTimeout(() => {
            onSpinComplete(winner)
          }, 1500)
        }, 400)
      }
    }

    animate()

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [isSpinning, participants, winnerId, getWinnerIndex, getRandomNames, onSpinComplete])

  // Idle state - show static names
  useEffect(() => {
    if (!isAnimating && !showWinner && participants.length > 0) {
      setDisplayNames(getRandomNames(3))
    }
  }, [participants, isAnimating, showWinner, getRandomNames])

  if (participants.length === 0) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="neon-border rounded-2xl p-8 bg-[#111127] text-center">
          <p className="text-[#8888aa] text-sm">Sin participantes aún</p>
        </div>
      </div>
    )
  }

  // Winner revealed with zoom + neon flash
  if (showWinner) {
    return (
      <div className="w-full max-w-lg mx-auto">
        {/* Neon flash background */}
        <div className="relative">
          <div className="absolute inset-0 bg-[#00ff8a] opacity-20 rounded-2xl animate-ping" style={{ animationDuration: '0.5s', animationIterationCount: '3' }} />
          
          <div className="relative neon-glow rounded-2xl p-8 bg-[#111127] text-center border-2 border-[#00ff8a]">
            <p className="text-[#8888aa] text-xs uppercase tracking-widest mb-2">El ganador es</p>
            <h2 
              className="text-3xl md:text-5xl font-bold gradient-text animate-[zoom-in_0.8s_ease-out_forwards]"
              style={{
                animation: 'zoomIn 0.8s ease-out forwards',
              }}
            >
              {winnerName}
            </h2>
          </div>
        </div>

        <style jsx>{`
          @keyframes zoomIn {
            0% { transform: scale(0.3); opacity: 0; }
            50% { transform: scale(1.2); opacity: 1; }
            70% { transform: scale(0.9); }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // Spinning state - slot machine with 3 names
  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="neon-border rounded-2xl bg-[#111127] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] p-2 text-center">
          <p className="text-[#0a0a1a] font-bold text-xs uppercase tracking-widest">
            {isAnimating ? '🎰 Girando...' : 'Listo para sortear'}
          </p>
        </div>

        {/* Name display area */}
        <div className="p-6">
          <div className="flex items-center justify-center gap-2">
            {/* Left name (previous) */}
            <div className={`flex-1 text-center py-4 px-2 rounded-xl bg-[#0a0a1a] border border-[#1a1a3e] transition-all duration-100 ${isAnimating ? 'opacity-40 scale-90' : 'opacity-60'}`}>
              <p className="text-[#8888aa] text-sm md:text-base truncate">
                {displayNames[0]}
              </p>
            </div>

            {/* Center name (current) - highlighted */}
            <div className={`flex-1 text-center py-4 px-3 rounded-xl border-2 transition-all duration-100 ${isAnimating ? 'border-[#00ff8a] bg-[#00ff8a]/10 scale-105' : 'border-[#1a1a3e] bg-[#0a0a1a]'}`}>
              <p className={`text-lg md:text-2xl font-bold truncate ${isAnimating ? 'text-[#00ff8a] neon-text' : 'text-[#e0e0f0]'}`}>
                {displayNames[1]}
              </p>
            </div>

            {/* Right name (next) */}
            <div className={`flex-1 text-center py-4 px-2 rounded-xl bg-[#0a0a1a] border border-[#1a1a3e] transition-all duration-100 ${isAnimating ? 'opacity-40 scale-90' : 'opacity-60'}`}>
              <p className="text-[#8888aa] text-sm md:text-base truncate">
                {displayNames[2]}
              </p>
            </div>
          </div>

          {/* Speed indicator */}
          {isAnimating && (
            <div className="mt-4">
              <div className="h-1 bg-[#0a0a1a] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#8e00ff] to-[#00ff8a] rounded-full transition-all duration-300"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
