// Smoke test against the deployed contract on Sepolia.
// Run this after deploy to confirm the contract is working correctly.

const { ethers } = require("hardhat");
const fs         = require("fs");
const path       = require("path");
const crypto     = require("crypto");

async function main() {
  console.log("=== LogHashRegistry Smoke Test (Sepolia) ===\n");

  const deploymentFile = path.join(__dirname, "../deployments/sepolia.json");
  if (!fs.existsSync(deploymentFile)) {
    throw new Error("No deployment found. Run deploy.js first.");
  }

  const { contractAddress, abi } = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(contractAddress, abi, signer);

  // 1. Store a test hash
  const batchId   = `TEST-${Date.now()}`;
  const fakeLog   = JSON.stringify({ event: "test_deploy", user: "ci", status: "success" });
  const hash      = crypto.createHash("sha256").update(fakeLog).digest("hex");
  const timestamp = Math.floor(Date.now() / 1000);

  console.log("Batch ID  :", batchId);
  console.log("SHA-256   :", hash);
  console.log("Submitting storeHash()...");

  const tx = await contract.storeHash(batchId, hash, timestamp);
  await tx.wait();
  console.log("TX hash   :", tx.hash, "\n");

  // 2. Read it back
  const [storedHash, storedTs, submitter] = await contract.getHash(batchId);
  console.log("getHash() result:");
  console.log("  storedHash :", storedHash);
  console.log("  timestamp  :", storedTs.toString());
  console.log("  submitter  :", submitter);

  // 3. Verify with correct hash — should be MATCH
  const matchResult = await contract.verifyHash(batchId, hash);
  console.log(`\nverifyHash(correct)  => ${matchResult ? "✓ MATCH" : "✗ UNEXPECTED MISMATCH"}`);

  // 4. Verify with wrong hash — should be TAMPERED
  const tamperedHash = crypto.createHash("sha256").update("tampered_content").digest("hex");
  const tamperResult = await contract.verifyHash(batchId, tamperedHash);
  console.log(`verifyHash(tampered) => ${!tamperResult ? "✓ TAMPERED (correctly detected)" : "✗ UNEXPECTED MATCH"}`);

  // 5. Total count
  const total = await contract.totalBatches();
  console.log(`\nTotal batches on-chain: ${total}`);

  console.log("\n=== Smoke test PASSED ===");
}

main().catch((err) => {
  console.error("Smoke test FAILED:", err);
  process.exit(1);
});
