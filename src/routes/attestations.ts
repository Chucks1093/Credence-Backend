/**
 * @module routes/attestations
 * @description Express routes for the Credence attestation public API.
 *
 * | Method | Path                                    | Description                         |
 * |--------|-----------------------------------------|-------------------------------------|
 * | GET    | `/api/attestations/:identity/count`     | Attestation count for an identity   |
 * | GET    | `/api/attestations/:identity`           | Paginated attestation list          |
 * | POST   | `/api/attestations`                     | Create a new attestation            |
 * | DELETE | `/api/attestations/:id`                 | Revoke an attestation               |
 */

import { Router, type Request, type Response } from 'express';

import {
  buildPaginationMeta,
  PaginationValidationError,
  parsePaginationParams,
} from '../lib/pagination.js';
import { AttestationRepository } from '../repositories/attestationRepository.js';
import type {
  AttestationCountResponse,
  AttestationListResponse,
} from '../types/attestation.js';

/**
 * Create and return an Express {@link Router} wired to the given
 * {@link AttestationRepository}.
 *
 * @param repo - The repository instance to delegate to.
 * @returns Configured Express router.
 */
export function createAttestationRouter(repo: AttestationRepository): Router {
  const router = Router();

  // ── GET /api/attestations/:identity/count ────────────────────────────

  /**
   * Return the attestation count for a given identity.
   *
   * Query params:
   * - `includeRevoked` (`true`/`false`, default `false`)
   */
  router.get('/:identity/count', (req: Request, res: Response): void => {
    const { identity } = req.params;
    const includeRevoked = req.query.includeRevoked === 'true';

    const count = repo.countBySubject(identity, includeRevoked);

    const body: AttestationCountResponse = {
      identity,
      count,
      includeRevoked,
    };

    res.json(body);
  });

  // ── GET /api/attestations/:identity ──────────────────────────────────

  /**
   * Return a paginated list of attestations for an identity.
   *
   * Query params:
   * - `page`           (number, default 1)
   * - `limit`          (number, default 20, max 100)
   * - `includeRevoked` (`true`/`false`, default `false`)
   *
   * Each attestation in the response includes `verifier` and `weight`.
   * Revoked attestations are excluded by default; set `includeRevoked=true`
   * to include them (they will have a non-null `revokedAt` field).
   */
  router.get('/:identity', (req: Request, res: Response): void => {
    const { identity } = req.params;
    const includeRevoked = req.query.includeRevoked === 'true';

    let pagination;
    try {
      pagination = parsePaginationParams(req.query as Record<string, unknown>);
    } catch (error) {
      if (error instanceof PaginationValidationError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.details,
        });
        return;
      }
      throw error;
    }

    const { page, limit } = pagination;

    const { attestations, total } = repo.findBySubject(identity, {
      includeRevoked,
      page,
      limit,
    });
    const paginationMeta = buildPaginationMeta(total, page, limit);

    const body: AttestationListResponse = {
      identity,
      attestations,
      ...paginationMeta,
    };

    res.json(body);
  });

  // ── POST /api/attestations ───────────────────────────────────────────

  /**
   * Create a new attestation.
   *
   * Body: `{ subject, verifier, weight, claim }`
   */
  router.post('/', (req: Request, res: Response): void => {
    try {
      const { subject, verifier, weight, claim } = req.body as {
        subject: string;
        verifier: string;
        weight: number;
        claim: string;
      };

      const attestation = repo.create({ subject, verifier, weight, claim });
      res.status(201).json(attestation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  // ── DELETE /api/attestations/:id ─────────────────────────────────────

  /**
   * Revoke an attestation by its ID.
   */
  router.delete('/:id', (req: Request, res: Response): void => {
    try {
      const result = repo.revoke(req.params.id);
      if (!result) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(409).json({ error: message });
    }
  });

  return router;
}
