import {
  uniqueNamesGenerator,
  Config,
  adjectives,
  colors,
  animals,
} from 'unique-names-generator'
import { NextApiRequest, NextApiResponse } from 'next'
import { nouns } from '@/utils/constants'

const customConfig: Config = {
  dictionaries: [adjectives, nouns],
  separator: '-',
  length: 2,
}

function generateFourDigitNumber(): number {
  return Math.floor(1000 + Math.random() * 9000)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const name: string = `${uniqueNamesGenerator(customConfig)}-${generateFourDigitNumber()}`
    return res.status(200).send(name)
  }

  res.setHeader('Allow', ['GET'])
  return res.status(405).json({ error: 'POST not allowed' })
}
