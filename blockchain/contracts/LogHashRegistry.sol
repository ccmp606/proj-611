// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Stores SHA-256 hashes of CloudWatch log batches on-chain.
// Lambda calls storeHash() after processing each batch.
// Anyone can call verifyHash() to check if logs were tampered with.
contract LogHashRegistry {

    struct HashRecord {
        string  hashValue;  // SHA-256 hex string (64 chars)
        uint256 timestamp;
        address submitter;
        bool    exists;
    }

    address public owner;
    uint256 public totalBatches;

    mapping(string => HashRecord) private records;   // batchId => record
    mapping(uint256 => string)   private batchIndex; // index => batchId

    event HashStored(
        string  indexed batchId,
        string          hashValue,
        uint256         timestamp,
        address indexed submitter
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "LogHashRegistry: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // Store a hash for a log batch. Only the owner (Lambda wallet) can call this.
    function storeHash(
        string calldata _batchId,
        string calldata _hash,
        uint256         _timestamp
    ) external onlyOwner {
        require(bytes(_batchId).length > 0, "LogHashRegistry: batchId is empty");
        require(bytes(_hash).length == 64,  "LogHashRegistry: hash must be 64 hex chars");
        require(!records[_batchId].exists,  "LogHashRegistry: batch already recorded");

        records[_batchId] = HashRecord({
            hashValue:  _hash,
            timestamp:  _timestamp,
            submitter:  msg.sender,
            exists:     true
        });

        batchIndex[totalBatches] = _batchId;
        totalBatches++;

        emit HashStored(_batchId, _hash, _timestamp, msg.sender);
    }

    // Returns the stored hash and metadata for a batch.
    function getHash(string calldata _batchId)
        external view
        returns (string memory hashValue, uint256 timestamp, address submitter)
    {
        require(records[_batchId].exists, "LogHashRegistry: batch not found");
        HashRecord storage r = records[_batchId];
        return (r.hashValue, r.timestamp, r.submitter);
    }

    // Returns true if the hash matches what's on-chain, false if it doesn't (or batch not found).
    function verifyHash(string calldata _batchId, string calldata _hash)
        external view
        returns (bool)
    {
        if (!records[_batchId].exists) return false;
        return keccak256(bytes(records[_batchId].hashValue)) == keccak256(bytes(_hash));
    }

    // Check if a batch has already been recorded.
    function batchExists(string calldata _batchId) external view returns (bool) {
        return records[_batchId].exists;
    }

    // Get batch ID by index (useful for iterating all stored batches).
    function getBatchIdByIndex(uint256 _index) external view returns (string memory) {
        require(_index < totalBatches, "LogHashRegistry: index out of range");
        return batchIndex[_index];
    }

    // Transfer ownership to a new wallet (e.g. when rotating the Lambda wallet).
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "LogHashRegistry: new owner is zero address");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }
}
