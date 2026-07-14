// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SupplyChain
 * @dev Advanced Cold Chain Ratchet Protocol with enhanced security
 * @notice Production-ready implementation with rotation counter and comprehensive tracking
 *
 * Key Features:
 * - Rotation counter prevents replay attacks
 * - Timestamp tracking for full audit trail
 * - Zero address validation
 * - Shipment completion mechanism
 * - Enhanced event emissions
 */
contract SupplyChain {
    // ============================================================
    // STRUCTS
    // ============================================================

    struct Shipment {
        address currentKey; // Current valid sensor key
        uint256 rotationCount; // Number of rotations performed
        bool active; // Whether shipment is active
        bool completed; // Whether shipment has been delivered
        bool onHold; // Whether shipment is on hold
        uint256 registeredAt; // Timestamp of registration
        uint256 lastRotation; // Timestamp of last rotation
        address lastPillar; // Last pillar that witnessed
        uint256 recordingInterval; // Telemetry logging interval in seconds
    }

    // ============================================================
    // STATE VARIABLES
    // ============================================================

    address public admin;

    mapping(address => bool) public authorizedPillars;
    mapping(uint256 => Shipment) public shipments;

    // ============================================================
    // EVENTS
    // ============================================================

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

    // ============================================================
    // ERRORS
    // ============================================================

    error OnlyAdmin();
    error ZeroAddress();
    error ShipmentAlreadyExists(uint256 shipmentId);
    error ShipmentNotFound(uint256 shipmentId);
    error ShipmentNotActive(uint256 shipmentId);
    error ShipmentAlreadyCompleted(uint256 shipmentId);
    error ShipmentOnHold(uint256 shipmentId);
    error InvalidSender(address expected, address actual);
    error UnauthorizedPillar(address pillar);
    error InvalidSignature();
    error PillarAlreadyAuthorized(address pillar);
    error PillarNotAuthorized(address pillar);

    event ShipmentStatusUpdated(
        uint256 indexed shipmentId,
        bool hold,
        bool completed,
        uint256 timestamp
    );

    // ============================================================
    // MODIFIERS
    // ============================================================

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

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor() {
        admin = msg.sender;
    }

    // ============================================================
    // ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Authorize a pillar (infrastructure node)
     * @param pillar Address of the pillar to authorize
     */
    function authorizePillar(
        address pillar
    ) external onlyAdmin validAddress(pillar) {
        if (authorizedPillars[pillar]) revert PillarAlreadyAuthorized(pillar);

        authorizedPillars[pillar] = true;
        emit PillarAuthorized(pillar, block.timestamp);
    }

    /**
     * @notice Revoke a pillar's authorization
     * @param pillar Address of the pillar to revoke
     */
    function revokePillar(address pillar) external onlyAdmin {
        if (!authorizedPillars[pillar]) revert PillarNotAuthorized(pillar);

        authorizedPillars[pillar] = false;
        emit PillarRevoked(pillar, block.timestamp);
    }

    /**
     * @notice Register a new shipment
     * @param shipmentId Unique identifier for the shipment
     * @param initialKey Initial sensor key for the shipment
     */
    function registerShipment(
        uint256 shipmentId,
        address initialKey,
        uint256 recordingInterval
    ) external onlyAdmin validAddress(initialKey) {
        if (shipments[shipmentId].active) {
            revert ShipmentAlreadyExists(shipmentId);
        }

        shipments[shipmentId] = Shipment({
            currentKey: initialKey,
            rotationCount: 0,
            active: true,
            completed: false,
            onHold: false,
            registeredAt: block.timestamp,
            lastRotation: block.timestamp,
            lastPillar: address(0),
            recordingInterval: recordingInterval
        });

        emit ShipmentRegistered(shipmentId, initialKey, block.timestamp);
    }

    /**
     * @notice Mark a shipment as completed/delivered
     * @param shipmentId The shipment to complete
     */
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

    /**
     * @notice Admin function to update the shipment status directly
     * @param shipmentId Shipment to update
     * @param hold Whether the shipment is on hold
     * @param complete Whether the shipment is completed
     */
    function updateShipmentStatus(
        uint256 shipmentId,
        bool hold,
        bool complete
    ) external onlyAdmin shipmentExists(shipmentId) {
        Shipment storage shipment = shipments[shipmentId];
        shipment.onHold = hold;
        shipment.completed = complete;
        if (complete) {
            shipment.onHold = false;
        }
        emit ShipmentStatusUpdated(shipmentId, hold, complete, block.timestamp);
    }

    // ============================================================
    // CORE PROTOCOL: KEY ROTATION
    // ============================================================

    /**
     * @notice Rotate the sensor key with pillar witness (Meta-Transaction)
     * @dev Message format: keccak256(abi.encodePacked(shipmentId, newKey, rotationCount))
     * @param shipmentId The shipment being handed over
     * @param newKey The new sensor key (post-rotation)
     * @param pillarSignature Signature from authorized pillar
     * @param sensorSignature Signature from current sensor key
     */
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
        if (shipment.onHold) revert ShipmentOnHold(shipmentId);

        // Construct message with rotation counter (prevents replay attacks)
        bytes32 messageHash = keccak256(
            abi.encodePacked(shipmentId, newKey, shipment.rotationCount)
        );

        // 1. Verify Sensor Signature (Meta-Transaction)
        address recoveredSensor = recoverSigner(messageHash, sensorSignature);
        if (recoveredSensor != shipment.currentKey) {
            revert InvalidSender(shipment.currentKey, recoveredSensor);
        }

        // 2. Verify Pillar Signature
        address recoveredPillar = recoverSigner(messageHash, pillarSignature);
        if (!authorizedPillars[recoveredPillar]) {
            revert UnauthorizedPillar(recoveredPillar);
        }

        // Perform rotation
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

    // ============================================================
    // SIGNATURE VERIFICATION
    // ============================================================

    /**
     * @dev Recover signer address from ECDSA signature
     * @param messageHash The hash that was signed
     * @param signature The ECDSA signature (65 bytes)
     * @return The address that created the signature
     */
    function recoverSigner(
        bytes32 messageHash,
        bytes memory signature
    ) internal pure returns (address) {
        // Add Ethereum signed message prefix
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Validate signature length
        if (signature.length != 65) revert InvalidSignature();

        // Split signature into r, s, v components
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        // Adjust v if necessary (some libraries use 0/1 instead of 27/28)
        if (v < 27) {
            v += 27;
        }

        // Recover address using ecrecover
        address signer = ecrecover(ethSignedMessageHash, v, r, s);
        if (signer == address(0)) revert InvalidSignature();

        return signer;
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get comprehensive shipment information
     * @param shipmentId The shipment to query
     * @return currentKey The current sensor key
     * @return rotationCount Number of rotations performed
     * @return active Whether shipment is active
     * @return completed Whether shipment has been delivered
     * @return onHold Whether shipment is on hold
     * @return registeredAt Registration timestamp
     * @return lastRotation Last rotation timestamp
     * @return lastPillar Last witnessing pillar address
     * @return recordingInterval Telemetry recording frequency in seconds
     */
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
            bool onHold,
            uint256 registeredAt,
            uint256 lastRotation,
            address lastPillar,
            uint256 recordingInterval
        )
    {
        Shipment memory shipment = shipments[shipmentId];
        return (
            shipment.currentKey,
            shipment.rotationCount,
            shipment.active,
            shipment.completed,
            shipment.onHold,
            shipment.registeredAt,
            shipment.lastRotation,
            shipment.lastPillar,
            shipment.recordingInterval
        );
    }

    /**
     * @notice Check if a pillar is authorized
     * @param pillar Address to check
     * @return Whether the pillar is authorized
     */
    function isPillarAuthorized(address pillar) external view returns (bool) {
        return authorizedPillars[pillar];
    }

    /**
     * @notice Get current key for a shipment
     * @param shipmentId The shipment to query
     * @return The current sensor key
     */
    function getCurrentKey(
        uint256 shipmentId
    ) external view shipmentExists(shipmentId) returns (address) {
        return shipments[shipmentId].currentKey;
    }

    /**
     * @notice Check if shipment is active and not completed
     * @param shipmentId The shipment to query
     * @return Whether the shipment is active and operational
     */
    function isShipmentOperational(
        uint256 shipmentId
    ) external view returns (bool) {
        Shipment memory shipment = shipments[shipmentId];
        return shipment.active && !shipment.completed;
    }
}
