# Safe Owner Manager

_**PLEASE BE SURE TO ALWAYS CHECK THE JSON OUTPUT BY HAND AND BY SIMULATING IT IN TENDERLY, CHECKING STATE CHANGES, BEFORE EXECUTING ANY TRANSACTIONS!!!**_

_**Also, make sure you're OK with the data privacy level if using the public RPC providers hardcoded into the tool. To prevent doubt, always try to use an authenticated service you trust!**_

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
- The `--new-threshold` parameter is optional.
- You can provide either an `--alchemy-api-key` for supported networks or a `--rpc-url` for custom networks or when you prefer to use a different RPC provider.
- If neither `--alchemy-api-key` nor `--rpc-url is provided, the tool will attempt to use public RPC endpoints for common networks.
- The `--out-filename` parameter is optional. If not provided, the output file will be named `transactions_chain-{chainId}_{safeAddress}.json`.


### Examples:

**1.	Using Alchemy API Key on Ethereum Mainnet:**

```bash
safe-owner-manager \
  --safe-address=0xYourSafeAddress \
  --new-owners=0xOwner1,0xOwner2 \
  --chain-id=1 \
  --new-threshold=2 \
  --alchemy-api-key=YourAlchemyApiKey \
  --out-filename=transactions_mainnet.json
```

**2.  Using Public RPC URL on Binance Smart Chain:**

```bash
safe-owner-manager \
  --safe-address=0xYourSafeAddress \
  --new-owners=0xOwner1,0xOwner2 \
  --chain-id=56 \
  --new-threshold=2
```

**3. Using Custom RPC URL for an Unsupported Network:**

```bash
safe-owner-manager \
  --safe-address=0xYourSafeAddress \
  --new-owners=0xOwner1,0xOwner2 \
  --chain-id=12345 \
  --new-threshold=2 \
  --rpc-url=https://custom-rpc.network \
  --out-filename=transactions_custom.json
```

## Library Usage

```javascript
import { generateTransactions } from 'safe-owner-manager';

const options = {
  safeAddress: '0xYourSafeAddress',
  newOwners: ['0xOwner1', '0xOwner2'],
  chainId: '1', // Ethereum Mainnet
  newThreshold: 2, // Optional
  alchemyApiKey: 'YourAlchemyApiKey', // Optional
  rpcUrl: 'https://custom-rpc.network', // Optional
};

generateTransactions(options)
  .then((jsonOutput) => {
    // Use the jsonOutput as needed
    console.log(JSON.stringify(jsonOutput, null, 2));
  })
  .catch((error) => {
    console.error('Error:', error.message);
  });
```

## Parameters

- _safeAddress_: The address of the Gnosis Safe multisig contract.
- _newOwners_: An array of new owner addresses.
- _chainId_: The chain ID where the transaction will occur (e.g., 1 for Ethereum Mainnet).
- _newThreshold (optional)_: The new threshold value to set.
- _alchemyApiKey (optional)_: Your Alchemy API key. This parameter can be substituted by the use of a global environment variable named `ALCHEMY_API_KEY`.
- _rpcUrl (optional)_: A custom RPC URL. Useful for unsupported networks or when you prefer a specific RPC provider.
- _outFilename (optional)_: The filename to save the JSON output. If not provided, the name will be `transaction_chain-{number}_{safeAddress}.json`.

## Supported Networks

The tool supports a variety of networks, including but not limited to:
- Ethereum Mainnet (chainId: 1)
- Goerli Testnet (chainId: 5)
- Sepolia Testnet (chainId: 11155111)
- Polygon Mainnet (chainId: 137)
- Polygon Mumbai Testnet (chainId: 80001)
- Binance Smart Chain Mainnet (chainId: 56)
- Binance Smart Chain Testnet (chainId: 97)
- Gnosis Mainnet (chainId: 100)
- Gnosis Chiado Testnet (chainId: 10200)
- Avalanche Mainnet (chainId: 43114)
- Avalanche Fuji Testnet (chainId: 43113)
- Fantom Opera (chainId: 250)
- Fantom Testnet (chainId: 4002)
- Optimism Mainnet (chainId: 10)
- Optimism Goerli Testnet (chainId: 420)
- Arbitrum One (chainId: 42161)
- Arbitrum Goerli Testnet (chainId: 421613)
- Base Mainnet (chainId: 8453)

For networks not listed or unsupported, you can provide a custom RPC URL using the `--rpc-url` parameter.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.