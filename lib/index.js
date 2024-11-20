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

  // Reorder new owner list to match existing indices where possible
  const newOwnersReordered = reorderNewOwners(currentOwners, validatedNewOwners);

  // Build transactions
  const transactions = [];
  const SENTINEL_OWNERS = '0x0000000000000000000000000000000000000001';

  // Build owner linked list
  const ownerLinkedList = buildOwnerLinkedList(currentOwners, SENTINEL_OWNERS);

  // Interim owners to track state changes
  const interimOwnersSet = new Set(currentOwners);

  // Flags to check if add or remove transactions are added
  let hasAddOrRemove = false;

  // Collect swaps, removals, and additions
  const swaps = [];
  const ownersToRemove = [];
  const ownersToAdd = [];

  // First, collect swaps, removals, and additions
  for (let i = 0; i < Math.max(currentOwners.length, newOwnersReordered.length); i++) {
    const oldOwner = currentOwners[i];
    const newOwner = newOwnersReordered[i];

    if (oldOwner && newOwner) {
      if (oldOwner !== newOwner) {
        if (interimOwnersSet.has(newOwner)) {
          throw new Error(`Duplicate owner address detected: ${newOwner}`);
        }
        // Collect swap
        swaps.push({ oldOwner, newOwner });
        // Update interimOwnersSet
        interimOwnersSet.delete(oldOwner);
        interimOwnersSet.add(newOwner);
      }
    } else if (oldOwner && !newOwner) {
      // Collect owner to remove
      ownersToRemove.push(oldOwner);
      interimOwnersSet.delete(oldOwner);
    } else if (!oldOwner && newOwner) {
      if (interimOwnersSet.has(newOwner)) {
        throw new Error(`Duplicate owner address detected: ${newOwner}`);
      }
      // Collect owner to add
      ownersToAdd.push(newOwner);
      interimOwnersSet.add(newOwner);
    }
  }

  // Process swaps
  for (const { oldOwner, newOwner } of swaps) {
    transactions.push(createSwapOwnerTransaction(safeAddressChecksum, oldOwner, newOwner, ownerLinkedList));

    // Update ownerLinkedList
    updateOwnerLinkedList(oldOwner, newOwner, ownerLinkedList);
  }

  // Process removals
  for (const ownerToRemove of ownersToRemove) {
    transactions.push(createRemoveOwnerTransaction(safeAddressChecksum, ownerToRemove, threshold, ownerLinkedList));

    hasAddOrRemove = true;

    // Update ownerLinkedList
    const prev = getPrevOwner(ownerToRemove, ownerLinkedList);
    ownerLinkedList[prev] = ownerLinkedList[ownerToRemove];
    delete ownerLinkedList[ownerToRemove];
  }

  // Process additions
  for (const ownerToAdd of ownersToAdd) {
    transactions.push(createAddOwnerTransaction(safeAddressChecksum, ownerToAdd, threshold));

    hasAddOrRemove = true;

    // Update ownerLinkedList
    const lastOwner = getLastOwner(ownerLinkedList, SENTINEL_OWNERS);
    ownerLinkedList[lastOwner] = ownerToAdd;
    ownerLinkedList[ownerToAdd] = SENTINEL_OWNERS;
  }

  // Adjust threshold if necessary
  if (threshold !== currentThreshold) {
    if (!hasAddOrRemove && swaps.length > 0) {
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

// Helper function to build the owner linked list
function buildOwnerLinkedList(currentOwners, sentinel) {
  const ownerLinkedList = {};
  ownerLinkedList[sentinel] = currentOwners[0];

  for (let i = 0; i < currentOwners.length - 1; i++) {
    ownerLinkedList[currentOwners[i]] = currentOwners[i + 1];
  }
  ownerLinkedList[currentOwners[currentOwners.length - 1]] = sentinel;

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

// Function to reorder new owners to match existing indices when possible
function reorderNewOwners(currentOwners, newOwners) {
  const reordered = [];
  const remainingNewOwners = [...newOwners];

  // First, try to place existing owners at the same index
  for (let i = 0; i < currentOwners.length; i++) {
    const owner = currentOwners[i];
    if (remainingNewOwners.includes(owner)) {
      reordered[i] = owner;
      remainingNewOwners.splice(remainingNewOwners.indexOf(owner), 1);
    } else {
      reordered[i] = null; // Placeholder for now
    }
  }

  // Fill in the placeholders with new owners
  for (let i = 0; i < reordered.length; i++) {
    if (!reordered[i]) {
      reordered[i] = remainingNewOwners.shift();
    }
  }

  // Append any additional new owners
  return reordered.concat(remainingNewOwners);
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