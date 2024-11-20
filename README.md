# Safe Owner Manager

A tool to manage (Gnosis) Safe multisig owners and thresholds in bulk.

The output of the tool is a JSON file (or variable) that can then be used in Safe's Transaction Builder plugin, after initiating a new transaction in the Safe UI:

<img width="1376" alt="Xnapper-2024-11-20-16 42 20" src="https://github.com/user-attachments/assets/6c0dba68-b517-456a-af28-7ae24e7f95c2">

## Installation

Install globally to use as a CLI tool:

```bash
npm install -g gnosis-safe-owner-manager
```

Or install locally in your project:

```bash
npm install gnosis-safe-owner-manager
```

## CLI Usage

```bash
gnosis-safe-owner-manager --safe-address=SAFE_ADDRESS --new-owners=NEW_OWNER_1,NEW_OWNER_2,... --chain-id=CHAIN_ID --alchemy-api-key=ALCHEMY_API_KEY [--new-threshold=NEW_THRESHOLD]
```

### Example:

```bash
gnosis-safe-owner-manager --safe-address=0xYourSafeAddress --new-owners=0xOwner1,0xOwner2 --chain-id=1 --alchemy-api-key=YourAlchemyApiKey --new-threshold=2
```

## Library Usage

```javascript
const { generateTransactions } = require('gnosis-safe-owner-manager');

const options = {
  safeAddress: '0xYourSafeAddress',
  newOwners: ['0xOwner1', '0xOwner2'],
  chainId: '1',
  newThreshold: 2,
  alchemyApiKey: 'YourAlchemyApiKey',
};

generateTransactions(options)
  .then(jsonOutput => {
    // Use the jsonOutput as needed
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
```

## Parameters

- _safeAddress_: The address of the Gnosis Safe multisig contract.
- _newOwners_: An array of new owner addresses.
- _chainId_: The chain ID where the transaction will occur (e.g., 1 for Ethereum Mainnet).
- _newThreshold (optional)_: The new threshold value to set.
- _alchemyApiKey_: Your Alchemy API key.
