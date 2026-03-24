import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

vi.mock('../services/health/probes.js', async (importOriginal) => {
  const mod = await importOriginal<any>()
  return { ...mod, createDefaultProbes: () => ({}) }
})

import app from '../app.js'

const validAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

describe('API Endpoints', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health')
      expect(response.status).toBe(200)
      expect(response.body.status).toBe('ok')
      expect(response.body.service).toBe('credence-backend')
    })
  })

  describe('GET /api/trust/:address', () => {
    it('should return trust score for a known address', async () => {
      const response = await request(app).get(`/api/trust/${validAddress}`)
      expect(response.status).toBe(200)
      expect(response.body.address).toBe(validAddress)
      expect(response.body).toHaveProperty('score')
    })

    it('should return 400 for an invalid address', async () => {
      const response = await request(app).get('/api/trust/not-an-address')
      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })

    it('should return 404 for a valid unknown address', async () => {
      const response = await request(app).get(
        '/api/trust/0x1234567890123456789012345678901234567890',
      )
      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty('error')
    })
  })

  describe('GET /api/bond/:address', () => {
    it('should return bond status for a valid address', async () => {
      const response = await request(app).get(`/api/bond/${validAddress}`)
      expect(response.status).toBe(200)
      expect(response.body.address).toBe(validAddress)
      expect(response.body).toHaveProperty('active')
    })

    it('should return 400 for an invalid address', async () => {
      const response = await request(app).get('/api/bond/not-an-address')
      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })
  })

  describe('POST /api/bulk/verify', () => {
    it('should handle valid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/bulk/verify')
        .set('X-API-Key', 'test-enterprise-key-12345')
        .set('Content-Type', 'application/json')
        .send({ addresses: [validAddress] })
      expect(response.status).toBe(200)
    })
  })
})
