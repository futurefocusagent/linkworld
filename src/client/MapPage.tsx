import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'

interface Tag {
  id: number
  name: string
}

interface Point {
  id: number
  x: number
  y: number
  title: string
  url: string
  og_description: string | null
  og_image: string | null
  tags: Tag[]
}

interface ClusterLabel {
  x: number
  y: number
  tags: string[]
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
  const padding = 60
  
  const xMin = Math.min(...points.map(p => p.x), 0)
  const xMax = Math.max(...points.map(p => p.x), 1)
  const yMin = Math.min(...points.map(p => p.y), 0)
  const yMax = Math.max(...points.map(p => p.y), 1)
  
  const scaleX = (x: number) => padding + ((x - xMin) / (xMax - xMin || 1)) * (width - padding * 2)
  const scaleY = (y: number) => padding + ((y - yMin) / (yMax - yMin || 1)) * (height - padding * 2)

  // Compute cluster labels based on spatial proximity and shared tags
  const clusterLabels = useMemo(() => {
    if (points.length < 5) return []
    
    const gridSize = 80 // pixels per grid cell
    const cells: Map<string, Point[]> = new Map()
    
    // Group points into grid cells
    for (const p of points) {
      const cx = Math.floor(scaleX(p.x) / gridSize)
      const cy = Math.floor(scaleY(p.y) / gridSize)
      const key = `${cx},${cy}`
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key)!.push(p)
    }
    
    const labels: ClusterLabel[] = []
    
    for (const [key, cellPoints] of cells) {
      if (cellPoints.length < 2) continue // need at least 2 points for a cluster
      
      // Count tag frequency in this cell
      const tagCounts: Map<string, number> = new Map()
      for (const p of cellPoints) {
        for (const tag of p.tags || []) {
          // Skip action/project tags for cleaner labels
          if (tag.name.startsWith('@') || tag.name.startsWith('#')) continue
          tagCounts.set(tag.name, (tagCounts.get(tag.name) || 0) + 1)
        }
      }
      
      // Get tags shared by at least 40% of points in the cell
      const threshold = Math.max(2, Math.floor(cellPoints.length * 0.4))
      const sharedTags = [...tagCounts.entries()]
        .filter(([, count]) => count >= threshold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.min(3, Math.ceil(cellPoints.length / 3))) // more points = more tags
        .map(([name]) => name)
      
      if (sharedTags.length === 0) continue
      
      // Position label at centroid of cell
      const [cx, cy] = key.split(',').map(Number)
      labels.push({
        x: (cx + 0.5) * gridSize,
        y: (cy + 0.5) * gridSize,
        tags: sharedTags,
      })
    }
    
    return labels
  }, [points, scaleX, scaleY])

  // Color based on primary tag or title hash
  const getColor = (point: Point) => {
    const tag = point.tags?.[0]?.name || point.title
    let hash = 0
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash)
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
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading UMAP visualization...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</Link>
          <h1 className="text-xl text-zinc-300">Link Map ({points.length} links)</h1>
        </div>
        <button
          onClick={recalculate}
          disabled={recalculating}
          className="px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-50 text-sm"
        >
          {recalculating ? 'Recalculating...' : 'Recalculate UMAP'}
        </button>
      </div>

      <div className="relative border border-zinc-800 overflow-hidden">
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
            {/* Cluster labels */}
            {clusterLabels.map((label, i) => (
              <text
                key={`label-${i}`}
                x={label.x}
                y={label.y}
                className="fill-zinc-600 text-[10px] pointer-events-none"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label.tags.join(' · ')}
              </text>
            ))}
            
            {/* Points */}
            {points.map(point => (
              <circle
                key={point.id}
                cx={scaleX(point.x)}
                cy={scaleY(point.y)}
                r={4}
                fill={getColor(point)}
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
            className="pointer-events-none bg-zinc-900 border border-zinc-700 shadow-xl p-3 max-w-xs z-50"
            style={{
              position: 'fixed',
              left: Math.min(mousePos.x + 10, window.innerWidth - 320),
              top: mousePos.y + 10,
            }}
          >
            <div className="flex gap-3">
              {hovered.og_image && (
                <img
                  src={hovered.og_image}
                  alt=""
                  className="w-12 h-12 object-cover flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <h3 className="font-medium text-sm text-zinc-200 truncate">{hovered.title}</h3>
                {hovered.og_description && (
                  <p className="text-xs text-zinc-500 line-clamp-2 mt-1">
                    {hovered.og_description}
                  </p>
                )}
                {hovered.tags && hovered.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {hovered.tags.slice(0, 5).map(tag => (
                      <span key={tag.id} className="text-[10px] text-zinc-600 bg-zinc-800 px-1">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-600 mt-2">
        Drag to pan, scroll to zoom. Hover over points to see details. Labels show common tags in clusters.
      </p>
    </div>
  )
}
