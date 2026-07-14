import { WitnessNode, SensorDevice } from './actors';
import { PILLAR_KEYS } from './config';

// Define Authorized Witness Pillars using our static keys for dynamic simulation
export const AUTHORIZED_PILLARS = {
  truck: new WitnessNode('TruckBeacon-Alpha', PILLAR_KEYS.truck),
  warehouse: new WitnessNode('WarehousePillar-Beta', PILLAR_KEYS.warehouse),
};

export const MOCK_SENSOR = new SensorDevice('VaccineBox-12345');

export const MOCK_TELEMETRY_DATA = {
  phaseA: {
    temperature: -18.5,
    location: "Truck-Alpha-Location (Lat: 40.7128, Long: -74.0060)",
    notes: "Stable temperature during transit"
  },
  phaseB: {
    temperature: -19.2,
    location: "Warehouse-Beta-Location (Lat: 40.7580, Long: -73.9855)",
    notes: "Slight drop during unloading"
  }
};

export const getAuthorizedPillars = () => Object.values(AUTHORIZED_PILLARS);

export const getDynamicMockTelemetry = () => {
  // Generate slightly fluctuating temperature (-18 to -22)
  const temperature = parseFloat((-18.0 - Math.random() * 4.0).toFixed(2));
  // Generate relative humidity (40% to 65%)
  const humidity = parseFloat((40.0 + Math.random() * 25.0).toFixed(2));
  
  // Generate random latitude / longitude within a transit corridor
  const lat = parseFloat((40.7128 + (Math.random() - 0.5) * 0.1).toFixed(4));
  const lng = parseFloat((-74.0060 + (Math.random() - 0.5) * 0.1).toFixed(4));
  const location = `Transit Location (Lat: ${lat}, Long: ${lng})`;
  
  return { temperature, humidity, location };
};
