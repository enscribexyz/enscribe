import { CHAINS, METRICS_URL, NAME_GEN_URL, TOPIC0 } from '../utils/constants'
import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  GetTransactionReceiptReturnType,
  Hex,
  Log,
} from 'viem'

export async function logMetric(
  corelationId: String,
  timestamp: number,
  chainId: number,
  contractAddress: String,
  senderAddress: String,
  name: String,
  step: String,
  txnHash: String,
  contractType: String,
  opType: String,
) {
  await fetch(METRICS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      co_id: corelationId,
      contract_address: contractAddress,
      ens_name: name,
      deployer_address: senderAddress,
      network: chainId,
      timestamp: Math.floor(timestamp / 1000),
      step: step,
      txn_hash: txnHash,
      contract_type: contractType,
      op_type: opType,
      source: 'enscribe',
    }),
  })
}

export const fetchGeneratedName = async () => {
  try {
    let res = await fetch(NAME_GEN_URL)
    if (res.ok) {
      return await res.text()
    }
  } catch (err) {
    console.error('Sourcify fetch failed:', err)
  }
  return ''
}

export type ConstructorArg = {
  type: string
  value: string
  isCustom: boolean
  isTuple?: boolean
  label?: string
}

export const encodeConstructorArgs = (
  bytecode: string,
  args: ConstructorArg[],
  setError: (msg: string) => void,
) => {
  try {
    const types = args.map((arg) => arg.type)
    const values = args.map((arg) => {
      try {
        if (
          arg.type.startsWith('tuple') ||
          arg.type.endsWith('[]') ||
          arg.type === 'bool' ||
          arg.type.startsWith('uint') ||
          arg.type === 'int' ||
          arg.type.startsWith('int')
        ) {
          return JSON.parse(arg.value)
        }

        // For address and string types, return as-is
        return arg.value
      } catch (parseErr) {
        console.error(`Failed to parse value for type ${arg.type}:`, arg.value)
        throw new Error(`Invalid value for argument ${arg.label || arg.type}`)
      }
    })

    const encoded = encodeAbiParameters(
      types.map((type) => ({ type })),
      values,
    ) as Hex

    return concatHex([bytecode as Hex, encoded])
  } catch (err) {
    console.error('Error encoding constructor args:', err)
    setError('Error encoding constructor arguments. Please check your inputs.')
    return bytecode
  }
}

/** gets a contract's deployment address from a txn receipt.
 *
 * @param txnReceipt
 */
export async function getDeployedAddress(
  txnReceipt: GetTransactionReceiptReturnType,
): Promise<`0x${string}` | undefined> {
  if (txnReceipt) {
    const matchingLog = txnReceipt.logs.find(
      (log: Log) => log.topics[0] === TOPIC0,
    )
    if (matchingLog) {
      const topic = matchingLog.topics[1]!
      return getAddress(`0x${topic.slice(-40)}`)
    }
  }

  return undefined
}

export function isTestNet(chainId: number): boolean {
  return (
    chainId === CHAINS.SEPOLIA ||
    chainId === CHAINS.LINEA_SEPOLIA ||
    chainId === CHAINS.BASE_SEPOLIA ||
    chainId === CHAINS.ARBITRUM_SEPOLIA ||
    chainId === CHAINS.OPTIMISM_SEPOLIA ||
    chainId === CHAINS.SCROLL_SEPOLIA
  )
}

// Safe wallet detection helper
export const checkIfSafe = async (connector: any): Promise<boolean> => {
  try {
    if (!connector) return false

    const connectorProvider: any = await connector?.getProvider()
    if (!connectorProvider) {
      console.log('No connector provider available')
      return false
    }

    const session = connectorProvider?.session
    if (!session) {
      console.log('No session available')
      return false
    }

    const { name: peerName } = session.peer.metadata
    console.log(
      `peerName.startsWith('Safe'): ${peerName.startsWith('Safe')} ${peerName}`,
    )
    return peerName.startsWith('Safe')
  } catch (error) {
    console.error('Error detecting Safe wallet:', error)
    // Don't throw the error, just return false to fall back to regular wallet behavior
    return false
  }
}
