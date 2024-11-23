// lib/index.js

import { ethers } from 'ethers';
import keccak256 from 'keccak256';

/**
 * Generates the transactions JSON for updating Gnosis Safe owners and threshold.
 *
 * @param {Object} options - The options for generating transactions.
 * @param {string} options.safeAddress - The Gnosis Safe contract address.
 * @param {Array<string>} options.newOwners - An array of new owner addresses.
 * @param {string} options.chainId - The chain ID where the transaction will occur.
 * @param {number} [options.newThreshold] - (Optional) The new threshold value.
 * @param {string} options.alchemyApiKey - Your Alchemy API key.
 * @returns {Promise<Object>} - The JSON output containing the transactions.
 */
export async function generateTransactions(options) {
  const {
    safeAddress,
    newOwners,
    chainId,
    newThreshold,
    alchemyApiKey,
  } = options;

  // Validate required parameters
  if (!safeAddress || !newOwners || !chainId || !alchemyApiKey) {
    throw new Error('Missing required parameters.');
  }

  // Validate and normalize safeAddress
  let safeAddressChecksum;
  try {
    safeAddressChecksum = ethers.getAddress(safeAddress);
  } catch (error) {
    throw new Error(`Invalid Ethereum address for safeAddress: ${safeAddress}`);
  }

  // Validate and normalize newOwners
  const validatedNewOwners = newOwners.map((addr) => {
    const address = addr.trim();
    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(address);
    } catch (error) {
      throw new Error(`Invalid Ethereum address: ${addr}`);
    }
    return checksumAddress;
  });

  // Create an Ethereum provider
  const provider = new ethers.JsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
  );

  // Gnosis Safe contract ABI (minimal required)
  const SAFE_ABI = [
    'function getOwners() view returns (address[])',
    'function getThreshold() view returns (uint256)',
  ];

  // Instantiate the contract
  const safeContract = new ethers.Contract(safeAddressChecksum, SAFE_ABI, provider);

  // Fetch current owners and threshold
  const currentOwnersRaw = await safeContract.getOwners();
  const currentOwners = currentOwnersRaw.map((addr) => ethers.getAddress(addr));
  const currentThreshold = Number(await safeContract.getThreshold());

  // Update threshold variable early
  let threshold;
  if (newThreshold !== null && newThreshold !== undefined) {
    threshold = newThreshold;
  } else {
    threshold = currentThreshold;
  }

  // Check for duplicates in new owners list
  if (new Set(validatedNewOwners).size !== validatedNewOwners.length) {
    throw new Error('Duplicate addresses found in the new owners list.');
  }

  // Reorder new owner list to align matching addresses with current owners
  const reorderedNewOwners = reorderNewOwners(currentOwners, validatedNewOwners);

  // Build transactions
  const transactions = [];
  const SENTINEL_OWNERS = '0x0000000000000000000000000000000000000001';

  // Build owner linked list
  const ownerLinkedList = buildOwnerLinkedList(currentOwners, SENTINEL_OWNERS);

  // Apply Levenshtein distance algorithm to determine minimal operations
  const operations = calculateEditOperations(currentOwners, reorderedNewOwners);

  let hasAddOrRemove = false;

  // Process operations
  for (const op of operations) {
    if (op.type === 'remove') {
      transactions.push(
        createRemoveOwnerTransaction(
          safeAddressChecksum,
          op.owner,
          threshold,
          ownerLinkedList
        )
      );
      hasAddOrRemove = true;

      // Update ownerLinkedList
      const prev = getPrevOwner(op.owner, ownerLinkedList);
      ownerLinkedList[prev] = ownerLinkedList[op.owner];
      delete ownerLinkedList[op.owner];
    } else if (op.type === 'add') {
      transactions.push(
        createAddOwnerTransaction(
          safeAddressChecksum,
          op.owner,
          threshold
        )
      );
      hasAddOrRemove = true;

      // Update ownerLinkedList
      const lastOwner = getLastOwner(ownerLinkedList, SENTINEL_OWNERS);
      ownerLinkedList[lastOwner] = op.owner;
      ownerLinkedList[op.owner] = SENTINEL_OWNERS;
    } else if (op.type === 'swap') {
      transactions.push(
        createSwapOwnerTransaction(
          safeAddressChecksum,
          op.oldOwner,
          op.newOwner,
          ownerLinkedList
        )
      );

      // Update ownerLinkedList
      updateOwnerLinkedList(op.oldOwner, op.newOwner, ownerLinkedList);
    }
  }

  // Adjust threshold if necessary
  if (threshold !== currentThreshold) {
    if (!hasAddOrRemove && operations.some(op => op.type === 'swap')) {
      // Only swaps and threshold change
      transactions.push(createChangeThresholdTransaction(safeAddressChecksum, threshold));
    } else {
      // Threshold has been updated in add/remove transactions
      // No additional transaction needed
    }
  }

  // Build the JSON object without the checksum
  const jsonOutput = {
    version: '1.0',
    chainId: chainId,
    createdAt: Date.now(),
    meta: {
      name: 'Transactions Batch',
      description: '',
      txBuilderVersion: '1.0.0',
      createdFromSafeAddress: safeAddressChecksum,
      createdFromOwnerAddress: '',
      checksum: '', // Will be filled after checksum calculation
    },
    transactions: transactions,
  };

  // Calculate checksum
  const checksum = calculateChecksum(jsonOutput);
  jsonOutput.meta.checksum = checksum;

  // Return the jsonOutput
  return jsonOutput;
}

// Function to reorder new owners to align matching addresses with current owners
function reorderNewOwners(currentOwners, newOwners) {
  const reordered = [];
  const remainingNewOwners = new Set(newOwners);

  // Align matching addresses at the same indices
  for (let i = 0; i < currentOwners.length; i++) {
    const owner = currentOwners[i];
    if (remainingNewOwners.has(owner)) {
      reordered[i] = owner;
      remainingNewOwners.delete(owner);
    } else {
      reordered[i] = null; // Placeholder
    }
  }

  // Fill in the placeholders with remaining new owners
  const remainingNewOwnersArray = Array.from(remainingNewOwners);
  for (let i = 0; i < reordered.length; i++) {
    if (!reordered[i] && remainingNewOwnersArray.length > 0) {
      reordered[i] = remainingNewOwnersArray.shift();
    }
  }

  // Append any additional new owners
  reordered.push(...remainingNewOwnersArray);

  return reordered;
}

// Function to calculate the minimal edit operations between two owner lists
function calculateEditOperations(currentOwners, newOwners) {
  const m = currentOwners.length;
  const n = newOwners.length;

  // Initialize the matrix
  const dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Fill the base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Compute the edit distance matrix
  for (let i = 1; i <= m; i++) {
    const currentOwner = currentOwners[i - 1];
    for (let j = 1; j <= n; j++) {
      const newOwner = newOwners[j - 1];
      if (currentOwner === newOwner) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        const substitutionCost = dp[i - 1][j - 1] + 1; // swap
        const insertionCost = dp[i][j - 1] + 1; // add
        const deletionCost = dp[i - 1][j] + 1; // remove
        dp[i][j] = Math.min(substitutionCost, insertionCost, deletionCost);
      }
    }
  }

  // Backtrack to find the operations
  const operations = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && currentOwners[i - 1] === newOwners[j - 1]) {
      // No operation needed
      i--;
      j--;
    } else if (
      i > 0 &&
      j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + 1
    ) {
      // Substitution (swap)
      operations.unshift({
        type: 'swap',
        oldOwner: currentOwners[i - 1],
        newOwner: newOwners[j - 1],
      });
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      // Insertion (add)
      operations.unshift({
        type: 'add',
        owner: newOwners[j - 1],
      });
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      // Deletion (remove)
      operations.unshift({
        type: 'remove',
        owner: currentOwners[i - 1],
      });
      i--;
    } else {
      // Should not reach here
      throw new Error('Error computing edit operations.');
    }
  }

  return operations;
}

// Helper function to build the owner linked list
function buildOwnerLinkedList(currentOwners, sentinel) {
  const ownerLinkedList = {};
  ownerLinkedList[sentinel] = currentOwners[0] || sentinel;

  for (let i = 0; i < currentOwners.length - 1; i++) {
    ownerLinkedList[currentOwners[i]] = currentOwners[i + 1];
  }
  if (currentOwners.length > 0) {
    ownerLinkedList[currentOwners[currentOwners.length - 1]] = sentinel;
  }

  return ownerLinkedList;
}

// Helper function to create a swapOwner transaction
function createSwapOwnerTransaction(safeAddress, oldOwner, newOwner, ownerLinkedList) {
  return {
    to: safeAddress,
    value: '0',
    data: null,
    contractMethod: {
      inputs: [
        { internalType: 'address', name: 'prevOwner', type: 'address' },
        { internalType: 'address', name: 'oldOwner', type: 'address' },
        { internalType: 'address', name: 'newOwner', type: 'address' },
      ],
      name: 'swapOwner',
      payable: false,
    },
    contractInputsValues: {
      prevOwner: getPrevOwner(oldOwner, ownerLinkedList),
      oldOwner: oldOwner,
      newOwner: newOwner,
    },
  };
}

// Helper function to create an addOwnerWithThreshold transaction
function createAddOwnerTransaction(safeAddress, newOwner, threshold) {
  return {
    to: safeAddress,
    value: '0',
    data: null,
    contractMethod: {
      inputs: [
        { internalType: 'address', name: 'owner', type: 'address' },
        { internalType: 'uint256', name: '_threshold', type: 'uint256' },
      ],
      name: 'addOwnerWithThreshold',
      payable: false,
    },
    contractInputsValues: {
      owner: newOwner,
      _threshold: threshold.toString(),
    },
  };
}

// Helper function to create a removeOwner transaction
function createRemoveOwnerTransaction(safeAddress, oldOwner, threshold, ownerLinkedList) {
  return {
    to: safeAddress,
    value: '0',
    data: null,
    contractMethod: {
      inputs: [
        { internalType: 'address', name: 'prevOwner', type: 'address' },
        { internalType: 'address', name: 'owner', type: 'address' },
        { internalType: 'uint256', name: '_threshold', type: 'uint256' },
      ],
      name: 'removeOwner',
      payable: false,
    },
    contractInputsValues: {
      prevOwner: getPrevOwner(oldOwner, ownerLinkedList),
      owner: oldOwner,
      _threshold: threshold.toString(),
    },
  };
}

// Helper function to create a changeThreshold transaction
function createChangeThresholdTransaction(safeAddress, newThreshold) {
  return {
    to: safeAddress,
    value: '0',
    data: null,
    contractMethod: {
      inputs: [
        { internalType: 'uint256', name: '_threshold', type: 'uint256' },
      ],
      name: 'changeThreshold',
      payable: false,
    },
    contractInputsValues: {
      _threshold: newThreshold.toString(),
    },
  };
}

// Function to get the previous owner in the linked list
function getPrevOwner(owner, ownerLinkedList) {
  for (const [key, value] of Object.entries(ownerLinkedList)) {
    if (value === owner) {
      return key;
    }
  }
  return null;
}

// Function to get the last owner in the linked list
function getLastOwner(ownerLinkedList, sentinel) {
  let currentOwner = sentinel;
  while (ownerLinkedList[currentOwner] && ownerLinkedList[currentOwner] !== sentinel) {
    currentOwner = ownerLinkedList[currentOwner];
  }
  return currentOwner;
}

// Function to update the owner linked list after a swap
function updateOwnerLinkedList(oldOwner, newOwner, ownerLinkedList) {
  const prevOwner = getPrevOwner(oldOwner, ownerLinkedList);
  ownerLinkedList[prevOwner] = newOwner;
  ownerLinkedList[newOwner] = ownerLinkedList[oldOwner];
  delete ownerLinkedList[oldOwner];
}

// Function to calculate checksum
function calculateChecksum(jsonData) {
  // Clone the JSON data and remove the checksum field
  const dataForChecksum = JSON.parse(JSON.stringify(jsonData));
  dataForChecksum.meta.checksum = '';

  // Stringify the JSON data with sorted keys
  const jsonString = JSON.stringify(dataForChecksum, Object.keys(dataForChecksum).sort());

  // Calculate keccak256 hash
  const hash = keccak256(jsonString).toString('hex');
  return '0x' + hash;
}