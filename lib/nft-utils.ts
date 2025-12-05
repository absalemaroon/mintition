import { ethers } from "ethers"

export function generateMetadataURI(walletAddress: string, index: number): string {
  const metadata = {
    name: `Mintition NFT #${index}`,
    description: `Minted on Celo by ${walletAddress}`,
    image:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%236A3FBB' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='40' fill='white' text-anchor='middle' dominant-baseline='middle'%3E%F0%9F%92%8E%3C/text%3E%3C/svg%3E",
    attributes: [
      { trait_type: "Wallet", value: walletAddress },
      { trait_type: "Chain", value: "Celo" },
      { trait_type: "Timestamp", value: new Date().toISOString() },
    ],
  }

  const dataString = JSON.stringify(metadata)
  const encodedData = btoa(unescape(encodeURIComponent(dataString)))
  return `data:application/json;base64,${encodedData}`
}

const MINT_ABI = [
  "function mint(address to, string memory tokenURI) public returns (uint256)",
  "function balanceOf(address owner) public view returns (uint256)",
]

export function encodeMintCall(toAddress: string, tokenURI: string): string {
  const iface = new ethers.Interface(MINT_ABI)
  const encoded = iface.encodeFunctionData("mint", [toAddress, tokenURI])
  console.log("Encoded mint call data:", encoded)
  console.log("Data length:", encoded.length, "bytes")
  return encoded
}

export async function executeMintTransaction(
  contractAddress: string,
  walletInstance: ethers.Wallet,
  toAddress: string,
  tokenURI: string,
) {
  try {
    console.log("=== MINT TRANSACTION ===")
    console.log("Contract address:", contractAddress)
    console.log("Wallet address:", walletInstance.address)
    console.log("Recipient address:", toAddress)
    console.log("Token URI:", tokenURI.substring(0, 80) + "...")

    const contract = new ethers.Contract(contractAddress, MINT_ABI, walletInstance)

    console.log("Populating transaction...")
    const populatedTx = await contract.mint.populateTransaction(toAddress, tokenURI)

    console.log("Populated tx data:", populatedTx.data)
    console.log("Populated tx to:", populatedTx.to)

    if (!populatedTx.data || populatedTx.data === "0x") {
      throw new Error("Transaction data is empty - function encoding failed")
    }

    const manualEncoding = encodeMintCall(toAddress, tokenURI)
    if (!populatedTx.data.startsWith(manualEncoding.substring(0, 10))) {
      console.warn("WARNING: Encoded data mismatch detected")
    }

    console.log("Sending transaction...")
    const tx = await walletInstance.sendTransaction({
      to: contractAddress,
      data: populatedTx.data,
      gasLimit: 500000,
    })

    console.log("Transaction hash:", tx.hash)
    console.log("=== END TRANSACTION ===")

    return tx
  } catch (error) {
    console.error("MINT ERROR:", error)
    if (error instanceof Error) {
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)
    }
    throw error
  }
}

export function isValidTokenURI(uri: string): boolean {
  return uri.startsWith("data:") || uri.startsWith("ipfs://") || uri.startsWith("http")
}
