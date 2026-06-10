'use client'

import React, { useRef, useEffect, useCallback, useState } from 'react'

interface SpinWheelProps {
  participants: { id: string; name: string }[]
  isSpinning: boolean
  onSpinComplete: (winner: { id: string; name: string }) => void
  winnerId?: string | null
}

const COLORS = [
  '#00ff8a', '#8e00ff', '#00d9ff', '#6a00ff', '#00ffbf',
  '#ff6b35', '#00b4d8', '#e040fb', '#76ff03', '#ffab00',
  '#00e5ff', '#d500f9', '#64ffda', '#ff3d00', '#18ffff',
  '#aa00ff', '#b2ff59', '#ff6d00', '#84ffff', '#c51162',
]

export default function SpinWheel({ participants, isSpinning, onSpinComplete, winnerId }: SpinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const currentAngleRef = useRef(0)
  const spinStartRef = useRef(0)
  const hasSpunRef = useRef(false)
  const [canvasSize, setCanvasSize] = useState(300)

  // Responsive canvas size
  useEffect(() => {
    const updateSize = () => {
      const parent = canvasRef.current?.parentElement
      if (parent) {
        const size = Math.min(parent.clientWidth, 400)
        setCanvasSize(size)
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const getWinnerIndex = useCallback(() => {
    if (!winnerId) return Math.floor(Math.random() * participants.length)
    const idx = participants.findIndex(p => p.id === winnerId)
    return idx >= 0 ? idx : 0
  }, [winnerId, participants])

  // Draw the wheel
  const drawWheel = useCallback((ctx: CanvasRenderingContext2D, angle: number, size: number) => {
    const centerX = size / 2
    const centerY = size / 2
    const radius = size / 2 - 15

    ctx.clearRect(0, 0, size, size)

    if (participants.length === 0) {
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
      ctx.fillStyle = '#111127'
      ctx.fill()
      ctx.strokeStyle = '#1a1a3e'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#8888aa'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Sin participantes', centerX, centerY)
      return
    }

    const sliceAngle = (2 * Math.PI) / participants.length

    // Draw outer glow
    ctx.save()
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius + 8, 0, 2 * Math.PI)
    ctx.strokeStyle = '#00ff8a'
    ctx.lineWidth = 3
    ctx.shadowColor = '#00ff8a'
    ctx.shadowBlur = 20
    ctx.stroke()
    ctx.restore()

    // Draw slices
    participants.forEach((participant, i) => {
      const startAngle = angle + i * sliceAngle
      const endAngle = startAngle + sliceAngle

      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      ctx.closePath()

      const color = COLORS[i % COLORS.length]
      ctx.fillStyle = color + '33'
      ctx.fill()

      ctx.strokeStyle = color + '88'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Draw text
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(startAngle + sliceAngle / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.min(14, Math.max(8, 200 / participants.length))}px sans-serif`
      ctx.shadowColor = '#000000'
      ctx.shadowBlur = 4

      const textRadius = radius - 20
      const maxChars = Math.max(5, Math.floor(textRadius / 8))
      const displayName = participant.name.length > maxChars
        ? participant.name.substring(0, maxChars) + '...'
        : participant.name
      ctx.fillText(displayName, textRadius, 4)
      ctx.restore()
    })

    // Draw center circle
    ctx.beginPath()
    ctx.arc(centerX, centerY, 25, 0, 2 * Math.PI)
    const gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, 25)
    gradient.addColorStop(0, '#8e00ff')
    gradient.addColorStop(1, '#6a00ff')
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = '#00ff8a'
    ctx.lineWidth = 2
    ctx.shadowColor = '#00ff8a'
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.shadowBlur = 0

    // Draw pointer (top)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(centerX, 5)
    ctx.lineTo(centerX - 12, 0)
    ctx.lineTo(centerX + 12, 0)
    ctx.closePath()
    ctx.fillStyle = '#00ff8a'
    ctx.shadowColor = '#00ff8a'
    ctx.shadowBlur = 15
    ctx.fill()
    ctx.restore()
  }, [participants])

  // Initial draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvasSize
    canvas.height = canvasSize

    if (!isSpinning) {
      drawWheel(ctx, currentAngleRef.current, canvasSize)
    }
  }, [canvasSize, participants, drawWheel, isSpinning])

  // Spin animation
  useEffect(() => {
    if (!isSpinning || hasSpunRef.current || participants.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    hasSpunRef.current = true
    spinStartRef.current = Date.now()

    canvas.width = canvasSize
    canvas.height = canvasSize

    const winnerIndex = getWinnerIndex()
    const sliceAngle = (2 * Math.PI) / participants.length
    const targetSliceCenter = winnerIndex * sliceAngle + sliceAngle / 2
    const targetAngle = -(Math.PI / 2) - targetSliceCenter + (2 * Math.PI * 5)

    const startAngle = currentAngleRef.current
    const totalSpin = targetAngle - startAngle
    const duration = 5000

    const animate = () => {
      const elapsed = Date.now() - spinStartRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Easing: dramatic slowdown at the end
      const eased = 1 - Math.pow(1 - progress, 3)

      const currentAngle = startAngle + totalSpin * eased
      currentAngleRef.current = currentAngle

      drawWheel(ctx, currentAngle, canvasSize)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        // Spin complete
        hasSpunRef.current = false
        if (winnerIndex < participants.length) {
          onSpinComplete(participants[winnerIndex])
        }
      }
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isSpinning, participants, canvasSize, getWinnerIndex, onSpinComplete, drawWheel])

  return (
    <div className="relative w-full max-w-[400px] mx-auto aspect-square">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}
