// Submit contract source code to Etherscan for verification.
// Requires ETHERSCAN_API_KEY in .env and deploy.js to have run first.

const { run } = require("hardhat");
const fs      = require("fs");
const path    = require("path");

async function main() {
  const deploymentFile = path.join(__dirname, "../deployments/sepolia.json");

  if (!fs.existsSync(deploymentFile)) {
    throw new Error("No deployment found. Run deploy.js first.");
  }

  const { contractAddress } = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  console.log("Verifying LogHashRegistry at:", contractAddress);

  await run("verify:verify", {
    address:              contractAddress,
    constructorArguments: [],
  });

  console.log("Verification submitted. Check:");
  console.log(`https://sepolia.etherscan.io/address/${contractAddress}#code`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
