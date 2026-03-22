const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const crypto      = require("crypto");

describe("LogHashRegistry", function () {
  let contract, owner, other;

  // Helper to generate a fake batch with a unique suffix
  const fakeBatch = (suffix = "0") => ({
    batchId:   `20260321T14000${suffix}Z`,
    hash:      crypto.createHash("sha256").update(`logs-${suffix}`).digest("hex"),
    timestamp: Math.floor(Date.now() / 1000),
  });

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Factory  = await ethers.getContractFactory("LogHashRegistry");
    contract       = await Factory.deploy();
    await contract.waitForDeployment();
  });

  it("sets deployer as owner", async () => {
    expect(await contract.owner()).to.equal(owner.address);
  });

  it("storeHash: stores a hash successfully", async () => {
    const { batchId, hash, timestamp } = fakeBatch("1");
    await expect(contract.storeHash(batchId, hash, timestamp))
      .to.emit(contract, "HashStored")
      .withArgs(batchId, hash, timestamp, owner.address);

    expect(await contract.totalBatches()).to.equal(1n);
  });

  it("storeHash: reverts on duplicate batchId", async () => {
    const { batchId, hash, timestamp } = fakeBatch("2");
    await contract.storeHash(batchId, hash, timestamp);
    await expect(contract.storeHash(batchId, hash, timestamp))
      .to.be.revertedWith("LogHashRegistry: batch already recorded");
  });

  it("storeHash: reverts if hash is not 64 chars", async () => {
    await expect(contract.storeHash("BATCH-X", "tooshort", 0))
      .to.be.revertedWith("LogHashRegistry: hash must be 64 hex chars");
  });

  it("storeHash: reverts if called by non-owner", async () => {
    const { batchId, hash, timestamp } = fakeBatch("3");
    await expect(contract.connect(other).storeHash(batchId, hash, timestamp))
      .to.be.revertedWith("LogHashRegistry: caller is not owner");
  });

  it("getHash: returns correct values", async () => {
    const { batchId, hash, timestamp } = fakeBatch("4");
    await contract.storeHash(batchId, hash, timestamp);

    const [storedHash, storedTs, submitter] = await contract.getHash(batchId);
    expect(storedHash).to.equal(hash);
    expect(storedTs).to.equal(BigInt(timestamp));
    expect(submitter).to.equal(owner.address);
  });

  it("getHash: reverts for unknown batchId", async () => {
    await expect(contract.getHash("UNKNOWN"))
      .to.be.revertedWith("LogHashRegistry: batch not found");
  });

  it("verifyHash: returns true for correct hash (MATCH)", async () => {
    const { batchId, hash, timestamp } = fakeBatch("5");
    await contract.storeHash(batchId, hash, timestamp);
    expect(await contract.verifyHash(batchId, hash)).to.be.true;
  });

  it("verifyHash: returns false for wrong hash (TAMPERED)", async () => {
    const { batchId, hash, timestamp } = fakeBatch("6");
    await contract.storeHash(batchId, hash, timestamp);
    const tampered = crypto.createHash("sha256").update("tampered").digest("hex");
    expect(await contract.verifyHash(batchId, tampered)).to.be.false;
  });

  it("verifyHash: returns false for unknown batchId", async () => {
    const hash = crypto.createHash("sha256").update("x").digest("hex");
    expect(await contract.verifyHash("NONEXISTENT", hash)).to.be.false;
  });

  it("batchExists: returns correct boolean", async () => {
    const { batchId, hash, timestamp } = fakeBatch("7");
    expect(await contract.batchExists(batchId)).to.be.false;
    await contract.storeHash(batchId, hash, timestamp);
    expect(await contract.batchExists(batchId)).to.be.true;
  });

  it("getBatchIdByIndex: returns correct batchId", async () => {
    const b1 = fakeBatch("8");
    const b2 = fakeBatch("9");
    await contract.storeHash(b1.batchId, b1.hash, b1.timestamp);
    await contract.storeHash(b2.batchId, b2.hash, b2.timestamp);
    expect(await contract.getBatchIdByIndex(0)).to.equal(b1.batchId);
    expect(await contract.getBatchIdByIndex(1)).to.equal(b2.batchId);
  });

  it("transferOwnership: transfers to new owner", async () => {
    await contract.transferOwnership(other.address);
    expect(await contract.owner()).to.equal(other.address);
  });
});
