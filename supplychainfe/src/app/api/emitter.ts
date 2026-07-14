import { EventEmitter } from 'events';

// Make it a global singleton to persist across HMR (Hot Module Replacement) during development
const globalForEmitter = global as unknown as {
  emitter: EventEmitter;
};

export const telemetryEmitter = globalForEmitter.emitter || new EventEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalForEmitter.emitter = telemetryEmitter;
}
