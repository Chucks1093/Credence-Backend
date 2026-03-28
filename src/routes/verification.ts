import type { Router } from 'express'
import { verificationService } from '../services/verificationService'

/**
 * Setup verification routes
 */
export function setupVerificationRoutes(app: any): void {
  /**
   * GET /api/verification/:address
   * Returns a verification proof package for the given address
   *
   * Query params:
   * - sign: boolean (default: false) - whether to sign the proof
   * - expiry: number (optional) - expiry time in minutes
   *
   * Response: VerificationProof | SignedVerificationProof
   */
  app.get('/api/verification/:address', (req: any, res: any) => {
    const { address } = req.params
    const { sign, expiry } = req.query

    // Placeholder data - in production, fetch from DB / reputation engine
    const score = 0
    const bondSnapshot = {
      address,
      bondedAmount: '0',
      bondStart: null,
      bondDuration: null,
      active: false,
    }
    const attestationCount = 0

    try {
      const expiryMinutes = expiry ? parseInt(expiry, 10) : undefined

      let proof = verificationService.createProof(
        address,
        score,
        bondSnapshot,
        attestationCount,
        expiryMinutes
      )

      if (sign === 'true') {
        // In production, load from secure environment
        const privateKey = process.env.VERIFICATION_PRIVATE_KEY
        if (!privateKey) {
          return res.status(500).json({ error: 'Signing key not configured' })
        }
        proof = verificationService.signProof(proof, privateKey)
      }

      res.json(proof)
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate verification proof' })
    }
  })

  /**
   * POST /api/verification/verify
   * Verify a proof package
   *
   * Body: { proof: VerificationProof | SignedVerificationProof, publicKey?: string }
   * Response: { valid: boolean, errors?: string[] }
   */
  app.post('/api/verification/verify', (req: any, res: any) => {
    const { proof, publicKey } = req.body

    if (!proof) {
      return res.status(400).json({ error: 'Missing proof in request body' })
    }

    const errors: string[] = []

    // Verify hash consistency
    if (!verificationService.verifyProofHash(proof)) {
      errors.push('Hash verification failed')
    }

    // Check expiry
    if (verificationService.isExpired(proof)) {
      errors.push('Proof has expired')
    }

    // Verify signature if present
    if ('signature' in proof && publicKey) {
      if (!verificationService.verifySignedProof(proof, publicKey)) {
        errors.push('Signature verification failed')
      }
    }

    res.json({
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    })
  })
}
