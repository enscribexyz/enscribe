---
sidebar_position: 4
---

# Frequently Asked Questions

## Why should I use Enscribe?

Ethereum has a thriving DApp ecosystem, but developers and users still rely on smart contract addresses to address contracts. ENS names can be used to name smart contracts, but few take advantage of this functionality. The Enscribe service changes this and enables developers to name their smart contracts at deploy time with no additional coding.

## What networks do you support?

We intend to support all networks that ENS is deployed to including Ethereum, Base and Linea. You can view current deployments on the [Supported Networks](./introduction/supported-networks.md) page.

## How does Enscribe work?

When you deploy a contract using Enscribe it creates a new ENS subname you specify that resolves to the address of the newly deployed contract. Enscribe does this as an atomic transaction, so if contract deployment succeeds you will always have an ENS name you can refer to the contract with.

## Are there restrictions on the types of contracts you support?

Enscribe caters for contracts that implement the [Ownable interface](https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable), or [ERC-173: Contract Ownership Standard](https://eips.ethereum.org/EIPS/eip-173). However, you can use the service to issue names for already deployed contracts.

## What are the risks with the service?

Whilst every effort has been made to ensure that our contracts cannot be exploited, we have yet to have them formally audited whilst we're in beta. The Enscribe service does require an ENS 2LD or subname with operator access, but as long as you retain the Owner privilege, you can always delete subnames issued by the service and revoke the operator access.

## What happens if my domain expires?

Just like with domain names, if your ENS name lapses and someone else takes ownership of it the subnames issued by Enscribe are no longer valid.

## Could it steal my ENS names?

No! Enscribe uses the manager role for an ENS name, you retain full ownership of the ENS name and can choose to override or delete any actions performed by the service.
