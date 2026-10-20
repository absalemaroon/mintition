/**
 * Chain registry (presentation + routing metadata).
 *
 * Only chains with status "live" can be selected or used for minting. Today that is
 * Celo. Every other entry is "soon": listed so the picker shows the roadmap, but
 * disabled. Before enabling one, verify its chainId, native symbol and explorer on
 * https://chainlist.org (entries with an empty explorerUrl have not been checked),
 * then add an RPC URL (rpcUrl here, or the RPC_URL_<chainId> env var) and set
 * status to "live". See MULTICHAIN.md.
 */
import logos from "@/lib/chain-logos.json"

export type ChainStatus = "live" | "soon"

export interface ChainConfig {
  /** Decimal chain id as a string. Matches the `networkId` state in the dashboard. */
  id: string
  chainId: number
  name: string
  nativeSymbol: string
  /** Base URL of the block explorer, no trailing slash. Empty means "not verified yet". */
  explorerUrl: string
  status: ChainStatus
  /** Brand colour, used for the monogram fallback when no logo file exists. */
  color: string
  /** Default public RPC for live chains. Override with the RPC_URL_<chainId> env var. */
  rpcUrl?: string
  /** Path under /public, filled in by scripts/fetch-chain-logos.mjs. */
  logo?: string
}

/** Stable colour from the chain name, for entries without a brand colour. */
function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 55% 45%)`
}

const logoMap = logos as Record<string, string>

function soon(chainId: number, name: string, nativeSymbol: string, explorerUrl: string, extra: { color?: string } = {}): ChainConfig {
  return {
    id: String(chainId),
    chainId,
    name,
    nativeSymbol,
    explorerUrl,
    status: "soon",
    color: extra.color ?? colorFromName(name),
    logo: logoMap[String(chainId)],
  }
}

export const CHAINS: ChainConfig[] = [
  {
    id: "42220",
    chainId: 42220,
    name: "Celo",
    nativeSymbol: "CELO",
    explorerUrl: "https://celoscan.io",
    status: "live",
    color: "#FCFF52",
    rpcUrl: "https://forno.celo.org",
    logo: logoMap["42220"],
  },
  soon(1, "Ethereum", "ETH", "https://etherscan.io", { color: "#627EEA" }),
  soon(56, "BNB Smart Chain", "BNB", "https://bscscan.com", { color: "#F0B90B" }),
  soon(100, "Gnosis", "xDAI", "https://gnosisscan.io", { color: "#04795B" }),
  soon(250, "Fantom Opera", "FTM", "https://ftmscan.com", { color: "#1969FF" }),
  soon(146, "Sonic", "S", "https://sonicscan.org"),
  soon(43114, "Avalanche C-Chain", "AVAX", "https://snowtrace.io", { color: "#E84142" }),
  soon(324, "zkSync Era", "ETH", "https://explorer.zksync.io", { color: "#4E529A" }),
  soon(1101, "Polygon zkEVM", "ETH", "https://zkevm.polygonscan.com", { color: "#8247E5" }),
  soon(59144, "Linea", "ETH", "https://lineascan.build", { color: "#61DFFF" }),
  soon(534352, "Scroll", "ETH", "https://scrollscan.com", { color: "#FFEEDA" }),
  soon(81457, "Blast", "ETH", "https://blastscan.io", { color: "#FCFC03" }),
  soon(5000, "Mantle", "MNT", "https://mantlescan.xyz", { color: "#65B3AE" }),
  soon(34443, "Mode", "ETH", ""),
  soon(7777777, "Zora", "ETH", "https://explorer.zora.energy"),
  soon(1088, "Metis", "METIS", "https://explorer.metis.io", { color: "#00DACC" }),
  soon(25, "Cronos", "CRO", "https://cronoscan.com", { color: "#002D74" }),
  soon(1284, "Moonbeam", "GLMR", "https://moonscan.io", { color: "#53CBC9" }),
  soon(1285, "Moonriver", "MOVR", "https://moonriver.moonscan.io", { color: "#F2B705" }),
  soon(1313161554, "Aurora", "ETH", "https://aurorascan.dev", { color: "#70D44B" }),
  soon(1666600000, "Harmony", "ONE", "https://explorer.harmony.one", { color: "#00AEE9" }),
  soon(2222, "Kava EVM", "KAVA", "https://kavascan.com", { color: "#FF564F" }),
  soon(122, "Fuse", "FUSE", "https://explorer.fuse.io", { color: "#B4F9BA" }),
  soon(288, "Boba Network", "ETH", "https://bobascan.com", { color: "#CCFF00" }),
  soon(8217, "Kaia", "KAIA", "https://kaiascan.io"),
  soon(204, "opBNB", "BNB", "https://opbnb.bscscan.com", { color: "#F0B90B" }),
  soon(169, "Manta Pacific", "ETH", "https://pacific-explorer.manta.network"),
  soon(167000, "Taiko Alethia", "ETH", "https://taikoscan.io", { color: "#E81899" }),
  soon(1329, "Sei", "SEI", "https://seitrace.com"),
  soon(592, "Astar", "ASTR", "https://astar.blockscout.com", { color: "#0070EB" }),
  soon(9001, "Evmos", "EVMOS", ""),
  soon(1116, "Core", "CORE", "https://scan.coredao.org", { color: "#FF9211" }),
  soon(30, "Rootstock", "RBTC", "https://rootstock.blockscout.com", { color: "#FF9100" }),
  soon(14, "Flare", "FLR", "https://flarescan.com", { color: "#E62058" }),
  soon(19, "Songbird", "SGB", ""),
  soon(40, "Telos EVM", "TLOS", "https://teloscan.io"),
  soon(1135, "Lisk", "ETH", "https://blockscout.lisk.com"),
  soon(57073, "Ink", "ETH", "https://explorer.inkonchain.com"),
  soon(130, "Unichain", "ETH", "https://uniscan.xyz", { color: "#FC0A54" }),
  soon(1868, "Soneium", "ETH", "https://soneium.blockscout.com"),
  soon(480, "World Chain", "ETH", "https://worldscan.org"),
  soon(80094, "Berachain", "BERA", "https://berascan.com"),
  soon(2741, "Abstract", "ETH", "https://abscan.org"),
  soon(2020, "Ronin", "RON", ""),
  soon(185, "Mint", "ETH", "https://explorer.mintchain.io"),
  soon(60808, "BOB", "ETH", "https://explorer.gobob.xyz"),
  soon(252, "Fraxtal", "frxETH", "https://fraxscan.com"),
  soon(7560, "Cyber", "ETH", "https://cyberscan.co"),
  soon(690, "Redstone", "ETH", "https://explorer.redstone.xyz", { color: "#EF4444" }),
  soon(360, "Shape", "ETH", "https://shapescan.xyz"),
  soon(48900, "Zircuit", "ETH", "https://explorer.zircuit.com"),
  soon(2818, "Morph", "ETH", "https://explorer.morphl2.io"),
  soon(43111, "Hemi", "ETH", "https://explorer.hemi.xyz"),
  soon(1514, "Story", "IP", "https://storyscan.io"),
  soon(98866, "Plume", "PLUME", "https://explorer.plume.org"),
  soon(33139, "ApeChain", "APE", "https://apescan.io", { color: "#0054FA" }),
  soon(1625, "Gravity Alpha", "G", "https://explorer.gravity.xyz"),
  soon(50, "XDC Network", "XDC", "https://xdcscan.com"),
  soon(88, "Viction", "VIC", "https://vicscan.xyz"),
  soon(4689, "IoTeX", "IOTX", "https://iotexscan.io", { color: "#00D4D5" }),
  soon(314, "Filecoin", "FIL", ""),
  soon(7000, "ZetaChain", "ZETA", "https://zetascan.com", { color: "#008462" }),
  soon(666666666, "Degen", "DEGEN", "https://explorer.degen.tips", { color: "#A36EFD" }),
  soon(55244, "Superposition", "ETH", "https://explorer.superposition.so"),
  soon(255, "Kroma", "ETH", "https://kromascan.com"),
  soon(232, "Lens", "GHO", "https://explorer.lens.xyz"),
  soon(21000000, "Corn", "BTCN", "https://cornscan.io"),
  soon(747, "Flow EVM", "FLOW", "https://evm.flowscan.io", { color: "#00EF8B" }),
  soon(999, "HyperEVM", "HYPE", "https://hyperevmscan.io"),
  soon(747474, "Katana", "ETH", ""),
  soon(1923, "Swellchain", "ETH", "https://explorer.swellnetwork.io"),
  soon(200901, "Bitlayer", "BTC", "https://www.btrscan.com"),
  soon(4200, "Merlin", "BTC", "https://scan.merlinchain.io"),
  soon(223, "B2 Network", "BTC", "https://explorer.bsquared.network"),
  soon(42766, "ZKFair", "USDC", "https://scan.zkfair.io"),
  soon(196, "X Layer", "OKB", ""),
  soon(61, "Ethereum Classic", "ETC", "https://etc.blockscout.com", { color: "#3AB83A" }),
  soon(369, "PulseChain", "PLS", "https://scan.pulsechain.com"),
  soon(1111, "WEMIX", "WEMIX", "https://wemixscan.com"),
  soon(42262, "Oasis Emerald", "ROSE", "https://explorer.emerald.oasis.io"),
  soon(23294, "Oasis Sapphire", "ROSE", "https://explorer.oasis.io/mainnet/sapphire"),
  soon(57, "Syscoin", "SYS", "https://explorer.syscoin.org", { color: "#0082C6" }),
  soon(106, "Velas", "VLX", "https://evmexplorer.velas.com"),
  soon(2000, "Dogechain", "DOGE", "https://explorer.dogechain.dog"),
  soon(1030, "Conflux eSpace", "CFX", "https://evm.confluxscan.io"),
  soon(82, "Meter", "MTR", "https://scan.meter.io"),
  soon(361, "Theta", "TFUEL", "https://explorer.thetatoken.org"),
  soon(32769, "Zilliqa EVM", "ZIL", ""),
  soon(336, "Shiden", "SDN", ""),
  soon(42793, "Etherlink", "XTZ", "https://explorer.etherlink.com"),
  soon(841, "Taraxa", "TARA", "https://mainnet.explorer.taraxa.io"),
  soon(888888888, "Ancient8", "ETH", "https://scan.ancient8.gg"),
  soon(660279, "Xai", "XAI", "https://explorer.xai-chain.net"),
  soon(70700, "Proof of Play Apex", "ETH", "https://explorer.apex.proofofplay.com"),
  soon(1996, "Sanko", "DMT", "https://explorer.sanko.xyz"),
  soon(111188, "re.al", "ETH", "https://explorer.re.al"),
  soon(3338, "peaq", "PEAQ", ""),
  soon(177, "HashKey Chain", "HSK", "https://hashkey.blockscout.com"),
  soon(698, "Matchain", "BNB", "https://matchscan.io"),
  soon(2345, "GOAT Network", "BTC", "https://explorer.goat.network"),
  soon(96, "Bitkub Chain", "KUB", "https://www.bkcscan.com"),
  soon(11235, "HAQQ", "ISLM", "https://explorer.haqq.network"),
  soon(570, "Rollux", "SYS", "https://explorer.rollux.com"),
  soon(1890, "LightLink", "ETH", "https://phoenix.lightlink.io"),
  soon(388, "Cronos zkEVM", "zkCRO", "https://explorer.zkevm.cronos.org"),
  soon(13371, "Immutable zkEVM", "IMX", "https://explorer.immutable.com"),
  soon(7897, "Arena-Z", "ETH", "https://explorer.arena-z.gg"),
  soon(1750, "Metal L2", "ETH", "https://explorer.metall2.com"),
  soon(50104, "Sophon", "SOPH", "https://explorer.sophon.xyz"),
  soon(24, "KardiaChain", "KAI", "https://explorer.kardiachain.io"),
  soon(8453, "Base", "ETH", "https://basescan.org", { color: "#0052FF" }),
  soon(137, "Polygon", "POL", "https://polygonscan.com", { color: "#8247E5" }),
  soon(42161, "Arbitrum One", "ETH", "https://arbiscan.io", { color: "#28A0F0" }),
  soon(10, "OP Mainnet", "ETH", "https://optimistic.etherscan.io", { color: "#FF0420" }),
  soon(42170, "Arbitrum Nova", "ETH", "https://nova.arbiscan.io", { color: "#E57310" }),
]

export const DEFAULT_CHAIN_ID = "42220"

export function getChain(id: string): ChainConfig {
  return CHAINS.find((chain) => chain.id === id) ?? CHAINS[0]
}

export function isLiveChain(chainId: number | string): boolean {
  return CHAINS.some((chain) => chain.id === String(chainId) && chain.status === "live")
}

export function explorerTxUrl(chain: ChainConfig, hash: string): string | null {
  if (!chain.explorerUrl) return null
  return /^0x[0-9a-fA-F]{64}$/.test(hash) ? `${chain.explorerUrl}/tx/${hash}` : null
}

export function explorerAddressUrl(chain: ChainConfig, address: string): string | null {
  return chain.explorerUrl ? `${chain.explorerUrl}/address/${address}` : null
}

export function shortAddress(value: string, head = 6, tail = 4): string {
  if (!value) return ""
  return value.length <= head + tail + 3 ? value : `${value.slice(0, head)}...${value.slice(-tail)}`
}
