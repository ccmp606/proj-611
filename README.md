# PROJ-611 — Blockchain-Based Cloud Logging System

A tamper-evident log integrity system that hashes AWS CloudWatch logs every 5 minutes and anchors each batch hash permanently on the Ethereum Sepolia blockchain.

---

## System Overview

```
EC2 Instance (log generator)
        │  writes audit events every 3–10 s
        ▼
CloudWatch Log Group  (/devops/app-logs)
        │
        │  EventBridge schedule — every 5 minutes
        ▼
Lambda Function (log-hasher)
        ├──► SHA-256 hash of log batch
        ├──► S3  (stores raw logs + hash file, SSE-KMS encrypted)
        ├──► DynamoDB  (batch metadata: batch_id, hash, tx_hash, status)
        └──► Ethereum Sepolia  storeHash(batchId, hash, timestamp)
                                        │
                                LogHashRegistry.sol
                        0x106b74f8aaF6E548a8c733adEA2Cec02395B8643
```

Anyone can call `verifyHash(batchId, hash)` on-chain to prove a log batch has not been tampered with.

---

## Repository Structure

```
proj-611/
├── blockchain/
│   ├── contracts/
│   │   └── LogHashRegistry.sol     # Solidity smart contract
│   ├── scripts/
│   │   ├── deploy.js               # Deploy to Sepolia
│   │   ├── verify.js               # Verify on Etherscan
│   │   └── test-contract.js        # Smoke test (MATCH / TAMPERED)
│   ├── test/
│   │   └── LogHashRegistry.test.js # Hardhat unit tests
│   └── hardhat.config.js
├── frontend/
│   └── index.html                  # MetaMask UI for contract interaction
├── infrastructure/
│   └── cloudformation.yaml         # Full AWS stack
├── .env.example
└── README.md
```

---

## Prerequisites

### 1. Install Node.js (v18 or later)

Download from [nodejs.org](https://nodejs.org) and install. Verify:

```bash
node --version
npm --version
```

> 📸 **SCREENSHOT**: Terminal showing `node --version` and `npm --version` output

### 2. Install MetaMask

Install the MetaMask browser extension from [metamask.io](https://metamask.io/download).

Create or import a wallet, then add the **Sepolia testnet**:
- Open MetaMask → click the network dropdown → **Add network** → search for **Sepolia**

Get free Sepolia ETH from: [sepoliafaucet.com](https://sepoliafaucet.com)

> 📸 **SCREENSHOT**: MetaMask showing Sepolia network selected with a small ETH balance

### 3. Get an Infura API Key

1. Go to [infura.io](https://infura.io) → Sign up (free)
2. Create a new project → copy the **API Key**
3. The RPC URL will be: `https://sepolia.infura.io/v3/<YOUR_KEY>`

> 📸 **SCREENSHOT**: Infura dashboard showing project API key

### 4. Get an Etherscan API Key *(optional — only needed for contract verification)*

1. Go to [etherscan.io](https://etherscan.io) → Sign up → My Profile → **API Keys**
2. Create a new key and copy it

---

## Setup — Step by Step

### Step 1 — Clone the repository

```bash
git clone https://github.com/<your-org>/proj-611.git
cd proj-611
```

### Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
# Sepolia RPC from Infura or Alchemy
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<YOUR_INFURA_KEY>

# Private key of the wallet that will sign transactions (must hold Sepolia ETH)
WALLET_PRIVATE_KEY=0x<64_hex_chars>

# Leave empty for now — fill in after Step 3
CONTRACT_ADDRESS=

# Optional — only for: npm run verify
ETHERSCAN_API_KEY=<YOUR_ETHERSCAN_KEY>

# AWS — leave defaults unless your region is different
AWS_REGION=us-east-1
STACK_NAME=proj611-blockchain-log
PROJECT_NAME=proj611-log
LOG_GROUP_NAME=/devops/app-logs

# Fill in after Step 5 (CloudFormation outputs)
S3_BUCKET_NAME=
DYNAMODB_TABLE=
```

> ⚠️ Never commit `.env` — it is already in `.gitignore`

---

### Step 3 — Deploy the smart contract to Sepolia

```bash
cd blockchain
npm install
npm run deploy
```

> 📸 **SCREENSHOT**: Terminal output showing deployment — contract address printed at the end

After deploy you will see output like:

```
LogHashRegistry deployed to: 0x106b74f8aaF6E548a8c733adEA2Cec02395B8643
```

Copy the contract address into `.env`:

```env
CONTRACT_ADDRESS=0x106b74f8aaF6E548a8c733adEA2Cec02395B8643
```

**Run smoke test** to confirm the contract works:

```bash
cd blockchain && npm run smoke
```

Expected output: `MATCH ✓` and `TAMPERED ✓`

> 📸 **SCREENSHOT**: Smoke test terminal output showing MATCH and TAMPERED results

---

### Step 4 — Build the web3 Lambda Layer

> This runs entirely in **AWS CloudShell** — no local AWS credentials needed.
>
> AWS Console → click the **CloudShell** icon in the top navigation bar

> 📸 **SCREENSHOT**: AWS Console top bar with CloudShell icon highlighted

Paste and run in CloudShell:

```bash
mkdir -p python
pip install web3 -t python/ \
  --platform manylinux2014_x86_64 \
  --python-version 3.12 \
  --only-binary=:all: \
  --quiet 2>/dev/null && echo "✓ web3 installed"

zip -r web3-layer.zip python/ -q && echo "✓ web3-layer.zip created"

aws lambda publish-layer-version \
  --layer-name proj611-web3 \
  --zip-file fileb://web3-layer.zip \
  --compatible-runtimes python3.12 \
  --region us-east-1 \
  --query 'LayerVersionArn' \
  --output text
```

> 📸 **SCREENSHOT**: CloudShell output showing `✓ web3 installed`, `✓ web3-layer.zip created`, and the Layer ARN

The last line printed is the Layer ARN — save it:

```
arn:aws:lambda:us-east-1:123456789012:layer:proj611-web3:1
```

---

### Step 5 — Deploy the AWS CloudFormation stack

1. Go to **AWS Console → CloudFormation → Create stack → With new resources**
2. Select **Upload a template file** → choose `infrastructure/cloudformation.yaml`

> 📸 **SCREENSHOT**: CloudFormation "Create stack" page with template uploaded

3. Fill in the parameters:

| Parameter | Value |
|-----------|-------|
| `ProjectName` | `proj611-log` |
| `KeyPairName` | Select an existing EC2 Key Pair |
| `InstanceType` | `t2.micro` |
| `LogRetentionDays` | `90` |
| `SepoliaRpcUrl` | Same as `SEPOLIA_RPC_URL` in `.env` |
| `ContractAddress` | Contract address from Step 3 |
| `WalletPrivateKey` | Same as `WALLET_PRIVATE_KEY` in `.env` |
| `LambdaLayerArn` | ARN from Step 4 |

> 📸 **SCREENSHOT**: CloudFormation parameters page filled in (blur WalletPrivateKey)

4. Click through to **Submit**. Stack creation takes ~3 minutes.

> 📸 **SCREENSHOT**: CloudFormation stack showing `CREATE_COMPLETE`

5. Open the **Outputs** tab and copy values to `.env`:

| Output | `.env` key |
|--------|-----------|
| `S3BucketName` | `S3_BUCKET_NAME` |
| `DynamoDBTableName` | `DYNAMODB_TABLE` |
| `EC2PublicIP` | (for SSH if needed) |

> 📸 **SCREENSHOT**: CloudFormation Outputs tab showing S3BucketName and DynamoDBTableName

---

### Step 6 — Verify the pipeline is running

Wait ~5 minutes for the first Lambda execution, then check:

**DynamoDB** — AWS Console → DynamoDB → Tables → `proj611-log-batch-metadata` → **Explore items**

You should see batch entries with status `ON_CHAIN` and a real `tx_hash` starting with `0x`.

> 📸 **SCREENSHOT**: DynamoDB table showing batch items with status ON_CHAIN and tx_hash values

**CloudWatch Logs** — AWS Console → CloudWatch → Log groups → `/devops/app-logs`

You should see log streams with audit events from EC2.

> 📸 **SCREENSHOT**: CloudWatch log group showing log streams with events

---

### Step 7 — Test with the frontend

MetaMask only works on `http://` — not `file://`. Serve the frontend locally:

```bash
cd frontend && python -m http.server 8080
```

Open `http://localhost:8080` in the browser.

1. Click **Connect MetaMask** — MetaMask will prompt to connect
2. If on the wrong network, it will automatically prompt to switch to Sepolia
3. **Contract Info** section loads: owner address and total batches on-chain
4. Use **getHash** with a batch ID from DynamoDB to fetch the on-chain record
5. Use **verifyHash** to confirm the hash matches — result shows **MATCH** or **TAMPERED**

> 📸 **SCREENSHOT**: Frontend showing connected wallet (Sepolia badge), contract info loaded, and a MATCH result from verifyHash

---

## Smart Contract Reference

**Network:** Ethereum Sepolia
**Address:** `0x106b74f8aaF6E548a8c733adEA2Cec02395B8643`
**Explorer:** [sepolia.etherscan.io/address/0x106b74f8aaF6E548a8c733adEA2Cec02395B8643](https://sepolia.etherscan.io/address/0x106b74f8aaF6E548a8c733adEA2Cec02395B8643)

| Function | Access | Description |
|----------|--------|-------------|
| `storeHash(batchId, hash, timestamp)` | owner only | Anchors a log batch hash on-chain |
| `getHash(batchId)` | public | Returns hash, timestamp, submitter address |
| `verifyHash(batchId, hash)` | public | `true` if hash matches on-chain record |
| `batchExists(batchId)` | public | `true` if batch has been recorded |
| `getBatchIdByIndex(index)` | public | Returns batchId at position N |
| `totalBatches()` | public | Total recorded batches |

---

## DynamoDB Batch Status

| `status` | Meaning |
|----------|---------|
| `ON_CHAIN` | Hash anchored on Ethereum — `tx_hash` is a real `0x...` transaction hash |
| `HASH_ONLY` | Hash computed and stored in S3/DynamoDB — blockchain submission skipped or failed |

---

## Teardown

1. **Empty the S3 bucket** manually (AWS Console → S3 → select all objects → Delete)
2. Delete the CloudFormation stack:

```bash
aws cloudformation delete-stack \
  --stack-name proj611-blockchain-log \
  --region us-east-1
```

If stuck in `DELETE_FAILED`, force delete via CloudShell:

```bash
aws cloudformation delete-stack \
  --stack-name proj611-blockchain-log \
  --deletion-mode FORCE_DELETE_STACK \
  --region us-east-1
```

> The Lambda Layer (`proj611-web3`) is not part of the stack and must be deleted separately if no longer needed: AWS Console → Lambda → Layers → `proj611-web3` → Delete
