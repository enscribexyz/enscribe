import type { NextApiRequest, NextApiResponse } from 'next';
import {CONTRACTS} from "@/utils/constants";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    const { chainId} = req.query;

    console.log(typeof chainId)

    if (typeof chainId === "string") {
        const chainIdNum = parseInt(String(chainId), 10)

        if (isNaN(chainIdNum)) {
            return res.status(400).json({error: 'Invalid chainId parameter'});
        }

        const chainConfig = {
            reverse_registrar_addr: CONTRACTS[chainId].REVERSE_REGISTRAR,
            ens_registry_addr: CONTRACTS[chainId].ENS_REGISTRY,
            public_resolver_addr: CONTRACTS[chainId].PUBLIC_RESOLVER,
            name_wrapper_addr: CONTRACTS[chainId].NAME_WRAPPER,
            enscribe_addr: CONTRACTS[chainId].ENSCRIBE_CONTRACT,
            parent_name: CONTRACTS[chainId].ENSCRIBE_DOMAIN,
        }

        if (!chainConfig) {
            return res.status(404).json({error: `No config found for chainId ${chainId}`});
        }

        res.status(200).json(chainConfig);
    }

    return res.status(400).json({error: 'Invalid chainId parameter'});
}
