/**
 * Horizon Bond Creation Listener
 * Listens for bond creation events from Stellar/Horizon and syncs identity/bond state to DB.
 * @module horizonBondEvents
 */

import { Server } from 'stellar-sdk';
import { upsertIdentity, upsertBond } from '../services/identityService';
import { ReplayService } from '../services/replayService.js';

const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon.stellar.org';
const server = new Server(HORIZON_URL);

/**
 * Subscribe to bond creation events from Horizon
 * @param {ReplayService} replayService Service to capture failures
 * @param {function} onEvent Callback for each bond creation event
 */
export function subscribeBondCreationEvents(replayService, onEvent) {
  // Example: Listen to operations of type 'create_bond' (custom event)
  let cursor = 'now';
  let stream;
  const startStream = () => {
    stream = server.operations()
      .forAsset('BOND') // Replace with actual asset code if needed
      .cursor(cursor)
      .stream({
        onmessage: async (op) => {
          cursor = op.paging_token;
          if (op.type === 'create_bond') {
            try {
              const event = parseBondEvent(op);
              await upsertIdentity(event.identity);
              await upsertBond(event.bond);
              if (onEvent) onEvent(event);
            } catch (error: any) {
              console.error('Failed to process bond creation event:', error);
              await replayService.captureFailure('bond_creation', op, error.message);
            }
          }
        },
        onerror: (err) => {
          console.error('Horizon stream error:', err);
          setTimeout(() => {
            startStream(); // Reconnect after delay
          }, 5000);
        }
      });
  };
  startStream();

  // Backfill logic: fetch missed events if needed
  // Example: fetch operations since last cursor
  // (Implement as needed based on DB state)
}

/**
 * Parse bond creation event payload
 * @param {object} op Operation object from Horizon
 * @returns {{identity: object, bond: object}}
 */
function parseBondEvent(op) {
  // Example parsing logic
  return {
    identity: {
      id: op.source_account,
      // ...other fields
    },
    bond: {
      id: op.id,
      amount: op.amount,
      duration: op.duration || null,
      // ...other fields
    }
  };
}
