#!/usr/bin/env node

// bin/cli.js

import { generateTransactions } from '../lib/index.js';
import minimist from 'minimist';
import fs from 'fs';

// Process command-line arguments with minimist, specifying string arguments
const args = minimist(process.argv.slice(2), {
  string: ['safe-address', 'new-owners', 'chain-id', 'new-threshold', 'alchemy-api-key', 'out-filename'],
});

// Extract parameters
const safeAddress = args['safe-address'];
const newOwnersInput = args['new-owners'];
const chainId = args['chain-id'];
const newThreshold = args['new-threshold'] ? parseInt(args['new-threshold'], 10) : null;
const alchemyApiKey = args['alchemy-api-key'] || process.env.ALCHEMY_API_KEY;
const outFilename = args['out-filename'] ? args['out-filename'] : `transactions_chain-${chainId}_${safeAddress}.json`;

// Usage message
if (!safeAddress || !newOwnersInput || !chainId || !alchemyApiKey) {
  console.log('Usage: gnosis-safe-owner-manager --safe-address=SAFE_ADDRESS --new-owners=NEW_OWNER_1,NEW_OWNER_2,... --chain-id=CHAIN_ID [--new-threshold=NEW_THRESHOLD] --alchemy-api-key=ALCHEMY_API_KEY [--out-filename=FILENAME]');
  process.exit(1);
}

// Parse new owners list
const newOwners = newOwnersInput.split(',').map(addr => addr.trim());

// Call the generateTransactions function
generateTransactions({
  safeAddress,
  newOwners,
  chainId,
  newThreshold,
  alchemyApiKey,
})
  .then(jsonOutput => {
    // Output JSON to file
    fs.writeFileSync(outFilename, JSON.stringify(jsonOutput, null, 2));
    console.log(`Transaction JSON has been saved to ${outFilename}`);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });