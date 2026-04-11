import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// Use persistent disk on Render, fallback to local for dev
const STORAGE_DIR = process.env.NODE_ENV === 'production' 
  ? '/var/data/images' 
  : './data/images'

// Ensure storage directory exists
export function initImageStorage() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true })
    console.log(`Created image storage at ${STORAGE_DIR}`)
  }
}

// Generate a filename from URL
function generateFilename(url: string): string {
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 12)
  const ext = getExtension(url)
  return `${hash}${ext}`
}

function getExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    if (pathname.includes('.png')) return '.png'
    if (pathname.includes('.gif')) return '.gif'
    if (pathname.includes('.webp')) return '.webp'
    if (pathname.includes('.svg')) return '.svg'
    return '.jpg' // default
  } catch {
    return '.jpg'
  }
}

// User agents to try (some sites block bots)
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; LinkWorld/1.0)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
]

// Download and save an image, return the local path
export async function downloadAndSaveImage(imageUrl: string): Promise<string | null> {
  // Try with different user agents
  for (const userAgent of USER_AGENTS) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'image/*,*/*',
          'Referer': new URL(imageUrl).origin,
        },
        signal: AbortSignal.timeout(15000),
        // @ts-ignore - node fetch supports this
        redirect: 'follow',
      })

      if (!response.ok) {
        console.log(`  Attempt failed (${response.status}) with UA: ${userAgent.slice(0, 30)}...`)
        continue
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('image') && !contentType.includes('octet-stream')) {
        console.log(`  Not an image: ${contentType}`)
        continue
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      
      // Skip tiny images (likely tracking pixels)
      if (buffer.length < 1000) {
        console.log(`  Skipping tiny image (${buffer.length} bytes)`)
        continue
      }

      const filename = generateFilename(imageUrl)
      const filepath = path.join(STORAGE_DIR, filename)
      
      fs.writeFileSync(filepath, buffer)
      console.log(`  Saved image: ${filename} (${buffer.length} bytes)`)
      
      return filename
    } catch (err) {
      console.log(`  Download attempt failed: ${(err as Error).message?.slice(0, 50)}`)
      continue
    }
  }
  
  console.error(`  All download attempts failed for: ${imageUrl}`)
  return null
}

// Extract first image URL from markdown content
export function extractFirstImage(markdown: string): string | null {
  // Match markdown images: ![alt](url)
  const mdMatch = markdown.match(/!\[[^\]]*\]\(([^)]+)\)/)
  if (mdMatch) {
    const url = mdMatch[1]
    // Skip data URIs and SVG placeholders
    if (!url.startsWith('data:') && !url.includes('svg+xml')) {
      return url
    }
  }

  // Match HTML images: <img src="url">
  const htmlMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/)
  if (htmlMatch) {
    const url = htmlMatch[1]
    if (!url.startsWith('data:') && !url.includes('svg+xml')) {
      return url
    }
  }

  return null
}

// Get the URL to serve an image
export function getImageUrl(filename: string): string {
  return `/images/${filename}`
}

// Check if an image file exists
export function imageExists(filename: string): boolean {
  return fs.existsSync(path.join(STORAGE_DIR, filename))
}

// Get the storage directory (for serving static files)
export function getStorageDir(): string {
  return STORAGE_DIR
}

// Generate an SVG placeholder for content without images
export function generatePlaceholder(title: string, url: string): string {
  // Generate a consistent color from the URL
  const hash = crypto.createHash('md5').update(url).digest('hex')
  const hue = parseInt(hash.slice(0, 2), 16) * 1.4 // 0-360
  const saturation = 40 + (parseInt(hash.slice(2, 4), 16) % 30) // 40-70%
  const lightness = 25 + (parseInt(hash.slice(4, 6), 16) % 15) // 25-40%
  
  // Truncate title for display
  const displayTitle = title.length > 60 ? title.slice(0, 57) + '...' : title
  
  // Determine icon based on URL
  let icon = '📄' // default document
  if (url.includes('.pdf') || url.includes('arxiv')) icon = '📑'
  else if (url.includes('github')) icon = '💻'
  else if (url.includes('youtube') || url.includes('vimeo')) icon = '🎬'
  
  // Create SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:hsl(${hue},${saturation}%,${lightness}%)"/>
      <stop offset="100%" style="stop-color:hsl(${hue + 30},${saturation}%,${lightness - 10}%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#bg)"/>
  <text x="200" y="120" text-anchor="middle" font-size="48" fill="white" opacity="0.9">${icon}</text>
  <text x="200" y="180" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="white" opacity="0.9">
    <tspan x="200" dy="0">${escapeXml(displayTitle.slice(0, 35))}</tspan>
    ${displayTitle.length > 35 ? `<tspan x="200" dy="18">${escapeXml(displayTitle.slice(35))}</tspan>` : ''}
  </text>
</svg>`

  const filename = `placeholder-${hash.slice(0, 12)}.svg`
  const filepath = path.join(STORAGE_DIR, filename)
  
  fs.writeFileSync(filepath, svg)
  console.log(`  Generated placeholder: ${filename}`)
  
  return filename
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
