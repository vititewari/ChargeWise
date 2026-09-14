import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionIcon, TextInput, Paper, Stack, Text } from '@mantine/core'
import type { TextInputProps } from '@mantine/core'
import type { LocationInput } from '../types'
import { api } from '../api'

interface LocationInputComponentProps extends Omit<TextInputProps, 'value' | 'onChange'> {
  value: string
  onChange: (text: string, coords: { latitude: number; longitude: number } | null) => void
  onMyLocationClick?: () => void
  myLocationIcon?: React.ReactNode
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3
const MAX_SUGGESTIONS = 8

export function LocationInput({
  value,
  onChange,
  onMyLocationClick,
  myLocationIcon,
  ...props
}: LocationInputComponentProps) {
  const [suggestions, setSuggestions] = useState<LocationInput[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const results = await api.searchLocations(query)
      setSuggestions(results.slice(0, MAX_SUGGESTIONS))
      setShowSuggestions(true)
      setHighlightedIndex(-1)
    } catch (err) {
      setError('Address search unavailable')
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.currentTarget.value
    onChange(newValue, null)
    setHighlightedIndex(-1)

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    if (newValue.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    debounceTimeoutRef.current = setTimeout(() => {
      void fetchSuggestions(newValue)
    }, DEBOUNCE_MS)
  }

  const handleSelectSuggestion = (location: LocationInput) => {
    onChange(location.label || '', { latitude: location.latitude, longitude: location.longitude })
    setShowSuggestions(false)
    setSuggestions([])
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        event.preventDefault()
        if (highlightedIndex >= 0) {
          handleSelectSuggestion(suggestions[highlightedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        setShowSuggestions(false)
        break
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <TextInput
        ref={inputRef}
        {...props}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true)
        }}
        rightSection={
          myLocationIcon ? (
            <ActionIcon
              variant="subtle"
              onClick={onMyLocationClick}
              aria-label={typeof props.label === 'string' ? `Use current location for ${props.label}` : 'Use current location'}
            >
              {myLocationIcon}
            </ActionIcon>
          ) : undefined
        }
      />

      {error && (
        <Text size="xs" c="red" mt={4}>
          {error}
        </Text>
      )}

      {showSuggestions && (
        <Paper
          shadow="md"
          radius="md"
          p={0}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            marginTop: 4,
          }}
        >
          {loading ? (
            <Stack p="xs" gap={0}>
              <Text size="sm" c="dimmed">
                Searching…
              </Text>
            </Stack>
          ) : suggestions.length > 0 ? (
            <Stack p={0} gap={0}>
              {suggestions.map((location, index) => (
                <button
                  key={`${location.latitude}-${location.longitude}`}
                  onClick={() => handleSelectSuggestion(location)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    textAlign: 'left',
                    border: 'none',
                    background: index === highlightedIndex ? '#f0f0f0' : 'transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#17211d',
                  }}
                >
                  {location.label}
                </button>
              ))}
            </Stack>
          ) : (
            <Stack p="xs" gap={0}>
              <Text size="sm" c="dimmed">
                No locations found
              </Text>
            </Stack>
          )}
        </Paper>
      )}
    </div>
  )
}
