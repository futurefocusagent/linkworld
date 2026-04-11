import React, { useEffect, useState, useCallback } from 'react'

interface Tag {
  id: number
  name: string
  count?: number
}

interface Link {
  id: number
  url: string
  title: string
  og_title: string | null
  og_description: string | null
  og_image: string | null
  created_at: string
  similarity?: number
  tags?: Tag[]
}

type View = 'chronological' | 'search' | 'similar' | 'tags' | 'byTag'

export default function App() {
  const [links, setLinks] = useState<Link[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('chronological')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Link[]>([])
  const [searching, setSearching] = useState(false)
  const [similarSource, setSimilarSource] = useState<Link | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)

  // Load chronological links
  const loadLinks = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/links')
    const data = await res.json()
    setLinks(data.links)
    setTotal(data.total)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadLinks()
  }, [loadLinks])

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setView('search')
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.results)
    } catch (err) {
      console.error(err)
    }
    setSearching(false)
  }, [searchQuery])

  // Find similar handler
  const handleFindSimilar = useCallback(async (link: Link) => {
    setSearching(true)
    setView('similar')
    setSimilarSource(link)
    try {
      const res = await fetch(`/api/links/${link.id}/similar`)
      const data = await res.json()
      setSearchResults(data.similar)
    } catch (err) {
      console.error(err)
    }
    setSearching(false)
  }, [])

  // Load tags
  const loadTags = useCallback(async () => {
    const res = await fetch('/api/tags')
    const data = await res.json()
    setAllTags(data.tags)
  }, [])

  // Show tags view
  const handleShowTags = useCallback(async () => {
    setView('tags')
    await loadTags()
  }, [loadTags])

  // Filter by tag
  const handleFilterByTag = useCallback(async (tag: Tag) => {
    setSelectedTag(tag)
    setView('byTag')
    setLoading(true)
    const res = await fetch(`/api/links?tag=${tag.id}`)
    const data = await res.json()
    setLinks(data.links)
    setLoading(false)
  }, [])

  // Back to chronological
  const handleBackToList = () => {
    setView('chronological')
    setSearchResults([])
    setSimilarSource(null)
    setSearchQuery('')
    setSelectedTag(null)
    loadLinks()
  }

  const displayLinks = view === 'chronological' || view === 'byTag' ? links : searchResults

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>🔗 LinkWorld</h1>
          <p style={{ color: '#666', fontSize: 14 }}>
            {total} links saved · semantic bookmark manager
          </p>
        </div>
        <button
          onClick={handleShowTags}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #333',
            background: view === 'tags' ? '#333' : 'transparent',
            color: '#888',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          🏷️ Tags
        </button>
      </div>

      {/* Search bar */}
      {view !== 'tags' && (
        <div style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Search by meaning..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #333',
              background: '#1a1a1a',
              color: '#e0e0e0',
              fontSize: 15,
              outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: searching || !searchQuery.trim() ? 0.5 : 1,
            }}
          >
            {searching ? '...' : 'Search'}
          </button>
        </div>
      )}

      {/* View indicator */}
      {view !== 'chronological' && view !== 'tags' && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: '#1a1a1a',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: '#888', fontSize: 14 }}>
            {view === 'search' && `Search results for "${searchQuery}"`}
            {view === 'similar' && `Similar to: ${similarSource?.title}`}
            {view === 'byTag' && `Tag: ${selectedTag?.name}`}
            {view !== 'byTag' && ` · ${searchResults.length} results`}
          </span>
          <button
            onClick={handleBackToList}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #333',
              background: 'transparent',
              color: '#888',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ← Back to list
          </button>
        </div>
      )}

      {/* Tags View */}
      {view === 'tags' ? (
        <TagsView
          tags={allTags}
          onRefresh={loadTags}
          onTagClick={handleFilterByTag}
          onBack={handleBackToList}
        />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>Loading...</div>
      ) : displayLinks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
          {view === 'chronological' ? 'No links yet. Send me some URLs!' : 'No results found'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayLinks.map(link => (
            <LinkCard
              key={link.id}
              link={link}
              onFindSimilar={() => handleFindSimilar(link)}
              onTagClick={handleFilterByTag}
              showSimilarity={view === 'search' || view === 'similar'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LinkCard({
  link,
  onFindSimilar,
  onTagClick,
  showSimilarity,
}: {
  link: Link
  onFindSimilar: () => void
  onTagClick: (tag: Tag) => void
  showSimilarity: boolean
}) {
  const displayTitle = link.og_title || link.title
  const domain = new URL(link.url).hostname.replace('www.', '')

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: '1px solid #222',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        gap: 12,
      }}
    >
      {/* OG Image thumbnail */}
      {link.og_image && (
        <div style={{ flexShrink: 0 }}>
          <img
            src={link.og_image}
            alt=""
            style={{
              width: 80,
              height: 60,
              objectFit: 'cover',
              borderRadius: 6,
              background: '#222',
            }}
            onError={e => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#e0e0e0',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 15,
            display: 'block',
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayTitle}
        </a>

        {link.og_description && (
          <p style={{
            color: '#888',
            fontSize: 13,
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {link.og_description}
          </p>
        )}

        {/* Tags */}
        {link.tags && link.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {link.tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => onTagClick(tag)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: 'none',
                  background: '#2a2a2a',
                  color: '#888',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
          <span style={{ color: '#555' }}>{domain}</span>
          <span style={{ color: '#444' }}>·</span>
          <span style={{ color: '#555' }}>
            {new Date(link.created_at).toLocaleDateString()}
          </span>
          {showSimilarity && link.similarity !== undefined && (
            <>
              <span style={{ color: '#444' }}>·</span>
              <span style={{ color: '#3b82f6' }}>
                {(link.similarity * 100).toFixed(0)}% match
              </span>
            </>
          )}
        </div>
      </div>

      {/* Find similar button */}
      <button
        onClick={onFindSimilar}
        title="Find similar"
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 8,
          border: '1px solid #333',
          background: 'transparent',
          color: '#666',
          fontSize: 16,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🔍
      </button>
    </div>
  )
}

function TagsView({
  tags,
  onRefresh,
  onTagClick,
  onBack,
}: {
  tags: Tag[]
  onRefresh: () => void
  onTagClick: (tag: Tag) => void
  onBack: () => void
}) {
  const [mergeSource, setMergeSource] = useState<Tag | null>(null)

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Delete tag "${tag.name}"?`)) return
    await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
    onRefresh()
  }

  const handleMerge = async (target: Tag) => {
    if (!mergeSource || mergeSource.id === target.id) return
    if (!confirm(`Merge "${mergeSource.name}" into "${target.name}"?`)) return
    await fetch('/api/tags/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: mergeSource.id, targetId: target.id })
    })
    setMergeSource(null)
    onRefresh()
  }

  return (
    <div>
      <div style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: '#1a1a1a',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: '#888', fontSize: 14 }}>
          {tags.length} tags
          {mergeSource && (
            <span style={{ color: '#f59e0b', marginLeft: 12 }}>
              Merging "{mergeSource.name}" → click target tag
              <button
                onClick={() => setMergeSource(null)}
                style={{
                  marginLeft: 8,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: 'none',
                  background: '#333',
                  color: '#888',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </span>
          )}
        </span>
        <button
          onClick={onBack}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #333',
            background: 'transparent',
            color: '#888',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ← Back to links
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map(tag => (
          <div
            key={tag.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: mergeSource?.id === tag.id ? '#3b82f6' : '#1a1a1a',
              border: '1px solid #333',
            }}
          >
            <button
              onClick={() => mergeSource ? handleMerge(tag) : onTagClick(tag)}
              style={{
                background: 'none',
                border: 'none',
                color: '#e0e0e0',
                fontSize: 14,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {tag.name}
            </button>
            <span style={{ color: '#555', fontSize: 12 }}>
              {tag.count}
            </span>
            <button
              onClick={() => setMergeSource(tag)}
              title="Merge into another tag"
              style={{
                background: 'none',
                border: 'none',
                color: '#555',
                fontSize: 12,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ⎇
            </button>
            <button
              onClick={() => handleDelete(tag)}
              title="Delete tag"
              style={{
                background: 'none',
                border: 'none',
                color: '#555',
                fontSize: 12,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
