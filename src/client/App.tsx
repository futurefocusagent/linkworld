import { useEffect, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Link as RouterLink } from 'react-router-dom'
import MapPage from './MapPage'

interface Tag {
  id: number
  name: string
  count?: number
}

interface LinkItem {
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

function HomePage() {
  const initialState = getInitialState()
  const [links, setLinks] = useState<LinkItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>(initialState.view)
  const [searchQuery, setSearchQuery] = useState('searchQuery' in initialState ? initialState.searchQuery : '')
  const [searchResults, setSearchResults] = useState<LinkItem[]>([])
  const [searching, setSearching] = useState(false)
  const [similarSource, setSimilarSource] = useState<LinkItem | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)
  const [tagSimilar, setTagSimilar] = useState<LinkItem[]>([])
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

  useEffect(() => {
    if (initialized) return
    setInitialized(true)
    
    const initial = getInitialState()
    if ('searchQuery' in initial && initial.searchQuery) {
      setSearching(true)
      fetch(`/api/search?q=${encodeURIComponent(initial.searchQuery)}`)
        .then(res => res.json())
        .then(data => {
          setSearchResults(data.results)
          setSearching(false)
        })
    } else if ('tagName' in initial && initial.tagName) {
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

  useEffect(() => {
    const handleFocus = () => {
      if (view === 'chronological') loadLinks(true)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadLinks, view])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setView('search')
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

  const handleFindSimilar = useCallback(async (link: LinkItem) => {
    setSearching(true)
    setView('similar')
    setSimilarSource(link)
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
    window.history.pushState({}, '', window.location.pathname)
    loadLinks()
  }

  const displayLinks = view === 'chronological' || view === 'byTag' ? links : searchResults

  return (
    <div className="max-w-5xl mx-auto p-6 bg-zinc-950 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            onClick={handleBackToList}
            className="text-xl text-zinc-300 tracking-wider cursor-pointer hover:text-white"
          >
            LINKWORLD
          </h1>
          <p className="text-zinc-600 text-xs tracking-wide">
            {total} links · semantic bookmarks
          </p>
        </div>
        <div className="flex gap-2">
          <RouterLink
            to="/map"
            className="px-4 py-2 border border-zinc-800 text-zinc-400 text-xs tracking-wider hover:bg-zinc-800"
          >
            MAP
          </RouterLink>
          <button
            onClick={handleShowTags}
            className={`px-4 py-2 border border-zinc-800 text-zinc-400 text-xs tracking-wider ${view === 'tags' ? 'bg-zinc-800' : 'hover:bg-zinc-800'}`}
          >
            TAGS
          </button>
        </div>
      </div>

      {/* Search bar */}
      {view !== 'tags' && (
        <div className="mb-8 flex gap-2">
          <input
            type="text"
            placeholder="search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-4 py-3 border border-zinc-800 bg-zinc-900 text-zinc-300 text-sm outline-none focus:border-zinc-600"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-6 py-3 border border-zinc-800 bg-zinc-800 text-zinc-300 text-xs tracking-wider disabled:opacity-40"
          >
            {searching ? '...' : 'SEARCH'}
          </button>
        </div>
      )}

      {/* View indicator */}
      {view !== 'chronological' && view !== 'tags' && (
        <div className="mb-6 p-3 bg-zinc-900 border border-zinc-800 flex items-center justify-between">
          <span className="text-zinc-600 text-xs tracking-wider uppercase">
            {view === 'search' && `results for "${searchQuery}"`}
            {view === 'similar' && `similar to: ${similarSource?.title?.slice(0, 40)}...`}
            {view === 'byTag' && `tag: ${selectedTag?.name}`}
            {view !== 'byTag' && ` · ${searchResults.length}`}
          </span>
          <button
            onClick={handleBackToList}
            className="px-3 py-1 border border-zinc-800 text-zinc-600 text-xs tracking-wider hover:text-zinc-400"
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
        <div className="text-center py-20 text-zinc-600 text-xs tracking-widest">
          LOADING...
        </div>
      ) : displayLinks.length === 0 && tagSimilar.length === 0 ? (
        <div className="text-center py-20 text-zinc-600 text-xs tracking-wider">
          {view === 'chronological' ? 'NO LINKS YET' : 'NO RESULTS'}
        </div>
      ) : (
        <>
          {view === 'byTag' && displayLinks.length > 0 && (
            <h3 className="text-zinc-600 text-xs mb-4 tracking-widest">
              TAGGED "{selectedTag?.name?.toUpperCase()}" ({displayLinks.length})
            </h3>
          )}
          <div className="flex flex-col">
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
              <h3 className="text-zinc-600 text-xs mt-8 mb-4 tracking-widest">
                SEMANTICALLY SIMILAR ({tagSimilar.length})
              </h3>
              <div className="flex flex-col">
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
  link: LinkItem
  onFindSimilar: () => void
  onTagClick: (tag: Tag) => void
  showSimilarity: boolean
  isFirst?: boolean
}) {
  const displayTitle = link.og_title || link.title
  const domain = new URL(link.url).hostname.replace('www.', '')

  return (
    <div className={`bg-zinc-900 border-l border-r border-b border-zinc-800 ${isFirst ? 'border-t' : ''} p-5 flex gap-5`}>
      {link.og_image && (
        <div className="flex-shrink-0">
          <img
            src={link.og_image}
            alt=""
            className="w-40 h-28 object-cover bg-black"
            onError={e => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-300 text-sm block mb-2 leading-snug hover:text-white"
        >
          {displayTitle}
        </a>

        {link.og_description && (
          <p className="text-zinc-600 text-xs mb-3 line-clamp-2 leading-relaxed">
            {link.og_description}
          </p>
        )}

        {link.tags && link.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {link.tags.map(tag => {
              const isAt = tag.name.startsWith('@')
              const isHash = tag.name.startsWith('#')
              return (
                <button
                  key={tag.id}
                  onClick={() => onTagClick(tag)}
                  className={`px-2 py-0.5 text-xs border cursor-pointer ${
                    isAt 
                      ? 'border-orange-900 bg-orange-950 text-orange-500' 
                      : isHash 
                        ? 'border-blue-900 bg-blue-950 text-blue-400'
                        : 'border-zinc-800 text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <span>{domain}</span>
          <span className="text-zinc-800">·</span>
          <span>{new Date(link.created_at).toLocaleDateString()}</span>
          {showSimilarity && link.similarity !== undefined && (
            <>
              <span className="text-zinc-800">·</span>
              <span className="text-zinc-400">{(link.similarity * 100).toFixed(0)}%</span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={onFindSimilar}
        title="Find similar"
        className="flex-shrink-0 w-10 h-10 border border-zinc-800 text-zinc-600 text-sm flex items-center justify-center hover:text-zinc-400 hover:border-zinc-600"
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
      <div className="mb-6 p-3 bg-zinc-900 border border-zinc-800 flex items-center justify-between">
        <span className="text-zinc-600 text-xs tracking-wider">
          {tags.length} TAGS
          {mergeSource && (
            <span className="text-zinc-400 ml-4">
              MERGING "{mergeSource.name}" → CLICK TARGET
              <button
                onClick={() => setMergeSource(null)}
                className="ml-3 px-2 py-0.5 border border-zinc-800 text-zinc-600 text-xs hover:text-zinc-400"
              >
                CANCEL
              </button>
            </span>
          )}
        </span>
        <button
          onClick={onBack}
          className="px-3 py-1 border border-zinc-800 text-zinc-600 text-xs tracking-wider hover:text-zinc-400"
        >
          ← BACK
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map(tag => {
          const isAt = tag.name.startsWith('@')
          const isHash = tag.name.startsWith('#')
          return (
            <div
              key={tag.id}
              className={`flex items-center gap-2 px-3 py-2 border ${
                mergeSource?.id === tag.id 
                  ? 'bg-zinc-800 border-zinc-700' 
                  : isAt 
                    ? 'bg-orange-950 border-orange-900' 
                    : isHash 
                      ? 'bg-blue-950 border-blue-900'
                      : 'bg-zinc-900 border-zinc-800'
              }`}
            >
              <button
                onClick={() => mergeSource ? handleMerge(tag) : onTagClick(tag)}
                className={`text-xs ${isAt ? 'text-orange-500' : isHash ? 'text-blue-400' : 'text-zinc-300'}`}
              >
                {tag.name}
              </button>
              <span className="text-zinc-600 text-xs">{tag.count}</span>
              <button
                onClick={() => setMergeSource(tag)}
                title="Merge into another tag"
                className="text-zinc-600 text-xs px-1 hover:text-zinc-400"
              >
                ⎇
              </button>
              <button
                onClick={() => handleDelete(tag)}
                title="Delete tag"
                className="text-zinc-600 text-xs px-1 hover:text-zinc-400"
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/map" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  )
}
