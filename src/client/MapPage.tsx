import { useState, useEffect, useRef, useCallback } from 'react'

interface Point {
  id: number
  x: number
  y: number
  title: string
  url: string
  og_description: string | null
  og_image: string | null
}

export default function MapPage() {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)
  const [hovered, setHovered] = useState<Point | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  const fetchUmap = useCallback(async () => {
    const res = await fetch('/api/umap')
    const data = await res.json()
    setPoints(data.points || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchUmap()
  }, [fetchUmap])

  const recalculate = async () => {
    setRecalculating(true)
    await fetch('/api/umap/recalculate', { method: 'POST' })
    await fetchUmap()
    setRecalculating(false)
  }

  // Normalize coordinates to viewport
  const width = 800
  const height = 600
  const padding = 40
  
  const xMin = Math.min(...points.map(p => p.x), 0)
  const xMax = Math.max(...points.map(p => p.x), 1)
  const yMin = Math.min(...points.map(p => p.y), 0)
  const yMax = Math.max(...points.map(p => p.y), 1)
  
  const scaleX = (x: number) => padding + ((x - xMin) / (xMax - xMin || 1)) * (width - padding * 2)
  const scaleY = (y: number) => padding + ((y - yMin) / (yMax - yMin || 1)) * (height - padding * 2)

  // Color based on title hash
  const getColor = (title: string) => {
    let hash = 0
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 70%, 60%)`
  }

  // Mouse handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
    if (dragging.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }
  }

  const handleMouseUp = () => {
    dragging.current = false
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setTransform(t => ({ ...t, scale: Math.max(0.5, Math.min(5, t.scale * delta)) }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <p>Loading UMAP visualization...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Link Map ({points.length} links)</h1>
        <button
          onClick={recalculate}
          disabled={recalculating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 rounded text-sm"
        >
          {recalculating ? 'Recalculating...' : 'Recalculate UMAP'}
        </button>
      </div>

      <div className="relative border border-zinc-700 rounded overflow-hidden">
        <svg
          ref={svgRef}
          width="100%"
          height="600"
          viewBox={`0 0 ${width} ${height}`}
          className="bg-zinc-950 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            {points.map(point => (
              <circle
                key={point.id}
                cx={scaleX(point.x)}
                cy={scaleY(point.y)}
                r={4}
                fill={getColor(point.title)}
                className="cursor-pointer hover:opacity-80"
                onMouseEnter={() => setHovered(point)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hovered && (
          <div
            className="absolute pointer-events-none bg-zinc-800 rounded-lg shadow-xl p-3 max-w-xs z-50"
            style={{
              left: Math.min(mousePos.x + 10, window.innerWidth - 320),
              top: mousePos.y + 10,
              position: 'fixed'
            }}
          >
            <div className="flex gap-3">
              {hovered.og_image && (
                <img
                  src={hovered.og_image}
                  alt=""
                  className="w-12 h-12 rounded object-cover flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">{hovered.title}</h3>
                {hovered.og_description && (
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                    {hovered.og_description}
                  </p>
                )}
                <p className="text-xs text-zinc-500 truncate mt-1">{hovered.url}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-500 mt-2">
        Drag to pan, scroll to zoom. Hover over points to see link details.
      </p>
    </div>
  )
}
