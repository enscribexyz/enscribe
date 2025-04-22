// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IENSRegistry {
    function owner(bytes32 node) external view returns (address);

    function resolver(bytes32 node) external view returns (address);

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) external;

    function setOwner(bytes32 node, address owner) external;
}

interface INameWrapper {
    function ownerOf(uint256 tokenId) external view returns (address);

    function isWrapped(bytes32 node) external view returns (bool);

    function setSubnodeRecord(
        bytes32 node,
        string calldata label,
        address owner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) external;
}

interface IReverseRegistrar {
    function setNameForAddr(
        address addr,
        address owner,
        address resolver,
        string calldata name
    ) external;

    function node(address addr) external view returns (bytes32);
}

interface IPublicResolver {
    function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external;

    function setAddr(bytes32 node, address a) external;

    function setName(bytes32 node, string calldata newName) external;
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC1155Receiver is IERC165 {
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external returns (bytes4);

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external returns (bytes4);
}

contract Enscribe is Ownable, IERC1155Receiver {
    IReverseRegistrar public reverseRegistrar;
    IENSRegistry public ensRegistry;
    INameWrapper public nameWrapper;

    uint256 public pricing;
    string public defaultParent;

    event ContractDeployed(address contractAddress);
    event SubnameCreated(bytes32 parentHash, string label);
    event SetAddrSuccess(address indexed contractAddress, string subname);
    event SetPrimaryNameSuccess(
        address indexed deployedAddress,
        string subname
    );
    event ContractOwnershipTransferred(address deployedAddress, address owner);
    event EtherReceived(address sender, uint256 amount);

    /**
     * @dev Constructor initializes ENS-related contracts and default settings.
     */
    constructor(
        address _reverseRegistrar,
        address _ensRegistry,
        address _nameWrapper,
        string memory _defaultParent,
        uint256 _pricing
    ) Ownable(msg.sender) {
        reverseRegistrar = IReverseRegistrar(_reverseRegistrar);
        ensRegistry = IENSRegistry(_ensRegistry);
        nameWrapper = INameWrapper(_nameWrapper);
        defaultParent = _defaultParent;
        pricing = _pricing;
    }

    // ------------------ Admin Setters ------------------

    function setReverseRegistrar(address _addr) external onlyOwner {
        reverseRegistrar = IReverseRegistrar(_addr);
    }

    function setENSRegistry(address _addr) external onlyOwner {
        ensRegistry = IENSRegistry(_addr);
    }

    function setNameWrapper(address _addr) external onlyOwner {
        nameWrapper = INameWrapper(_addr);
    }

    function updatePricing(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be > 0");
        pricing = newPrice;
    }

    function updateDefaultParent(string calldata newParent) external onlyOwner {
        defaultParent = newParent;
    }

    function withdraw() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }

    // ------------------ Core Logic ------------------

    /**
     * @dev Computes CREATE2 deterministic address.
     */
    function computeAddress(
        uint256 salt,
        bytes memory bytecode
    ) public view returns (address) {
        bytes32 bytecodeHash = keccak256(bytecode);
        bytes32 saltHash = keccak256(abi.encodePacked(salt));
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                address(this),
                                saltHash,
                                bytecodeHash
                            )
                        )
                    )
                )
            );
    }

    /**
     * @dev Deploys a contract, create subname and set ENS as primary name.
     */
    function setNameAndDeploy(
        bytes memory bytecode,
        string calldata label,
        string calldata parentName,
        bytes32 parentNode
    ) public payable returns (address deployedAddress) {
        require(msg.value >= pricing, "Insufficient ETH");

        bytes32 labelHash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        string memory subname = string(
            abi.encodePacked(label, ".", parentName)
        );
        deployedAddress = computeAddress(uint256(node), bytecode);

        _deploy(uint256(node), bytecode);

        require(
            setName(deployedAddress, label, parentName, parentNode),
            "Failed to create subname and set forward resolution"
        );

        require(
            _setPrimaryName(
                deployedAddress,
                subname,
                address(getResolver(node))
            ),
            "Failed to set primary name"
        );
        emit SetPrimaryNameSuccess(deployedAddress, subname);

        _transferContractOwnership(deployedAddress, msg.sender);
        emit ContractOwnershipTransferred(deployedAddress, msg.sender);

        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @dev Sets the ENS subname and forward resolution for a deployed contract.
     */
    function setName(
        address contractAddress,
        string calldata label,
        string calldata parentName,
        bytes32 parentNode
    ) public payable returns (bool success) {
        require(msg.value >= pricing, "Insufficient ETH");

        bytes32 labelHash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        string memory subname = string(
            abi.encodePacked(label, ".", parentName)
        );

        require(
            _isDefaultParent(parentName) || _isSenderOwner(parentNode),
            "Sender is not the owner of parent node"
        );
        require(
            _createSubname(parentNode, label, labelHash),
            "Subname creation failed"
        );
        emit SubnameCreated(parentNode, label);

        require(
            _setAddr(node, 60, abi.encodePacked(contractAddress)),
            "setAddr, forward resolution failed"
        );
        emit SetAddrSuccess(contractAddress, subname);

        emit EtherReceived(msg.sender, msg.value);
        return true;
    }

    /**
     * @dev Deploys contract and sets primary name using node. Doesn't create new subname
     */
    function setNameAndDeployWithoutLabel(
        bytes memory bytecode,
        string calldata ensName,
        bytes32 node
    ) public payable returns (address deployedAddress) {
        require(msg.value >= pricing, "Insufficient ETH");

        deployedAddress = computeAddress(uint256(node), bytecode);
        _deploy(uint256(node), bytecode);

        require(_isSenderOwner(node), "Sender is not the owner of node");

        require(
            _setAddr(node, 60, abi.encodePacked(deployedAddress)),
            "setAddr, forward resolution failed"
        );
        emit SetAddrSuccess(deployedAddress, ensName);

        require(
            _setPrimaryName(
                deployedAddress,
                ensName,
                address(getResolver(node))
            ),
            "Failed to set primary name"
        );
        emit SetPrimaryNameSuccess(deployedAddress, ensName);

        _transferContractOwnership(deployedAddress, msg.sender);
        emit ContractOwnershipTransferred(deployedAddress, msg.sender);

        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @dev Deploys contract and sets primary name using reverse node. For contracts extending ReverseClaimable
     */
    function setNameAndDeployReverseClaimer(
        bytes memory bytecode,
        string calldata label,
        string calldata parentName,
        bytes32 parentNode
    ) public payable returns (address deployedAddress) {
        require(msg.value >= pricing, "Insufficient ETH");

        bytes32 labelHash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        string memory subname = string(
            abi.encodePacked(label, ".", parentName)
        );

        deployedAddress = computeAddress(uint256(node), bytecode);
        _deploy(uint256(node), bytecode);

        require(
            _isDefaultParent(parentName) || _isSenderOwner(parentNode),
            "Sender is not the owner of parent node"
        );
        require(
            _createSubname(parentNode, label, labelHash),
            "Subname creation failed"
        );
        emit SubnameCreated(parentNode, label);

        bytes32 reverseNode = reverseRegistrar.node(deployedAddress);
        getResolver(reverseNode).setName(reverseNode, subname);
        emit SetPrimaryNameSuccess(deployedAddress, subname);

        require(
            _setAddr(node, 60, abi.encodePacked(deployedAddress)),
            "setAddr, forward resolution failed"
        );
        emit SetAddrSuccess(deployedAddress, subname);

        ensRegistry.setOwner(reverseNode, msg.sender);
        emit ContractOwnershipTransferred(deployedAddress, msg.sender);

        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @dev Deploys contract and sets primary name during deployment. For contracts extending ReverseSetter
     */
    function setNameAndDeployReverseSetter(
        bytes memory bytecode,
        string calldata label,
        string calldata parentName,
        bytes32 parentNode
    ) public payable returns (address deployedAddress) {
        require(msg.value >= pricing, "Insufficient ETH");

        bytes32 labelHash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        string memory subname = string(
            abi.encodePacked(label, ".", parentName)
        );

        require(
            _isDefaultParent(parentName) || _isSenderOwner(parentNode),
            "Sender is not the owner of parent node"
        );
        require(
            _createSubname(parentNode, label, labelHash),
            "Subname creation failed"
        );
        emit SubnameCreated(parentNode, label);

        deployedAddress = computeAddress(uint256(node), bytecode);
        _deploy(uint256(node), bytecode);

        require(
            _setAddr(node, 60, abi.encodePacked(deployedAddress)),
            "setAddr, forward resolution failed"
        );
        emit SetAddrSuccess(deployedAddress, subname);

        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @dev Internal: Deploy contract with CREATE2.
     */
    function _deploy(
        uint256 salt,
        bytes memory bytecode
    ) private returns (address deployed) {
        require(bytecode.length > 0, "Empty bytecode");
        bytes32 saltHash = keccak256(abi.encodePacked(salt));
        assembly {
            deployed := create2(
                0,
                add(bytecode, 0x20),
                mload(bytecode),
                saltHash
            )
        }
        require(deployed != address(0), "Deployment failed");
        emit ContractDeployed(deployed);
    }

    /**
     * @dev Internal: Transfers ownership of deployed contract using `transferOwnership`.
     */
    function _transferContractOwnership(
        address contractAddress,
        address newOwner
    ) private {
        (bool success, ) = contractAddress.call(
            abi.encodeWithSignature("transferOwnership(address)", newOwner)
        );
        require(success, "Ownership transfer failed");
    }

    /**
     * @dev Internal: Set reverse record for deployed contract.
     */
    function _setPrimaryName(
        address addr,
        string memory name,
        address resolver
    ) private returns (bool) {
        try
            reverseRegistrar.setNameForAddr(addr, address(this), resolver, name)
        {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Internal: Creates ENS subname under given parent.
     */
    function _createSubname(
        bytes32 parentNode,
        string calldata label,
        bytes32 labelHash
    ) private returns (bool) {
        if (checkWrapped(parentNode)) {
            nameWrapper.setSubnodeRecord(
                parentNode,
                label,
                address(this),
                address(getResolver(parentNode)),
                0,
                0,
                0
            );
        } else {
            ensRegistry.setSubnodeRecord(
                parentNode,
                labelHash,
                address(this),
                address(getResolver(parentNode)),
                0
            );
        }
        return true;
    }

    /**
     * @dev Internal: Sets address record, forward resolution.
     */
    function _setAddr(
        bytes32 node,
        uint256 coinType,
        bytes memory addrBytes
    ) private returns (bool) {
        try getResolver(node).setAddr(node, coinType, addrBytes) {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Internal: Returns whether the ENS name is wrapped.
     */
    function checkWrapped(bytes32 node) public view returns (bool) {
        try nameWrapper.isWrapped(node) returns (bool wrapped) {
            return wrapped;
        } catch {
            return false;
        }
    }

    /**
     * @dev Internal: Verifies if the caller is owner of the given node.
     */
    function _isSenderOwner(bytes32 node) private view returns (bool) {
        return
            checkWrapped(node)
                ? nameWrapper.ownerOf(uint256(node)) == msg.sender
                : ensRegistry.owner(node) == msg.sender;
    }

    /**
     * @dev Checks if the given parentName equals defaultParent.
     */
    function _isDefaultParent(
        string calldata parent
    ) private view returns (bool) {
        return keccak256(bytes(parent)) == keccak256(bytes(defaultParent));
    }

    /**
     * @dev Returns the Resolver address for given ENS node
     */
    function getResolver(bytes32 node) internal view returns (IPublicResolver) {
        return IPublicResolver(ensRegistry.resolver(node));
    }

    // ------------------ ERC1155 Receiver & Fallback ------------------

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    receive() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    fallback() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }
}
