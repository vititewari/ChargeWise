import { ConfigService } from '@nestjs/config'
import { OneMapService } from './onemap.service'

const mockConfigService = {
  get: (key: string) => {
    if (key === 'ONEMAP_TOKEN') return 'test-token'
    if (key === 'ONEMAP_BASE_URL') return 'https://www.onemap.gov.sg'
    return undefined
  },
} as unknown as ConfigService

describe('OneMapService - Address Search', () => {
  let service: OneMapService

  beforeEach(() => {
    service = new OneMapService(mockConfigService)
  })

  describe('searchAddresses', () => {
    it('should return empty array for empty query', async () => {
      const result = await service.searchAddresses('')
      expect(result).toEqual([])
    })

    it('should return empty array if service is not configured', async () => {
      const notConfiguredService = new OneMapService({
        get: () => undefined,
      } as unknown as ConfigService)

      const result = await notConfiguredService.searchAddresses('Marina Bay')
      expect(result).toEqual([])
    })

    it('should return array of locations with coordinates', async () => {
      const mockResponse = {
        found: 2,
        results: [
          {
            LATITUDE: '1.28',
            LONGITUDE: '103.85',
            SEARCHVAL: 'Marina Bay, Singapore',
            ADDRESS: 'Marina Bay Sands',
          },
          {
            LATITUDE: '1.30',
            LONGITUDE: '103.87',
            SEARCHVAL: 'Marina Bay Link, Singapore',
            ADDRESS: 'Marina Bay Link Park',
          },
        ],
      }

      // Mock the fetch call
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      ) as jest.Mock

      const results = await service.searchAddresses('Marina Bay')

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({
        latitude: 1.28,
        longitude: 103.85,
        label: 'Marina Bay, Singapore',
      })
      expect(results[1]).toEqual({
        latitude: 1.30,
        longitude: 103.87,
        label: 'Marina Bay Link, Singapore',
      })
    })

    it('should filter out results with invalid coordinates', async () => {
      const mockResponse = {
        found: 3,
        results: [
          {
            LATITUDE: '1.28',
            LONGITUDE: '103.85',
            SEARCHVAL: 'Valid Location',
            ADDRESS: 'Some Address',
          },
          {
            LATITUDE: 'invalid',
            LONGITUDE: '103.87',
            SEARCHVAL: 'Invalid Latitude',
            ADDRESS: 'Bad Address',
          },
          {
            LATITUDE: '1.30',
            LONGITUDE: 'invalid',
            SEARCHVAL: 'Invalid Longitude',
            ADDRESS: 'Another Bad Address',
          },
        ],
      }

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      ) as jest.Mock

      const results = await service.searchAddresses('test')

      expect(results).toHaveLength(1)
      expect(results[0].label).toBe('Valid Location')
    })

    it('should return empty array on API error', async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error')),
      ) as jest.Mock

      const results = await service.searchAddresses('Marina Bay')

      expect(results).toEqual([])
    })

    it('should handle LONGTITUDE spelling variant', async () => {
      const mockResponse = {
        found: 1,
        results: [
          {
            LATITUDE: '1.28',
            LONGTITUDE: '103.85',
            SEARCHVAL: 'Location with typo',
            ADDRESS: 'Some Address',
          },
        ],
      }

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      ) as jest.Mock

      const results = await service.searchAddresses('location')

      expect(results).toHaveLength(1)
      expect(results[0].longitude).toBe(103.85)
    })

    it('should return up to 8 results (MAX_SUGGESTIONS)', async () => {
      const mockResults = Array.from({ length: 15 }, (_, i) => ({
        LATITUDE: String(1.0 + i * 0.01),
        LONGITUDE: String(103.0 + i * 0.01),
        SEARCHVAL: `Location ${i + 1}`,
        ADDRESS: `Address ${i + 1}`,
      }))

      const mockResponse = {
        found: 15,
        results: mockResults,
      }

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      ) as jest.Mock

      const results = await service.searchAddresses('location')

      // searchAddresses returns all results, frontend slices to 8
      expect(results.length).toBeGreaterThan(8)
    })

    it('should use the query as fallback label if ADDRESS and SEARCHVAL are missing', async () => {
      const mockResponse = {
        found: 1,
        results: [
          {
            LATITUDE: '1.28',
            LONGITUDE: '103.85',
          },
        ],
      }

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      ) as jest.Mock

      const results = await service.searchAddresses('my query')

      expect(results[0].label).toBe('my query')
    })

    it('should trim and lowercase the query for caching', async () => {
      const mockResponse = {
        found: 1,
        results: [
          {
            LATITUDE: '1.28',
            LONGITUDE: '103.85',
            SEARCHVAL: 'Marina Bay',
          },
        ],
      }

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      ) as jest.Mock

      // First call
      const results1 = await service.searchAddresses('  Marina Bay  ')
      expect(results1).toHaveLength(1)

      // Clear fetch mock to verify it's cached
      global.fetch = jest.fn() as jest.Mock

      // Second call with different whitespace but same content
      const results2 = await service.searchAddresses('Marina Bay')

      // Should return cached result without calling fetch again
      expect(global.fetch).not.toHaveBeenCalled()
      expect(results2).toEqual(results1)
    })
  })
})
