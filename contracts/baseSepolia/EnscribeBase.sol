// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import "./ReverseRegistrar.sol" as RR;
import "./Registry.sol" as ER;
import "./L2Resolver.sol" as L2R;
import "../openzeppelin/access/Ownable.sol";

contract EnscribeBase is Ownable {
    address public constant REVERSE_REGISTRAR_ADDRESS =
        0xa0A8401ECF248a9375a0a71C4dedc263dA18dCd7;
    address public constant ENS_REGISTRY_ADDRESS =
        0x1493b2567056c2181630115660963E13A8E32735;
    address public constant L2_RESOLVER_ADDRESS =
        0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA;

    uint256 public pricing = 0.0001 ether;
    string public defaultParent = "test.enscribe.basetest.eth";

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

    // Function to be called when Deploy contract and set primary ENS name
    function setNameAndDeploy(
        bytes memory bytecode,
        string calldata label,
        string calldata parentName,
        bytes32 parentNode
    ) public payable returns (address deployedAddress) {
        bytes32 labelHash = keccak256(bytes(label));
        string memory subname = string(
            abi.encodePacked(label, ".", parentName)
        );
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        uint256 salt = uint256(node);
        deployedAddress = computeAddress(salt, bytecode);

        _deploy(salt, bytecode);

        require(
            setName(deployedAddress, label, parentName, parentNode),
            "Failed to create subname and set forward resolution"
        );

        require(
            _setPrimaryNameForContract(
                deployedAddress,
                address(this),
                L2_RESOLVER_ADDRESS,
                subname
            ),
            "failed to set primary name"
        );
        emit SetPrimaryNameSuccess(deployedAddress, subname);

        _transferContractOwnership(deployedAddress, msg.sender);
        emit ContractOwnershipTransferred(deployedAddress, msg.sender);

        require(
            msg.value >= pricing,
            "Insufficient Ether Sent: Check the pricing"
        );
        emit EtherReceived(msg.sender, msg.value);
    }

    // Function to be called when contract is already deployed and just set forward resolve ENS name
    function setName(
        address contractAddress,
        string calldata label,
        string calldata parentName,
        bytes32 parentNode
    ) public payable returns (bool success) {
        bytes32 labelHash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(parentNode, labelHash));
        string memory subname = string(
            abi.encodePacked(label, ".", parentName)
        );
        success = false;
        if (
            keccak256(abi.encodePacked(parentName)) !=
            keccak256(abi.encodePacked(defaultParent))
        ) {
            require(
                _isSenderOwnerUnwrapped(parentNode),
                "Sender is not the owner of Unwrapped parent node, can't create subname"
            );
        }
        require(
            _createSubnameUnwrapped(
                parentNode,
                labelHash,
                address(this),
                L2_RESOLVER_ADDRESS,
                uint64(0)
            ),
            "Failed to create subname, check if contract is given isApprovedForAll role for Unwrapped Name"
        );
        emit SubnameCreated(parentNode, label);

        require(_setAddr(node, contractAddress), "failed to setAddr");
        emit SetAddrSuccess(contractAddress, subname);

        require(
            msg.value >= pricing,
            "Insufficient Ether Sent: Check the pricing"
        );
        emit EtherReceived(msg.sender, msg.value);

        success = true;
    }

    function _deploy(
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

    function _transferContractOwnership(
        address contractAddress,
        address owner
    ) private {
        (bool success, ) = contractAddress.call(
            abi.encodeWithSignature("transferOwnership(address)", owner)
        );
        require(success, "Ownership transfer failed");
    }

    function _setPrimaryNameForContract(
        address contractAddr,
        address owner,
        address resolver,
        string memory subName
    ) private returns (bool success) {
        RR.ReverseRegistrar reverseRegistrar = RR.ReverseRegistrar(
            REVERSE_REGISTRAR_ADDRESS
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

    function _createSubnameUnwrapped(
        bytes32 parentNode,
        bytes32 labelHash,
        address owner,
        address resolver,
        uint64 ttl
    ) private returns (bool success) {
        ER.Registry ensRegistry = ER.Registry(ENS_REGISTRY_ADDRESS);
        try
            ensRegistry.setSubnodeRecord(
                parentNode,
                labelHash,
                owner,
                resolver,
                ttl
            )
        {
            success = true;
        } catch {
            success = false;
        }
    }

    function _setAddr(bytes32 node, address a) private returns (bool success) {
        L2R.L2Resolver l2ResolverContract = L2R.L2Resolver(L2_RESOLVER_ADDRESS);
        try l2ResolverContract.setAddr(node, a) {
            success = true;
        } catch {
            success = false;
        }
    }

    function _isSenderOwnerUnwrapped(
        bytes32 parentNode
    ) private view returns (bool) {
        return
            ER.Registry(ENS_REGISTRY_ADDRESS).owner(parentNode) == msg.sender;
    }

    function updatePricing(uint256 updatedPrice) public onlyOwner {
        require(updatedPrice > 0, "Price must be greater than zero");
        pricing = updatedPrice;
    }

    function updateDefaultParent(
        string calldata updatedParent
    ) public onlyOwner {
        defaultParent = updatedParent;
    }

    /**
     * @dev To withdraw received Ether.
     */
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /**
     * @dev Fallback function to accept Ether.
     */
    receive() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    /**
     * @dev Fallback function to accept calls without data.
     */
    fallback() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }
}
