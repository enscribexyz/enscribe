// pages/api/contracts.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method === 'POST') {
        const { account, txHash, contractAddress } = req.body

        if (!account || !txHash || !contractAddress) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        try {
            // Upsert the account record: create it if it doesn't exist.
            const upsertedAccount = await prisma.account.upsert({
                where: { id: account },
                update: {},
                create: { id: account },
            })

            const newContract = await prisma.contract.create({
                data: {
                    accountId: upsertedAccount.id,
                    txHash,
                    contractAddress,
                },
            })

            return res.status(200).json({ message: 'Record saved', contract: newContract })
        } catch (error) {
            console.error('Error saving contract:', error)
            return res.status(500).json({ error: 'Error saving contract' })
        }
    } else if (req.method === 'GET') {
        // Optionally, filter by account if provided as a query parameter.
        const { account } = req.query
        try {
            let contracts
            if (account && typeof account === 'string') {
                contracts = await prisma.contract.findMany({
                    where: { accountId: account },
                })
            } else {
                contracts = await prisma.contract.findMany()
            }
            return res.status(200).json({ contracts })
        } catch (error) {
            console.error('Error fetching contracts:', error)
            return res.status(500).json({ error: 'Error fetching contracts' })
        }
    } else {
        res.setHeader('Allow', ['GET', 'POST'])
        return res.status(405).json({ error: `Method ${req.method} not allowed` })
    }
}