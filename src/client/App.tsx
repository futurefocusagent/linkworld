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

// Monochrome color palette
const colors = {
  bg: '#0a0a0a',
  card: '#111',
  border: '#222',
  text: '#999',
  textMuted: '#555',
  textBright: '#ccc',
  accent: '#666',
}

// Parse URL params on load
function getInitialState() {
  const params = new URLSearchParams(window.location.search)
  const q = params.get('q')
  const tag = params.get('tag')
  const similar = params.get('similar')
  
  if (q) return { view: 'search' as View, searchQuery: q }
  if (tag) return { view: 'byTag' as View, tagName: tag }
  if (similar) return { view: 'similar' as View, similarId: parseInt(similar, 10) }
  return { view: 'chronological' as View }
}

export default function App() {
  const initialState = getInitialState()
  const [links, setLinks] = useState<Link[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>(initialState.view)
  const [searchQuery, setSearchQuery] = useState('searchQuery' in initialState ? initialState.searchQuery : '')
  const [searchResults, setSearchResults] = useState<Link[]>([])
  const [searching, setSearching] = useState(false)
  const [similarSource, setSimilarSource] = useState<Link | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)
  const [tagSimilar, setTagSimilar] = useState<Link[]>([])
  const [initialized, setInitialized] = useState(false)

  const loadLinks = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    const res = await fetch('/api/links')
    const data = await res.json()
    setLinks(data.links)
    setTotal(data.total)
    if (!background) setLoading(false)
  }, [])

  useEffect(() => {
    loadLinks()
  }, [loadLinks])

  // Handle initial URL state
  useEffect(() => {
    if (initialized) return
    setInitialized(true)
    
    const initial = getInitialState()
    if ('searchQuery' in initial && initial.searchQuery) {
      // Run initial search
      setSearching(true)
      fetch(`/api/search?q=${encodeURIComponent(initial.searchQuery)}`)
        .then(res => res.json())
        .then(data => {
          setSearchResults(data.results)
          setSearching(false)
        })
    } else if ('tagName' in initial && initial.tagName) {
      // Load tag by name
      fetch('/api/tags')
        .then(res => res.json())
        .then(data => {
          const tag = data.tags.find((t: Tag) => t.name.toLowerCase() === initial.tagName?.toLowerCase())
          if (tag) {
            setSelectedTag(tag)
            return fetch(`/api/tags/${tag.id}`)
          }
        })
        .then(res => res?.json())
        .then(data => {
          if (data) {
            setLinks(data.exact || [])
            setTagSimilar(data.similar || [])
            setLoading(false)
          }
        })
    } else if ('similarId' in initial && initial.similarId) {
      // Load similar to link
      fetch(`/api/links/${initial.similarId}`)
        .then(res => res.json())
        .then(link => {
          setSimilarSource(link)
          return fetch(`/api/links/${initial.similarId}/similar`)
        })
        .then(res => res.json())
        .then(data => {
          setSearchResults(data.similar)
          setSearching(false)
        })
    }
  }, [initialized])

  // Reload on tab focus (background, no flash)
  useEffect(() => {
    const handleFocus = () => {
      if (view === 'chronological') {
        loadLinks(true)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadLinks, view])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setView('search')
    // Update URL
    window.history.pushState({}, '', `?q=${encodeURIComponent(searchQuery)}`)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.results)
    } catch (err) {
      console.error(err)
    }
    setSearching(false)
  }, [searchQuery])

  const handleFindSimilar = useCallback(async (link: Link) => {
    setSearching(true)
    setView('similar')
    setSimilarSource(link)
    // Update URL
    window.history.pushState({}, '', `?similar=${link.id}`)
    try {
      const res = await fetch(`/api/links/${link.id}/similar`)
      const data = await res.json()
      setSearchResults(data.similar)
    } catch (err) {
      console.error(err)
    }
    setSearching(false)
  }, [])

  const loadTags = useCallback(async () => {
    const res = await fetch('/api/tags')
    const data = await res.json()
    setAllTags(data.tags)
  }, [])

  const handleShowTags = useCallback(async () => {
    setView('tags')
    await loadTags()
  }, [loadTags])

  const handleFilterByTag = useCallback(async (tag: Tag) => {
    setSelectedTag(tag)
    setView('byTag')
    // Update URL
    window.history.pushState({}, '', `?tag=${encodeURIComponent(tag.name)}`)
    setLoading(true)
    const res = await fetch(`/api/tags/${tag.id}`)
    const data = await res.json()
    setLinks(data.exact || [])
    setTagSimilar(data.similar || [])
    setLoading(false)
  }, [])

  const handleBackToList = () => {
    setView('chronological')
    setSearchResults([])
    setSimilarSource(null)
    setSearchQuery('')
    setSelectedTag(null)
    setTagSimilar([])
    // Clear URL params
    window.history.pushState({}, '', window.location.pathname)
    loadLinks()
  }

  const displayLinks = view === 'chronological' || view === 'byTag' ? links : searchResults

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1
            onClick={handleBackToList}
            style={{
              fontSize: 20,
              fontWeight: 400,
              marginBottom: 4,
              color: colors.textBright,
              letterSpacing: '0.05em',
              cursor: 'pointer',
            }}
          >
            LINKWORLD
          </h1>
          <p style={{ color: colors.textMuted, fontSize: 12, letterSpacing: '0.02em' }}>
            {total} links · semantic bookmarks
          </p>
        </div>
        <button
          onClick={handleShowTags}
          style={{
            padding: '8px 16px',
            borderRadius: 0,
            border: `1px solid ${colors.border}`,
            background: view === 'tags' ? colors.border : 'transparent',
            color: colors.text,
            fontSize: 12,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          TAGS
        </button>
      </div>

      {/* Search bar */}
      {view !== 'tags' && (
        <div style={{ marginBottom: 32, display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1,
              padding: '14px 16px',
              borderRadius: 0,
              border: `1px solid ${colors.border}`,
              background: colors.card,
              color: colors.textBright,
              fontSize: 13,
              outline: 'none',
              letterSpacing: '0.02em',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            style={{
              padding: '14px 24px',
              borderRadius: 0,
              border: `1px solid ${colors.border}`,
              background: colors.border,
              color: colors.textBright,
              fontSize: 12,
              cursor: searching || !searchQuery.trim() ? 'default' : 'pointer',
              opacity: searching || !searchQuery.trim() ? 0.4 : 1,
              letterSpacing: '0.05em',
            }}
          >
            {searching ? '...' : 'SEARCH'}
          </button>
        </div>
      )}

      {/* View indicator */}
      {view !== 'chronological' && view !== 'tags' && (
        <div style={{
          marginBottom: 24,
          padding: '12px 16px',
          background: colors.card,
          border: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: colors.textMuted, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {view === 'search' && `results for "${searchQuery}"`}
            {view === 'similar' && `similar to: ${similarSource?.title?.slice(0, 40)}...`}
            {view === 'byTag' && `tag: ${selectedTag?.name}`}
            {view !== 'byTag' && ` · ${searchResults.length}`}
          </span>
          <button
            onClick={handleBackToList}
            style={{
              padding: '6px 12px',
              borderRadius: 0,
              border: `1px solid ${colors.border}`,
              background: 'transparent',
              color: colors.textMuted,
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            ← BACK
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
        <div style={{ textAlign: 'center', padding: 80, color: colors.textMuted, fontSize: 12, letterSpacing: '0.1em' }}>
          LOADING...
        </div>
      ) : displayLinks.length === 0 && tagSimilar.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: colors.textMuted, fontSize: 12, letterSpacing: '0.05em' }}>
          {view === 'chronological' ? 'NO LINKS YET' : 'NO RESULTS'}
        </div>
      ) : (
        <>
          {view === 'byTag' && displayLinks.length > 0 && (
            <h3 style={{ color: colors.textMuted, fontSize: 10, marginBottom: 16, letterSpacing: '0.1em' }}>
              TAGGED "{selectedTag?.name?.toUpperCase()}" ({displayLinks.length})
            </h3>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {displayLinks.map((link, idx) => (
              <LinkCard
                key={link.id}
                link={link}
                onFindSimilar={() => handleFindSimilar(link)}
                onTagClick={handleFilterByTag}
                showSimilarity={view === 'search' || view === 'similar'}
                isFirst={idx === 0}
              />
            ))}
          </div>
          
          {view === 'byTag' && tagSimilar.length > 0 && (
            <>
              <h3 style={{ color: colors.textMuted, fontSize: 10, margin: '32px 0 16px', letterSpacing: '0.1em' }}>
                SEMANTICALLY SIMILAR ({tagSimilar.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {tagSimilar.map((link, idx) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    onFindSimilar={() => handleFindSimilar(link)}
                    onTagClick={handleFilterByTag}
                    showSimilarity={true}
                    isFirst={idx === 0}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function LinkCard({
  link,
  onFindSimilar,
  onTagClick,
  showSimilarity,
  isFirst = false,
}: {
  link: Link
  onFindSimilar: () => void
  onTagClick: (tag: Tag) => void
  showSimilarity: boolean
  isFirst?: boolean
}) {
  const displayTitle = link.og_title || link.title
  const domain = new URL(link.url).hostname.replace('www.', '')

  return (
    <div
      style={{
        background: colors.card,
        borderLeft: `1px solid ${colors.border}`,
        borderRight: `1px solid ${colors.border}`,
        borderBottom: `1px solid ${colors.border}`,
        borderTop: isFirst ? `1px solid ${colors.border}` : 'none',
        padding: 20,
        display: 'flex',
        gap: 20,
      }}
    >
      {/* Large image */}
      {link.og_image && (
        <div style={{ flexShrink: 0 }}>
          <img
            src={link.og_image}
            alt=""
            style={{
              width: 160,
              height: 120,
              objectFit: 'cover',
              background: '#000',
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
            color: colors.textBright,
            textDecoration: 'none',
            fontWeight: 400,
            fontSize: 14,
            display: 'block',
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          {displayTitle}
        </a>

        {link.og_description && (
          <p style={{
            color: colors.textMuted,
            fontSize: 12,
            marginBottom: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.5,
          }}>
            {link.og_description}
          </p>
        )}

        {/* Tags */}
        {link.tags && link.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {link.tags.map(tag => {
              const isAt = tag.name.startsWith('@')
              return (
              <button
                key={tag.id}
                onClick={() => onTagClick(tag)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 0,
                  border: `1px solid ${isAt ? '#6b3a00' : colors.border}`,
                  background: isAt ? '#1a0e00' : 'transparent',
                  color: isAt ? '#e07020' : colors.textMuted,
                  fontSize: 10,
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                }}
              >
                {tag.name}
              </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 10, letterSpacing: '0.02em' }}>
          <span style={{ color: colors.textMuted }}>{domain}</span>
          <span style={{ color: colors.border }}>·</span>
          <span style={{ color: colors.textMuted }}>
            {new Date(link.created_at).toLocaleDateString()}
          </span>
          {showSimilarity && link.similarity !== undefined && (
            <>
              <span style={{ color: colors.border }}>·</span>
              <span style={{ color: colors.text }}>
                {(link.similarity * 100).toFixed(0)}%
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
          width: 40,
          height: 40,
          borderRadius: 0,
          border: `1px solid ${colors.border}`,
          background: 'transparent',
          color: colors.textMuted,
          fontSize: 14,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⌕
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
        marginBottom: 24,
        padding: '12px 16px',
        background: colors.card,
        border: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: colors.textMuted, fontSize: 11, letterSpacing: '0.05em' }}>
          {tags.length} TAGS
          {mergeSource && (
            <span style={{ color: colors.text, marginLeft: 16 }}>
              MERGING "{mergeSource.name}" → CLICK TARGET
              <button
                onClick={() => setMergeSource(null)}
                style={{
                  marginLeft: 12,
                  padding: '2px 8px',
                  borderRadius: 0,
                  border: `1px solid ${colors.border}`,
                  background: 'transparent',
                  color: colors.textMuted,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
            </span>
          )}
        </span>
        <button
          onClick={onBack}
          style={{
            padding: '6px 12px',
            borderRadius: 0,
            border: `1px solid ${colors.border}`,
            background: 'transparent',
            color: colors.textMuted,
            fontSize: 11,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          ← BACK
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map(tag => {
          const isAt = tag.name.startsWith('@')
          return (
          <div
            key={tag.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: mergeSource?.id === tag.id ? colors.border : (isAt ? '#1a0e00' : colors.card),
              border: `1px solid ${isAt ? '#6b3a00' : colors.border}`,
            }}
          >
            <button
              onClick={() => mergeSource ? handleMerge(tag) : onTagClick(tag)}
              style={{
                background: 'none',
                border: 'none',
                color: isAt ? '#e07020' : colors.textBright,
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {tag.name}
            </button>
            <span style={{ color: colors.textMuted, fontSize: 11 }}>
              {tag.count}
            </span>
            <button
              onClick={() => setMergeSource(tag)}
              title="Merge into another tag"
              style={{
                background: 'none',
                border: 'none',
                color: colors.textMuted,
                fontSize: 11,
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
                color: colors.textMuted,
                fontSize: 11,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
          )
        })}
      </div>
    </div>
  )
}
