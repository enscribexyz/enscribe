import { uniqueNamesGenerator, Config, adjectives, colors, animals } from 'unique-names-generator';
import { NextApiRequest, NextApiResponse } from 'next';

const customConfig: Config = {
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 3,
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method === 'GET') {
        const name: string = uniqueNamesGenerator(customConfig);
        return res.status(200).send(name)
    }

    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'POST not allowed' });
}
