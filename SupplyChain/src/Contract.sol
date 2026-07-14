// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SupplyChain {

    struct Shipment {
        address currentKey;
        uint256 rotationCount;
        bool active;
        bool completed;
        uint256 registeredAt;
        uint256 lastRotation;
        address lastPillar;
    }


    address public admin;

    mapping(address => bool) public authorizedPillars;
    mapping(uint256 => Shipment) public shipments;


    event PillarAuthorized(address indexed pillar, uint256 timestamp);

    event PillarRevoked(address indexed pillar, uint256 timestamp);

    event ShipmentRegistered(
        uint256 indexed shipmentId,
        address indexed initialKey,
        uint256 timestamp
    );

    event KeyRotated(
        uint256 indexed shipmentId,
        address indexed pillar,
        address oldKey,
        address newKey,
        uint256 rotationCount,
        uint256 timestamp
    );

    event ShipmentCompleted(
        uint256 indexed shipmentId,
        address finalKey,
        uint256 totalRotations,
        uint256 timestamp
    );


    error OnlyAdmin();
    error ZeroAddress();
    error ShipmentAlreadyExists(uint256 shipmentId);
    error ShipmentNotFound(uint256 shipmentId);
    error ShipmentNotActive(uint256 shipmentId);
    error ShipmentAlreadyCompleted(uint256 shipmentId);
    error InvalidSender(address expected, address actual);
    error UnauthorizedPillar(address pillar);
    error InvalidSignature();
    error PillarAlreadyAuthorized(address pillar);
    error PillarNotAuthorized(address pillar);


    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }

    modifier shipmentExists(uint256 shipmentId) {
        if (!shipments[shipmentId].active) revert ShipmentNotFound(shipmentId);
        _;
    }

    modifier shipmentNotCompleted(uint256 shipmentId) {
        if (shipments[shipmentId].completed)
            revert ShipmentAlreadyCompleted(shipmentId);
        _;
    }


    constructor() {
        admin = msg.sender;
    }


    function authorizePillar(
        address pillar
    ) external onlyAdmin validAddress(pillar) {
        if (authorizedPillars[pillar]) revert PillarAlreadyAuthorized(pillar);

        authorizedPillars[pillar] = true;
        emit PillarAuthorized(pillar, block.timestamp);
    }

    function revokePillar(address pillar) external onlyAdmin {
        if (!authorizedPillars[pillar]) revert PillarNotAuthorized(pillar);

        authorizedPillars[pillar] = false;
        emit PillarRevoked(pillar, block.timestamp);
    }

    function registerShipment(
        uint256 shipmentId,
        address initialKey
    ) external onlyAdmin validAddress(initialKey) {
        if (shipments[shipmentId].active) {
            revert ShipmentAlreadyExists(shipmentId);
        }

        shipments[shipmentId] = Shipment({
            currentKey: initialKey,
            rotationCount: 0,
            active: true,
            completed: false,
            registeredAt: block.timestamp,
            lastRotation: block.timestamp,
            lastPillar: address(0)
        });

        emit ShipmentRegistered(shipmentId, initialKey, block.timestamp);
    }

    function completeShipment(
        uint256 shipmentId
    )
        external
        onlyAdmin
        shipmentExists(shipmentId)
        shipmentNotCompleted(shipmentId)
    {
        Shipment storage shipment = shipments[shipmentId];
        shipment.completed = true;

        emit ShipmentCompleted(
            shipmentId,
            shipment.currentKey,
            shipment.rotationCount,
            block.timestamp
        );
    }


    function rotateKey(
        uint256 shipmentId,
        address newKey,
        bytes memory pillarSignature,
        bytes memory sensorSignature
    )
        external
        shipmentExists(shipmentId)
        shipmentNotCompleted(shipmentId)
        validAddress(newKey)
    {
        Shipment storage shipment = shipments[shipmentId];

        bytes32 messageHash = keccak256(
            abi.encodePacked(shipmentId, newKey, shipment.rotationCount)
        );

        address recoveredSensor = recoverSigner(messageHash, sensorSignature);
        if (recoveredSensor != shipment.currentKey) {
            revert InvalidSender(shipment.currentKey, recoveredSensor);
        }

        address recoveredPillar = recoverSigner(messageHash, pillarSignature);
        if (!authorizedPillars[recoveredPillar]) {
            revert UnauthorizedPillar(recoveredPillar);
        }

        address oldKey = shipment.currentKey;
        shipment.currentKey = newKey;
        shipment.rotationCount++;
        shipment.lastRotation = block.timestamp;
        shipment.lastPillar = recoveredPillar;

        emit KeyRotated(
            shipmentId,
            recoveredPillar,
            oldKey,
            newKey,
            shipment.rotationCount,
            block.timestamp
        );
    }


    function recoverSigner(
        bytes32 messageHash,
        bytes memory signature
    ) internal pure returns (address) {
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        address signer = ecrecover(ethSignedMessageHash, v, r, s);
        if (signer == address(0)) revert InvalidSignature();

        return signer;
    }


    function getShipmentInfo(
        uint256 shipmentId
    )
        external
        view
        returns (
            address currentKey,
            uint256 rotationCount,
            bool active,
            bool completed,
            uint256 registeredAt,
            uint256 lastRotation,
            address lastPillar
        )
    {
        Shipment memory shipment = shipments[shipmentId];
        return (
            shipment.currentKey,
            shipment.rotationCount,
            shipment.active,
            shipment.completed,
            shipment.registeredAt,
            shipment.lastRotation,
            shipment.lastPillar
        );
    }

    function isPillarAuthorized(address pillar) external view returns (bool) {
        return authorizedPillars[pillar];
    }

    function getCurrentKey(
        uint256 shipmentId
    ) external view shipmentExists(shipmentId) returns (address) {
        return shipments[shipmentId].currentKey;
    }

    function isShipmentOperational(
        uint256 shipmentId
    ) external view returns (bool) {
        Shipment memory shipment = shipments[shipmentId];
        return shipment.active && !shipment.completed;
    }
}
