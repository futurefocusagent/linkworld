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

// Download and save an image, return the local path
export async function downloadAndSaveImage(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkWorld/1.0)',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    })

    if (!response.ok) {
      console.error(`Failed to download image: ${response.status} ${imageUrl}`)
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('image')) {
      console.error(`Not an image: ${contentType} ${imageUrl}`)
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    
    // Skip tiny images (likely tracking pixels)
    if (buffer.length < 1000) {
      console.log(`Skipping tiny image (${buffer.length} bytes): ${imageUrl}`)
      return null
    }

    const filename = generateFilename(imageUrl)
    const filepath = path.join(STORAGE_DIR, filename)
    
    fs.writeFileSync(filepath, buffer)
    console.log(`Saved image: ${filename} (${buffer.length} bytes)`)
    
    return filename
  } catch (err) {
    console.error(`Error downloading image ${imageUrl}:`, err)
    return null
  }
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
