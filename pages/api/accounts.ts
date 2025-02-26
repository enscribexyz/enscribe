// pages/api/accounts.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method === 'GET') {
        try {
            const accounts = await prisma.account.findMany({
                include: { contracts: true },
            })
            return res.status(200).json({ accounts })
        } catch (error) {
            console.error('Error fetching accounts:', error)
            return res.status(500).json({ error: 'Error fetching accounts' })
        }
    } else {
        res.setHeader('Allow', ['GET'])
        return res.status(405).json({ error: `Method ${req.method} not allowed` })
    }
}