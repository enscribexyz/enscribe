import React from 'react'
import Layout from '../components/Layout'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Link } from 'lucide-react'

export default function Home() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center px-6">
        {/* Logo & Branding */}
        <div className="flex items-center space-x-3 mb-6">
          {/* SVG Logo */}
          <svg
            width="40"
            height="40"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="32" height="32" rx="4" fill="#151A2D" />
            <path
              d="M10 12L6 16L10 20"
              stroke="#4DB8E8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M22 12L26 16L22 20"
              stroke="#4DB8E8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18 10L14 22"
              stroke="#4DB8E8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Brand Name */}
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Enscribe
          </h2>
        </div>

        {/* Main Content Card */}
        <Card className="w-full max-w-5xl shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white text-center">
              Name Your Smart Contracts
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6 space-y-4 text-gray-700 leading-relaxed">
            <p>
              Enscribe is here to increase trust for users of Ethereum. By
              getting everyone to name their smart contracts with ENS names,
              users stop being confronted with meaningless hex and instead see
              ENS names such as
              <a
                href="https://app.ens.domains/v0.app.enscribe.eth"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline mx-1"
              >
                v0.app.enscribe.eth
              </a>
              when transacting with an app.
            </p>

            <div>
              <p>You can use the Enscribe app to:</p>
              <ul className="list-disc list-inside mt-2">
                <li>
                  <a
                    href="/deploy"
                    className="text-blue-600 hover:underline mx-1"
                  >
                    Deploy smart contracts with ENS name
                  </a>
                </li>
                <li>
                  <a
                    href="/nameContract"
                    className="text-blue-600 hover:underline mx-1"
                  >
                    Name existing contract with ENS name
                  </a>
                </li>
                <li>
                  <a
                    href="/history"
                    className="text-blue-600 hover:underline mx-1"
                  >
                    View contracts you’ve deployed that can be named
                  </a>
                </li>
              </ul>
            </div>

            <p>
              Naming contracts is the first step in improving the safety of
              Ethereum for users. Coming soon are verifications to further
              enhance the safety and UX.
            </p>

            <p className="font-medium">Happy naming!</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
