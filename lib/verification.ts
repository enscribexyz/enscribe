import { CONTRACTS, SOURCIFY_API, ETHERSCAN_API, CHAINS } from '@/utils/constants'
import { ethers } from 'ethers'
import reverseRegistrarABI from '@/contracts/ReverseRegistrar'
import publicResolverABI from '../contracts/PublicResolver'

export async function getVerificationData(chainId: string, address: string) {
    let sourcify_verification = 'unverified';

    try {
        console.log("sourcify-api - ", SOURCIFY_API + chainId + "/" + address)
        const res = await fetch(`${SOURCIFY_API}${chainId}/${address.toLowerCase()}`);
        if (res.ok) {
            const data = await res.json();
            if (data) {
                sourcify_verification = data.match || 'unverified';
            }
        }
    } catch (err) {
        console.error('Sourcify fetch failed:', err);
    }

    let etherscan_verification = 'unverified';

    try {
        const etherscanApi = `${ETHERSCAN_API}&chainid=${chainId}&module=contract&action=getabi&address=${address}`
        console.log("etherscan-api - ", etherscanApi)
        const res = await fetch(etherscanApi);
        const data = await res.json();
        if (data.message === "OK") {
            etherscan_verification = "verified"
        }
    } catch (err) {
        console.error('Etherscan fetch failed:', err);
    }

    let blockscout_verification = 'unverified';
    const config = chainId ? CONTRACTS[Number(chainId)] : undefined

    try {
        const blockscoutApi = `${config?.BLOCKSCOUT_URL}api/v2/smart-contracts/${address}`
        console.log("blockscout-api - ", blockscoutApi)
        const res = await fetch(blockscoutApi);
        const data = await res.json();
        if (data.is_verified === true) {
            if (data.is_fully_verified === true) blockscout_verification = 'exact_match';
            else blockscout_verification = 'match';
        }
    } catch (err) {
        console.error('Blockscout fetch failed:', err);
    }

    // let ens_name = ""
    // try {
    //     ens_name = await getENS(chainId, address)
    // } catch (error) {
    //     console.error('ENS primary name fetch failed:', error);
    // }

    return {
        sourcify_verification,
        etherscan_verification,
        blockscout_verification,
        audit_status: "audited",
        attestation_tx_hash: "0xabc123",
        // ens_name
    };
}

export async function triggerVerificationLogic(networkId: string, address: string) {
    // logic to trigger verification
    return {
        sourcify: "req_id",
        etherscan: "req_id",
        attestation: "tx_id"
    };
}


// Use ENS admin - namehash

const getENS = async (chainId: string, addr: string): Promise<string> => {
    const provider = new ethers.JsonRpcProvider(CONTRACTS[Number(chainId)].RPC_ENDPOINT);
    const config = chainId ? CONTRACTS[Number(chainId)] : undefined

    if (Number(chainId) === CHAINS.MAINNET || Number(chainId) === CHAINS.SEPOLIA) {
        try {
            return await provider.lookupAddress(addr) || "";
        } catch {
            return ''
        }
    } else {
        try {
            const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, reverseRegistrarABI, provider);
            const reversedNode = await reverseRegistrarContract.node(addr)
            const resolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, publicResolverABI, provider);
            const name = await resolverContract.name(reversedNode)
            return name || '';
        } catch (error) {
            return ''
        }
    }

}