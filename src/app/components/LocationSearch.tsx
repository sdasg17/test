import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Input } from './ui/input';

export interface SearchBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface LocationSearchProps {
  onLocationSelect: (
    lat: number,
    lon: number,
    displayName: string,
    bounds: SearchBounds
  ) => void;
}

// Default box around a point when the place has no usable extent,
// roughly 30 km across at mid latitudes.
const DEFAULT_HALF_LAT = 0.14;
const DEFAULT_HALF_LON = 0.22;

// Cap on a searched extent, so a search for a whole country does not
// price the entire country off one index point.
const MAX_SPAN_DEG = 0.8;

function boxAround(lat: number, lon: number): SearchBounds {
  return {
    north: lat + DEFAULT_HALF_LAT,
    south: lat - DEFAULT_HALF_LAT,
    east: lon + DEFAULT_HALF_LON,
    west: lon - DEFAULT_HALF_LON,
  };
}

function boundsFromResult(result: any, lat: number, lon: number): SearchBounds {
  const bb = result?.boundingbox;
  if (Array.isArray(bb) && bb.length === 4) {
    const [s, n, w, e] = bb.map(Number);
    if ([s, n, w, e].every(isFinite) && n > s && e > w) {
      if (n - s <= MAX_SPAN_DEG && e - w <= MAX_SPAN_DEG && n - s > 0.02 && e - w > 0.02) {
        return { north: n, south: s, east: e, west: w };
      }
    }
  }
  return boxAround(lat, lon);
}

export const LocationSearch: React.FC<LocationSearchProps> = ({ onLocationSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = async (query: string) => {
    if (!query.trim()) return;

    // Handle coordinate input immediately
    const coordMatch = query.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        onLocationSelect(lat, lon, `${lat.toFixed(3)}, ${lon.toFixed(3)}`, boxAround(lat, lon));
        setShowResults(false);
        setSearchQuery('');
        return;
      }
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsSearching(true);
    setShowResults(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=en`,
        { signal: abortRef.current.signal }
      );
      const data = await response.json();
      setSearchResults(data);
      setShowResults(true);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Search error:', error);
        setSearchResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced auto-search as user types
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(searchQuery);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      runSearch(searchQuery);
    }
    if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const handleSelectResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    onLocationSelect(lat, lon, result.display_name, boundsFromResult(result, lat, lon));
    setShowResults(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search a city, or enter lat, lon"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
            className="pl-10 h-9 text-sm"
            style={{ background: 'var(--void)', borderColor: 'var(--rule-strong)', color: 'var(--ink)', paddingLeft: 34 }}
          />
        </div>
        <button onClick={() => runSearch(searchQuery)} disabled={isSearching} className="btn-solid px-4 h-9 inline-flex items-center gap-2">
          {isSearching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            'Search'
          )}
        </button>
      </div>

      {showResults && searchResults.length > 0 && (
        <div className="panel absolute mt-2 w-full max-h-80 overflow-y-auto z-10">
          <div className="p-2">
            {searchResults.map((result, index) => (
              <button
                key={index}
                onMouseDown={() => handleSelectResult(result)}
                className="w-full text-left p-3 rounded-sm transition-colors flex items-start gap-2 hover:bg-[rgba(238,241,242,0.06)]"
              >
                <MapPin className="size-4 mt-1 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm">{result.display_name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showResults && isSearching && (
        <div className="panel absolute mt-2 w-full z-10">
          <div className="p-4 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Searching...
          </div>
        </div>
      )}
    </div>
  );
};
