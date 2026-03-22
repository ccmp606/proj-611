// Deploy LogHashRegistry to Sepolia.
// After running, copy the contract address to .env and Lambda env vars.

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=== PROJ-611 — LogHashRegistry Deployment ===\n");

  const [deployer] = await ethers.getSigners();
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log("Deployer address :", deployer.address);
  console.log("Deployer balance :", ethers.formatEther(balance), "ETH");
  console.log("Network          :", (await ethers.provider.getNetwork()).name);
  console.log();

  if (balance === 0n) {
    throw new Error("Deployer wallet has 0 ETH. Fund it at https://sepoliafaucet.com");
  }

  console.log("Deploying LogHashRegistry...");
  const Factory  = await ethers.getContractFactory("LogHashRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash  = contract.deploymentTransaction().hash;

  console.log("Contract address :", address);
  console.log("Deploy tx hash   :", txHash);
  console.log("Etherscan        :", `https://sepolia.etherscan.io/address/${address}`);
  console.log();

  const owner = await contract.owner();
  console.log("Contract owner   :", owner, "(should match deployer)");
  console.log();

  // Save contract address + ABI so other scripts and Lambda can reference it
  const deploymentInfo = {
    network:         "sepolia",
    contractAddress: address,
    deployerAddress: deployer.address,
    deployTxHash:    txHash,
    deployedAt:      new Date().toISOString(),
    abi:             JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../artifacts/contracts/LogHashRegistry.sol/LogHashRegistry.json"),
        "utf8"
      )
    ).abi,
  };

  const outDir  = path.join(__dirname, "../deployments");
  const outFile = path.join(outDir, "sepolia.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info saved to:", outFile);

  console.log("\n=== NEXT STEPS ===");
  console.log(`1. Copy CONTRACT_ADDRESS=${address} to .env`);
  console.log("2. Update Lambda environment variable CONTRACT_ADDRESS in AWS Console");
  console.log("3. Run: npx hardhat run scripts/verify.js --network sepolia");
  console.log("4. Attach web3 Lambda Layer if not done yet");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
