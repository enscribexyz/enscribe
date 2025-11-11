import { createPublicClient, http, getAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import { namehash, encodeFunctionData, WalletClient } from "viem";
import { writeContract, readContract } from 'viem/actions'

const registrarControllerAbi = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "registerPrice",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }, { name: "duration", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "owner", type: "address" },
          { name: "duration", type: "uint256" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "bool" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const resolverAbi = [
  // setAddr(node, coinType, addr)
  {
    type: "function",
    name: "setAddr",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "coinType", type: "uint256" },
      { name: "a", type: "bytes" },
    ],
    outputs: [],
  },
];

const reverseAbi = [
  // setNameForAddr(addr, owner, resolver, name)
  {
    type: "function",
    name: "setNameForAddr",
    stateMutability: "nonpayable",
    inputs: [
      { name: "addr", type: "address" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "name", type: "string" },
    ],
    outputs: [],
  },
] as const;

// Base mainnet (8453)
const BASE_ADDRESSES = {
  registrarController: "0x4cCb0BB02FCABA27e82A56646E81d8c5bC4119a5",
  resolver: "0xC6d566A56A1aFf6508B41f6C90Ff131615583BCD",
  reverseRegistrar: "0x79EA96012eEa67A83431F1701B3dFf7e37F9E282",
} as const;

// Base Sepolia testnet (84532)
const BASE_SEPOLIA_ADDRESSES = {
  registrarController: "0x49ae3cc2e3aa768b1e5654f5d3c6002144a59581",
  resolver: "0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA",
  reverseRegistrar: "0x876eF94ce0773052a2f81921E70FF25a5e76841f",
} as const;

export function splitBasename(input: string) {
  const lower = input.trim().toLowerCase();
  let suffix: ".base.eth" | ".basetest.eth" | null = null;

  if (lower.endsWith(".base.eth")) {
    suffix = ".base.eth";
  } else if (lower.endsWith(".basetest.eth")) {
    suffix = ".basetest.eth";
  }

  if (!suffix) {
    throw new Error("Name must end with .base.eth or .basetest.eth");
  }

  const label = lower.slice(0, -suffix.length);
  if (!label) throw new Error("Invalid label");
  return { label, fqdn: lower };
}

const COIN_TYPE_ETH = 60;

// Bytes helper for setAddr(…, bytes)
function evmAddrToBytes(addr: `0x${string}`) {
  return new Uint8Array(Buffer.from(addr.slice(2), "hex"));
}

type Network = "base" | "base-sepolia";

/**
 * Ensures a basename exists and sets it as the L2 Primary Name (reverse) for `targetAddr`.
 * If `label` does not exist, registers it for 1 year and wires resolver + reverse in one go.
 *
 * `targetAddr` can be an EOA or a CONTRACT address. For contracts, your signer must be the Ownable owner.
 */
export async function setBasenameAsPrimary({
  rpcUrl,
  walletClient,      // viem wallet client
  network,           // "base" | "base-sepolia"
  inputName,         // e.g. "abhi.base.eth"
  targetAddr,        // address whose primary name you want to set (EOA or contract)
}: {
  rpcUrl: string;
  walletClient: WalletClient;
  network: Network;
  inputName: string;
  targetAddr: `0x${string}`;
}) {
  const chain = network === "base" ? base : baseSepolia;
  const addrs = network === "base" ? BASE_ADDRESSES : BASE_SEPOLIA_ADDRESSES;

  const pub = createPublicClient({ chain, transport: http(rpcUrl) });

  const { label, fqdn } = splitBasename(inputName);
  const node = namehash(fqdn);

  // 1) If missing: register it for 1 year, set resolver, set reverse in the same tx
  // (Reverse is set to `targetAddr` owner’s reverse; for contracts, signer must Ownable-own `targetAddr`)
  let didRegister = false;

  const isAvailable = await readContract(walletClient, {
      address: addrs.registrarController as `0x${string}`,
      abi: registrarControllerAbi,
      functionName: "available",
      args: [label],
  }) as boolean;
  
  if (isAvailable) {
      const duration = 365n * 24n * 60n * 60n; // 1 year
      const price = await readContract(walletClient, {
          address: addrs.registrarController as `0x${string}`,
          abi: registrarControllerAbi,
          functionName: "registerPrice",
          args: [label, duration],
      });
  
      // prepare multicallable data for resolver: setAddr(node, 60, targetAddr)
      // We do this *at registration time* so forward resolution matches reverse.
      const setAddrCalldata = {
          to: addrs.resolver as `0x${string}`,
          data: (await encodeFunctionData({
              abi: resolverAbi,
              functionName: "setAddr",
              args: [node, BigInt(COIN_TYPE_ETH), evmAddrToBytes(targetAddr)],
          })) as `0x${string}`,
      };
  
      await writeContract(walletClient, {
          address: addrs.registrarController as `0x${string}`,
          abi: registrarControllerAbi,
          functionName: 'register',
          args: [
              {
                  name: label,
                  owner: getAddress(targetAddr),
                  duration,
                  resolver: addrs.resolver,
                  data: [setAddrCalldata.data],
                  reverseRecord: true, // <-- sets L2 Primary Name during registration
              },
          ],
          value: price, // pay registerPrice() (wei)
          account: walletClient.account?.address as `0x${string}`,
          chain: chain,
      });
  
      didRegister = true;
  }

  // 2) If the name already existed (or you want to force), ensure reverse is set now
  //    This covers the “already registered” path and also works to set primary for a CONTRACT.
  if (!didRegister) {
    // (Re)ensure forward record points to targetAddr
    const encoded = await pub.readContract({
      // quick existence check: just attempt a call to resolver at the node;
      // if you maintain your own logic you can skip this and always setAddr.
      address: addrs.resolver as `0x${string}`,
      abi: resolverAbi,
      functionName: "setAddr",
      // we won't actually call; just using encode in write below
      args: [node, BigInt(COIN_TYPE_ETH), evmAddrToBytes(targetAddr)],
    }).catch(() => null);

    // set forward (idempotent) then reverse
    await writeContract(walletClient, {
      chain,
      address: addrs.resolver as `0x${string}`,
      abi: resolverAbi,
      functionName: "setAddr",
      args: [node, BigInt(COIN_TYPE_ETH), evmAddrToBytes(targetAddr)],
      account: walletClient.account?.address as `0x${string}`,
    });

    await writeContract(walletClient, {
      chain,
      address: addrs.reverseRegistrar as `0x${string}`,
      abi: reverseAbi,
      functionName: "setNameForAddr",
      args: [getAddress(targetAddr), getAddress(targetAddr), addrs.resolver, fqdn],
      account: walletClient.account?.address as `0x${string}`,
    });
  }

  return { fqdn, didRegister };
}
