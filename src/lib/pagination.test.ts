import { describe, expect, it } from 'vitest'

import {
  buildPaginationMeta,
  PaginationValidationError,
  parsePaginationParams,
} from './pagination.js'

describe('pagination helpers', () => {
  describe('parsePaginationParams', () => {
    it('returns default page, limit, and offset when the query is empty', () => {
      expect(parsePaginationParams({})).toEqual({ page: 1, limit: 20, offset: 0 })
    })

    it('parses explicit page and limit values', () => {
      expect(parsePaginationParams({ page: '3', limit: '10' })).toEqual({
        page: 3,
        limit: 10,
        offset: 20,
      })
    })

    it('derives page from offset for backward-compatible callers', () => {
      expect(parsePaginationParams({ limit: '10', offset: '20' })).toEqual({
        page: 3,
        limit: 10,
        offset: 20,
      })
    })

    it('supports cursor as an offset alias', () => {
      expect(parsePaginationParams({ limit: '5', cursor: '10' })).toEqual({
        page: 3,
        limit: 5,
        offset: 10,
      })
    })

    it('uses a custom default limit when provided', () => {
      expect(parsePaginationParams({}, { defaultLimit: 50 })).toEqual({
        page: 1,
        limit: 50,
        offset: 0,
      })
    })

    it('throws for values above the hard max limit', () => {
      expect(() => parsePaginationParams({ limit: '101' })).toThrow(PaginationValidationError)
    })

    it('throws for non-integer values', () => {
      expect(() => parsePaginationParams({ page: '1.5' })).toThrow(PaginationValidationError)
    })

    it('throws for negative values', () => {
      expect(() => parsePaginationParams({ offset: '-1' })).toThrow(PaginationValidationError)
    })
  })

  describe('buildPaginationMeta', () => {
    it('returns hasNext=false when the page exhausts the collection', () => {
      expect(buildPaginationMeta(20, 2, 10)).toEqual({
        page: 2,
        limit: 10,
        total: 20,
        hasNext: false,
      })
    })

    it('returns hasNext=true when more results remain', () => {
      expect(buildPaginationMeta(21, 2, 10)).toEqual({
        page: 2,
        limit: 10,
        total: 21,
        hasNext: true,
      })
    })
  })
})
