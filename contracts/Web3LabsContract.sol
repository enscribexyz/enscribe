// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import "./ReverseRegistrar.sol" as RR;
import "./NameWrapper.sol" as NW;
import "./PublicResolver.sol" as PR;
import "./openzeppelin/token/ERC1155/IERC1155Receiver.sol";

contract Web3LabsContract is IERC1155Receiver {
    address public reverseRegistrarAddress =
        0xCF75B92126B02C9811d8c632144288a3eb84afC8;
    address public nameWrapperAddress =
        0x0635513f179D50A207757E05759CbD106d7dFcE8;
    address public publicResolverAddress =
        0x8948458626811dd0c23EB25Cc74291247077cC51;

    event ContractDeployed(address contractAddress);
    event SubnameCreated(bytes32 parentHash, string label);
    event SetAddrSuccess(bytes32 subnameHash, bytes encodedAddress);
    event SetPrimaryNameSuccess(address deployedAddress, string subname);
    event ContractOwnershipTransferred(address deployedAddress, address owner);
    event NameOwnershipTransferred(uint256 parentTokenId, address owner);

    /**
     * @notice Compute the address of a contract deployed via CREATE2
     * @param salt A user-defined value to influence the deterministic address
     * @param bytecode The bytecode of the contract to deploy
     * @return computedAddress The deterministic address of the contract
     */
    function computeAddress(
        uint256 salt,
        bytes memory bytecode
    ) public view returns (address computedAddress) {
        bytes32 bytecodeHash = keccak256(bytecode);
        bytes32 saltEncoded = keccak256(abi.encodePacked(salt));
        computedAddress = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            saltEncoded,
                            bytecodeHash
                        )
                    )
                )
            )
        );
    }

    function setNameAndDeploy(
        bytes memory bytecode,
        string calldata label,
        string calldata parentName,
        bytes32 parentNode
    ) public {
        bytes32 labelHash = keccak256(bytes(label));
        string memory subname = string(
            abi.encodePacked(label, ".", parentName)
        );
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        uint256 salt = uint256(node);

        require(
            createSubname(
                parentNode,
                label,
                address(this),
                publicResolverAddress,
                uint64(0),
                uint32(0),
                uint64(0)
            ),
            "Failed to create subname"
        );
        emit SubnameCreated(parentNode, label);

        address deployedAddress = computeAddress(salt, bytecode);
        bytes memory encodedAddress = abi.encodePacked(deployedAddress);
        require(
            setAddr(node, uint256(60), encodedAddress),
            "failed to setAddr"
        );
        emit SetAddrSuccess(node, encodedAddress);

        deploy(salt, bytecode);

        require(
            setPrimaryNameForContract(
                deployedAddress,
                address(this),
                publicResolverAddress,
                subname
            ),
            "failed to set primary name"
        );
        emit SetPrimaryNameSuccess(deployedAddress, subname);

        transferContractOwnership(deployedAddress, msg.sender);
        emit ContractOwnershipTransferred(deployedAddress, msg.sender);

        transferNameOwnership(uint256(parentNode), msg.sender);
        emit NameOwnershipTransferred(uint256(parentNode), msg.sender);
    }

    /**
     * @notice Deploy a new contract using CREATE2
     * @param salt A user-defined value to influence the deterministic address
     * @param bytecode The bytecode of the contract to deploy
     * @return deployedAddress The address of the deployed contract
     */
    function deploy(
        uint256 salt,
        bytes memory bytecode
    ) private returns (address deployedAddress) {
        require(bytecode.length != 0, "Bytecode cannot be empty");
        bytes32 saltEncoded = keccak256(abi.encodePacked(salt));
        assembly {
            deployedAddress := create2(
                0,
                add(bytecode, 0x20),
                mload(bytecode),
                saltEncoded
            )
        }

        require(deployedAddress != address(0), "Contract deployment failed");
        emit ContractDeployed(deployedAddress);
    }

    function transferContractOwnership(
        address deployedAddress,
        address owner
    ) private {
        (bool success, ) = deployedAddress.call(
            abi.encodeWithSignature("transferOwnership(address)", owner)
        );
        require(success, "Ownership transfer failed");
    }

    function setPrimaryNameForContract(
        address contractAddr,
        address owner,
        address resolver,
        string memory subName
    ) private returns (bool success) {
        RR.ReverseRegistrar reverseRegistrar = RR.ReverseRegistrar(
            reverseRegistrarAddress
        );
        try
            reverseRegistrar.setNameForAddr(
                contractAddr,
                owner,
                resolver,
                subName
            )
        {
            success = true;
        } catch {
            success = false;
        }
    }

    function createSubname(
        bytes32 parentNode,
        string calldata label,
        address owner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) private returns (bool success) {
        NW.NameWrapper nameWrapper = NW.NameWrapper(nameWrapperAddress);
        try
            nameWrapper.setSubnodeRecord(
                parentNode,
                label,
                owner,
                resolver,
                ttl,
                fuses,
                expiry
            )
        {
            success = true;
        } catch {
            success = false;
        }
    }

    function setAddr(
        bytes32 node,
        uint256 coinType,
        bytes memory a
    ) private returns (bool success) {
        PR.PublicResolver publicResolverContract = PR.PublicResolver(
            publicResolverAddress
        );
        try publicResolverContract.setAddr(node, coinType, a) {
            success = true;
        } catch {
            success = false;
        }
    }

    function transferNameOwnership(uint256 tokenId, address claimer) private {
        NW.NameWrapper nameWrapper = NW.NameWrapper(nameWrapperAddress);
        nameWrapper.safeTransferFrom(
            address(this),
            claimer,
            tokenId,
            uint256(1),
            new bytes(0)
        );
    }

    /**
     * @dev Handles the receipt of a single ERC1155 token type.
     * This function is called at the end of a `safeTransferFrom` after the balance has been updated.
     * @return bytes4 Returns `IERC1155Receiver.onERC1155Received.selector` if the transfer is allowed.
     */
    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external pure override returns (bytes4) {
        // Accept the transfer
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /**
     * @dev Handles the receipt of multiple ERC1155 token types.
     * This function is called at the end of a `safeBatchTransferFrom` after the balances have been updated.
     * @return bytes4 Returns `IERC1155Receiver.onERC1155BatchReceived.selector` if the transfer is allowed.
     */
    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external pure override returns (bytes4) {
        // Accept the transfer
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
