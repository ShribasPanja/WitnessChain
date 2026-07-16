export const CONFIG = {
  rpcUrl: 'http://127.0.0.1:8545',
  contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  mnemonic: 'test test test test test test test test test test test junk',
  shipmentId: 4036,
};

export const CONTRACT_ABI = [
  'function authorizePillar(address pillar) external',
  'function revokePillar(address pillar) external',
  'function registerShipment(uint256 shipmentId, address initialKey, uint256 recordingInterval, address[] calldata allowedPillars) external',
  'function rotateKey(uint256 shipmentId, address newKey, bytes memory pillarSignature, bytes memory sensorSignature) external',
  'function completeShipment(uint256 shipmentId) external',
  'function updateShipmentStatus(uint256 shipmentId, bool hold, bool complete) external',
  'function getShipmentInfo(uint256 shipmentId) external view returns (address currentKey, uint256 rotationCount, bool active, bool completed, bool onHold, uint256 registeredAt, uint256 lastRotation, address lastPillar, uint256 recordingInterval)',
  'function isPillarAuthorized(address pillar) external view returns (bool)',
  'function isPillarAuthorizedForShipment(uint256 shipmentId, address pillar) external view returns (bool)',
  'function getCurrentKey(uint256 shipmentId) external view returns (address)',
  'function isShipmentOperational(uint256 shipmentId) external view returns (bool)',
  'event PillarAuthorized(address indexed pillar, uint256 timestamp)',
  'event PillarRevoked(address indexed pillar, uint256 timestamp)',
  'event ShipmentRegistered(uint256 indexed shipmentId, address indexed initialKey, uint256 timestamp)',
  'event KeyRotated(uint256 indexed shipmentId, address indexed pillar, address oldKey, address newKey, uint256 rotationCount, uint256 timestamp)',
  'event ShipmentCompleted(uint256 indexed shipmentId, address finalKey, uint256 totalRotations, uint256 timestamp)',
  'event ShipmentStatusUpdated(uint256 indexed shipmentId, bool hold, bool completed, uint256 timestamp)',
];

export const PILLAR_KEYS = {
  truck: '0x5de4111afa1a4b9213d297ec5eccf9c77e68c92a62886f4a86f96614138e6f1f',
  warehouse: '0x7c81524e9309724122d26f317b3c783c84666f7f2b96614138e6f1f4138e6f1f',
};
