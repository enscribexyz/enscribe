import type { NextApiRequest, NextApiResponse } from 'next'
import { CONTRACTS } from '@/utils/constants'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chainId } = req.query

  const chainIdNum = parseInt(String(chainId), 10)

  if (isNaN(chainIdNum)) {
    return res
      .status(400)
      .json({ error: `Invalid chainId parameter: ${chainId}` })
  }

  if (!Object.keys(CONTRACTS).includes(chainIdNum.toString())) {
    return res
      .status(404)
      .json({ error: `No config found for chainId ${chainId}` })
  }

  const chainConfig = {
    reverse_registrar_addr: CONTRACTS[chainIdNum].REVERSE_REGISTRAR,
    ens_registry_addr: CONTRACTS[chainIdNum].ENS_REGISTRY,
    public_resolver_addr: CONTRACTS[chainIdNum].PUBLIC_RESOLVER,
    name_wrapper_addr: CONTRACTS[chainIdNum].NAME_WRAPPER,
    enscribe_addr: CONTRACTS[chainIdNum].ENSCRIBE_CONTRACT,
    parent_name: CONTRACTS[chainIdNum].ENSCRIBE_DOMAIN,
  }

  res.status(200).json(chainConfig)
}
