// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ColdChainRatchet
 * @dev Enforces cryptographic key rotation for cold chain custody tracking
 * @notice Patent-pending protocol: Assets prove physical location via infrastructure signatures
 *
 * Architecture:
 * - Pillars (Infrastructure): Static whitelisted addresses that witness asset location
 * - Sensors (Assets): Dynamic addresses with forward secrecy via key rotation
 *
 * Security Model:
 * - Only authorized pillars can witness handovers
 * - Only the current valid sensor key can trigger rotation
 * - Each successful handover rotates the sensor key (Identity Ratchet)
 */
contract ColdChainRatchet {
    // ============================================================
    // STATE VARIABLES
    // ============================================================

    /// @dev Maps pillar address => authorization status
    mapping(address => bool) public authorizedPillars;

    /// @dev Maps shipmentId => current valid public key of the sensor
    mapping(uint256 => address) public shipmentCurrentKey;

    /// @dev Contract owner (admin) for pillar management
    address public admin;

    /// @dev Tracks if a shipment has been registered
    mapping(uint256 => bool) public shipmentActive;

    // ============================================================
    // EVENTS
    // ============================================================

    /// @notice Emitted when a shipment is registered with its first key
    event ShipmentRegistered(
        uint256 indexed shipmentId,
        address indexed initialKey,
        uint256 timestamp
    );

    /// @notice Emitted when custody is verified and key is rotated
    event HandoverComplete(
        uint256 indexed shipmentId,
        address indexed pillar,
        address indexed oldKey,
        address newKey,
        uint256 timestamp
    );

    /// @notice Emitted when a pillar is added to whitelist
    event PillarAuthorized(address indexed pillar);

    /// @notice Emitted when a pillar is removed from whitelist
    event PillarRevoked(address indexed pillar);

    // ============================================================
    // ERRORS
    // ============================================================

    error UnauthorizedPillar(address pillar);
    error InvalidSender(address expected, address actual);
    error ShipmentAlreadyRegistered(uint256 shipmentId);
    error ShipmentNotActive(uint256 shipmentId);
    error InvalidSignature();
    error OnlyAdmin();

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
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
     * @notice Add a pillar (infrastructure node) to the whitelist
     * @param pillar The address of the infrastructure node to authorize
     */
    function authorizePillar(address pillar) external onlyAdmin {
        authorizedPillars[pillar] = true;
        emit PillarAuthorized(pillar);
    }

    /**
     * @notice Remove a pillar from the whitelist
     * @param pillar The address to revoke
     */
    function revokePillar(address pillar) external onlyAdmin {
        authorizedPillars[pillar] = false;
        emit PillarRevoked(pillar);
    }

    /**
     * @notice Register a new shipment with its initial sensor key
     * @dev This starts the chain of custody tracking
     * @param shipmentId Unique identifier for the shipment
     * @param firstKey The initial public key of the sensor device
     */
    function registerShipment(
        uint256 shipmentId,
        address firstKey
    ) external onlyAdmin {
        if (shipmentActive[shipmentId]) {
            revert ShipmentAlreadyRegistered(shipmentId);
        }

        shipmentActive[shipmentId] = true;
        shipmentCurrentKey[shipmentId] = firstKey;

        emit ShipmentRegistered(shipmentId, firstKey, block.timestamp);
    }

    // ============================================================
    // CORE PROTOCOL: VERIFY & ROTATE
    // ============================================================

    /**
     * @notice Verify pillar witness signature and rotate sensor key
     * @dev This is the core ratchet function. Call sequence:
     *      1. Sensor requests signature from nearby Pillar
     *      2. Sensor generates new key pair
     *      3. Sensor calls this function (tx signed with OLD key)
     *      4. Contract verifies: pillar signature + sender matches current key
     *      5. Contract updates to NEW key (the ratchet)
     *
     * @param shipmentId The shipment being handed over
     * @param newKey The new public key for the sensor (post-rotation)
     * @param witnessSignature ECDSA signature from the pillar over the message:
     *                         keccak256(abi.encodePacked(shipmentId, newKey))
     */
    function verifyAndRotate(
        uint256 shipmentId,
        address newKey,
        bytes memory witnessSignature
    ) external {
        // CHECK 1: Ensure shipment is active
        if (!shipmentActive[shipmentId]) {
            revert ShipmentNotActive(shipmentId);
        }

        // CHECK 2: Verify transaction sender matches current sensor key
        address currentKey = shipmentCurrentKey[shipmentId];
        if (msg.sender != currentKey) {
            revert InvalidSender(currentKey, msg.sender);
        }

        // CHECK 3: Recover signer from witness signature
        bytes32 messageHash = keccak256(abi.encodePacked(shipmentId, newKey));
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        address recoveredPillar = recoverSigner(
            ethSignedMessageHash,
            witnessSignature
        );

        // CHECK 4: Verify recovered signer is an authorized pillar
        if (!authorizedPillars[recoveredPillar]) {
            revert UnauthorizedPillar(recoveredPillar);
        }

        // ACTION: Rotate the key (THE RATCHET)
        address oldKey = currentKey;
        shipmentCurrentKey[shipmentId] = newKey;

        // EVENT: Emit immutable audit trail
        emit HandoverComplete(
            shipmentId,
            recoveredPillar,
            oldKey,
            newKey,
            block.timestamp
        );
    }

    // ============================================================
    // SIGNATURE VERIFICATION HELPERS
    // ============================================================

    /**
     * @dev Prefixes hash with Ethereum signed message format
     * @param messageHash The raw keccak256 hash
     * @return The Ethereum signed message hash
     */
    function getEthSignedMessageHash(
        bytes32 messageHash
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    messageHash
                )
            );
    }

    /**
     * @dev Recovers the signer address from signature
     * @param ethSignedMessageHash The prefixed hash
     * @param signature The ECDSA signature (65 bytes: r, s, v)
     * @return The address that signed the message
     */
    function recoverSigner(
        bytes32 ethSignedMessageHash,
        bytes memory signature
    ) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    /**
     * @dev Splits signature into r, s, v components
     * @param signature 65-byte ECDSA signature
     * @return r The first 32 bytes
     * @return s The second 32 bytes
     * @return v The final byte (recovery id)
     */
    function splitSignature(
        bytes memory signature
    ) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (signature.length != 65) revert InvalidSignature();

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        // Handle legacy v values
        if (v < 27) {
            v += 27;
        }
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Check if an address is an authorized pillar
     * @param pillar Address to check
     * @return bool Authorization status
     */
    function isPillarAuthorized(address pillar) external view returns (bool) {
        return authorizedPillars[pillar];
    }

    /**
     * @notice Get current valid key for a shipment
     * @param shipmentId The shipment to query
     * @return address Current sensor public key
     */
    function getCurrentKey(uint256 shipmentId) external view returns (address) {
        return shipmentCurrentKey[shipmentId];
    }

    /**
     * @notice Check if shipment is active
     * @param shipmentId The shipment to query
     * @return bool Active status
     */
    function isShipmentActive(uint256 shipmentId) external view returns (bool) {
        return shipmentActive[shipmentId];
    }
}
