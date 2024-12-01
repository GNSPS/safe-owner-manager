# Safe Owner Manager

_**PLEASE BE SURE TO ALWAYS CHECK THE JSON OUTPUT BY HAND AND BY SIMULATING IT IN TENDERLY, CHECKING STATE CHANGES, BEFORE EXECUTING ANY TRANSACTIONS!!!**_

A tool to manage (Gnosis) Safe multisig owners and thresholds in bulk.

The output of the tool is a JSON file (or variable) that can then be used in Safe's Transaction Builder plugin, after initiating a new transaction in the Safe UI:

<img width="1376" alt="Xnapper-2024-11-20-16 42 20" src="https://github.com/user-attachments/assets/6c0dba68-b517-456a-af28-7ae24e7f95c2">


There is also a branch with a Levenshtein distance algorithm version of this tool. However, given we have the threshold in addition to the address sets, it isn't as good as the current naive version.

### Rationale

The Gnosis Safe multisig contract allows for the management of owners and thresholds. However, the Safe UI does not guarantee the soundness of the linked list structure that holds the Safe's signer set while constructing the transaction to change multiple owners simultaneously. This means, sometimes, it only allows for adding one owner at a time. 

This tool allows for the addition of multiple owners at once, as well as the setting of a new threshold. All while minimizing the number of transactions needed to achieve the desired state.

The need for this tool has mostly arisen from the fact that, given the responsibilities of the Security Councils of the big treasury DAOs and how often their members change, it doesn't make sense to have it be a human-bound effort to maintain the soundness of the underlying owner structure.

This was a tool developed by @GNSPS as a member of @creedxyz for @everclearorg as the organization's Security Council needs to exist in multiple chains at the same time hence the need to automate the process. But we're open-sourcing it for the community to use. :heart:

### Proof of Production Usage

* [Everclear DAO](https://etherscan.io/address/0x3f5f6f0f3e9f84f3f9f4f6f0f3e9f84f3f9f4f6f)
  * [First Council transaction change](https://etherscan.io/tx/0xd3b72d9e997c41869284aab25190240af4dd6d256795633c777e9b71a4458ddc)

## Installation

Install globally to use as a CLI tool:

```bash
npm install -g safe-owner-manager
```

Or install locally in your project:

```bash
npm install safe-owner-manager
```

## CLI Usage

```bash
safe-owner-manager --safe-address=SAFE_ADDRESS --new-owners=NEW_OWNER_1,NEW_OWNER_2,... --chain-id=CHAIN_ID [--alchemy-api-key=ALCHEMY_API_KEY] [--new-threshold=NEW_THRESHOLD] [--out-filename=FILENAME]
```

_Notes_:

- The `--new-owners` parameter should be a comma-separated list of addresses without spaces.
- The `alchemy-api-key` parameter is optional as a parameter but required generally. If not provided, the tool will look for an environment variable named `ALCHEMY_API_KEY`.


### Example:

```bash
safe-owner-manager --safe-address=0xYourSafeAddress --new-owners=0xOwner1,0xOwner2 --chain-id=1 --alchemy-api-key=YourAlchemyApiKey --new-threshold=2 --out-filename=transaction.json
```

## Library Usage

```javascript
const { generateTransactions } = require('safe-owner-manager');

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
- _alchemyApiKey (optional)_: Your Alchemy API key. This parameter can be substituted by the use of a global environment variable named `ALCHEMY_API_KEY`!
- _outFilename (optional)_: The filename to save the JSON output. If not provided, the name will be `transaction_chain-{number}_{safeAddress}.json`.
