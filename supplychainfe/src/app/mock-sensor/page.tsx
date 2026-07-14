'use client';

import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';

import { 
  Activity, 
  Truck, 
  Warehouse, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Cpu, 
  Settings,
  Wallet,
  Globe,
  ArrowLeft,
  Thermometer,
  Shield
} from 'lucide-react';

import { CONFIG, CONTRACT_ABI } from '../../lib/config';
import { getDynamicMockTelemetry } from '../../lib/mock_data';

const DEFAULT_CONTRACT = CONFIG.contractAddress;
const DEFAULT_RPC = CONFIG.rpcUrl;
const DEFAULT_SHIPMENT_ID = CONFIG.shipmentId.toString();

export default function MockSensorPanel() {
  // Settings (persisted to localStorage)
  const [contractAddress, setContractAddress] = useState<string>(DEFAULT_CONTRACT);
  const [rpcUrl, setRpcUrl] = useState<string>(DEFAULT_RPC);
  const [shipmentId, setShipmentId] = useState<string>(DEFAULT_SHIPMENT_ID);
  
  // Wagmi hooks
  const { address: userAddress, isConnected, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const networkConnected = isConnected;
  const networkName = chain ? chain.name : 'Offline';
  
  // Handover state
  const [selectedPillar, setSelectedPillar] = useState<string>('0x090A48E536efDe72f9d902c1b4F6096075Ee715a');
  const [temperature, setTemperature] = useState<string>('-18.5');
  
  // UI UX States
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto Simulation States
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSimulatingRef = useRef<boolean>(false);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [simulationInterval, setSimulationInterval] = useState<number>(5); // Default 5 seconds for safety
  
  // Whitelisted pillars from contract logs
  const [authorizedPillarsList, setAuthorizedPillarsList] = useState<string[]>([]);
  const [customPillarPrivateKey, setCustomPillarPrivateKey] = useState<string>('');

  const selectedPillarRef = useRef<string>(selectedPillar);
  useEffect(() => {
    selectedPillarRef.current = selectedPillar;
  }, [selectedPillar]);

  // Load config from LocalStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedContract = localStorage.getItem('cc_contract');
      const storedRpc = localStorage.getItem('cc_rpc');
      const storedShipment = localStorage.getItem('cc_shipment');
      
      if (storedContract) setContractAddress(storedContract);
      if (storedRpc) setRpcUrl(storedRpc);
      if (storedShipment) setShipmentId(storedShipment);
    }
  }, []);

  // Save config to LocalStorage
  const saveSettings = (newContract: string, newRpc: string, newShipment: string) => {
    setContractAddress(newContract);
    setRpcUrl(newRpc);
    setShipmentId(newShipment);
    localStorage.setItem('cc_contract', newContract);
    localStorage.setItem('cc_rpc', newRpc);
    localStorage.setItem('cc_shipment', newShipment);
    setMessage({ type: 'success', text: 'Configuration settings saved!' });
    setShowSettings(false);
  };

  // Get active provider (MetaMask or custom JSON-RPC fallback)
  const getProvider = (): ethers.Provider => {
    if (typeof window !== 'undefined' && (window as any).ethereum && userAddress) {
      return new ethers.BrowserProvider((window as any).ethereum);
    }
    return new ethers.JsonRpcProvider(rpcUrl);
  };

  const fetchAuthorizedPillars = async () => {
    if (!ethers.isAddress(contractAddress)) return;
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      const code = await provider.getCode(contractAddress);
      if (code === '0x' || code === '0x0') {
        setAuthorizedPillarsList([]);
        return;
      }

      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
      
      // Query events
      const authFilter = contract.filters.PillarAuthorized();
      const authEvents = await contract.queryFilter(authFilter);
      const revokeFilter = contract.filters.PillarRevoked();
      const revokeEvents = await contract.queryFilter(revokeFilter);
      
      const activePillarsSet = new Set<string>();
      const allEvents = [
        ...authEvents.map(e => ({ type: 'auth', address: (e as any).args[0], block: e.blockNumber })),
        ...revokeEvents.map(e => ({ type: 'revoke', address: (e as any).args[0], block: e.blockNumber }))
      ].sort((a, b) => a.block - b.block);
      
      for (const ev of allEvents) {
        if (ev.type === 'auth') activePillarsSet.add(ev.address);
        else activePillarsSet.delete(ev.address);
      }
      
      const list = Array.from(activePillarsSet);
      setAuthorizedPillarsList(list);
      
      // Set default selected option
      if (list.length > 0 && !selectedPillar) {
        setSelectedPillar(list[0]);
      }
    } catch (e) {
      console.error('Failed to fetch authorized pillars:', e);
    }
  };

  useEffect(() => {
    fetchAuthorizedPillars();
  }, [contractAddress, rpcUrl, userAddress, message]);

  // Auto-fill private key for whitelisted pillars in demo mode
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedPillar) {
      const storedKey = localStorage.getItem(`pkey_${selectedPillar.toLowerCase()}`);
      if (storedKey) {
        setCustomPillarPrivateKey(storedKey);
      } else {
        setCustomPillarPrivateKey('');
      }
    }
  }, [selectedPillar]);

  const [setupLoading, setSetupLoading] = useState<boolean>(false);

  const handleSetupPillars = async () => {
    setSetupLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/setup-pillars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractAddress, rpcUrl })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'Success! Witness pillars authorized on-chain.' });
        await fetchAuthorizedPillars();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to setup pillars' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred during setup' });
    } finally {
      setSetupLoading(false);
    }
  };


  // Toggle Auto Simulation Reporting
  const handleToggleSimulation = async () => {
    if (isSimulating) {
      // Stop simulation
      isSimulatingRef.current = false;
      if (simIntervalRef.current) {
        clearTimeout(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      setIsSimulating(false);
      setSimulationLogs(prev => [`[SYSTEM] Simulation stopped.`, ...prev]);
      return;
    }

    // Start simulation
    setLoading(true);
    setMessage(null);
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
      
      // Fetch shipment info to get the interval set by the admin
      const info = await contract.getShipmentInfo(BigInt(shipmentId));
      const completed = info[3];
      const onHold = info[4];

      if (onHold) {
        throw new Error('Shipment is currently on HOLD. Simulation is blocked.');
      }
      if (completed) {
        throw new Error('Shipment is already COMPLETED. Simulation is blocked.');
      }

      const intervalSec = Number(info[8]) || 5; // index 8 is recordingInterval
      setSimulationInterval(intervalSec);

      // Query whitelisted pillars to select from dynamically
      const authFilter = contract.filters.PillarAuthorized();
      const authEvents = await contract.queryFilter(authFilter);
      const revokeFilter = contract.filters.PillarRevoked();
      const revokeEvents = await contract.queryFilter(revokeFilter);
      
      const activePillarsSet = new Set<string>();
      const allEvents = [
        ...authEvents.map(e => ({ type: 'auth', address: (e as any).args[0], block: e.blockNumber })),
        ...revokeEvents.map(e => ({ type: 'revoke', address: (e as any).args[0], block: e.blockNumber }))
      ].sort((a, b) => a.block - b.block);
      
      for (const ev of allEvents) {
        if (ev.type === 'auth') activePillarsSet.add(ev.address);
        else activePillarsSet.delete(ev.address);
      }
      
      const authorizedPillarsList = Array.from(activePillarsSet);
      if (authorizedPillarsList.length === 0) {
        throw new Error('No authorized pillars found. Please whitelist a pillar in the Admin Console first!');
      }

      isSimulatingRef.current = true;
      setIsSimulating(true);
      setSimulationLogs([`[SYSTEM] Starting simulation. Recording every ${intervalSec}s...`]);

      // Set up sequential recursive logging loop
      const runCycle = async () => {
        // Stop execution if simulation was turned off
        if (!isSimulatingRef.current) return;

        try {
          const { temperature: mockTemp, humidity: mockHumidity, location: mockLoc } = getDynamicMockTelemetry();
          
           const truckAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
          const warehouseAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

          const activePillarAddr = selectedPillarRef.current;
          if (!activePillarAddr) {
            throw new Error('No custody pillar selected in dropdown.');
          }

          let pillarKey = 'custom';
          let payloadPrivateKey = undefined;
          let custodyLabel = activePillarAddr;

          if (activePillarAddr.toLowerCase() === truckAddress.toLowerCase()) {
            pillarKey = 'truck';
            custodyLabel = 'TruckBeacon-Alpha';
          } else if (activePillarAddr.toLowerCase() === warehouseAddress.toLowerCase()) {
            pillarKey = 'warehouse';
            custodyLabel = 'WarehousePillar-Beta';
          } else {
            custodyLabel = `CustomPillar (${activePillarAddr.slice(0, 6)}...${activePillarAddr.slice(-4)})`;
            if (typeof window !== 'undefined') {
              const stored = localStorage.getItem(`pkey_${activePillarAddr.toLowerCase()}`);
              if (stored) {
                payloadPrivateKey = stored;
              } else {
                throw new Error(`Private key for custom pillar ${activePillarAddr.slice(0, 8)}... not found in local storage.`);
              }
            }
          }

          const bodyPayload: any = {
            shipmentId: Number(shipmentId),
            pillarKey,
            pillarPrivateKey: payloadPrivateKey,
            temperature: mockTemp,
            humidity: mockHumidity,
            location: mockLoc,
            contractAddress,
            rpcUrl
          };

          const res = await fetch('/api/simulate-handover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
          });

          const data = await res.json();
          const timestamp = new Date().toLocaleTimeString();
          if (res.ok && data.success) {
            setSimulationLogs(prev => [
              `[${timestamp}] Key Rotated 🔄 | Custody: ${custodyLabel} | Temp: ${mockTemp}°C | Humid: ${mockHumidity}% | Loc: ${mockLoc.slice(17, 35)}...`,
              ...prev
            ]);
          } else {
            setSimulationLogs(prev => [
              `[${timestamp}] ❌ Error: ${data.error || 'Handover failed'}`,
              ...prev
            ]);
          }
        } catch (err: any) {
          console.error('Simulation step error:', err);
          const timestamp = new Date().toLocaleTimeString();
          setSimulationLogs(prev => [
            `[${timestamp}] ❌ Error: ${err.message || 'Simulation step failed'}`,
            ...prev
          ]);
        }

        // Schedule next execution only if still active
        if (isSimulatingRef.current) {
          simIntervalRef.current = setTimeout(runCycle, intervalSec * 1000);
        }
      };

      // Start the loop immediately
      simIntervalRef.current = setTimeout(runCycle, 0);

    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to start auto simulation' });
      setIsSimulating(false);
      isSimulatingRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  // Cleanup simulation interval on unmount
  useEffect(() => {
    return () => {
      isSimulatingRef.current = false;
      if (simIntervalRef.current) {
        clearTimeout(simIntervalRef.current);
      }
    };
  }, []);

  // Trigger simulated handover rotation
  const handleHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const truckAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
      const warehouseAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

      let pillarKey = 'custom';
      let payloadPrivateKey = undefined;

      if (selectedPillar.toLowerCase() === truckAddress.toLowerCase()) {
        pillarKey = 'truck';
      } else if (selectedPillar.toLowerCase() === warehouseAddress.toLowerCase()) {
        pillarKey = 'warehouse';
      } else {
        if (!customPillarPrivateKey) {
          throw new Error('Please input the private key for the custom authorized pillar address to sign rotations!');
        }
        payloadPrivateKey = customPillarPrivateKey;
      }

      const res = await fetch('/api/simulate-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: Number(shipmentId),
          pillarKey,
          pillarPrivateKey: payloadPrivateKey,
          temperature: Number(temperature),
          contractAddress,
          rpcUrl
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Handover successful! Rotated to: ${data.newKey.slice(0, 16)}... on-chain.`,
        });
        setCustomPillarPrivateKey('');
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to simulate handover',
        });
      }
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.message || 'An error occurred during simulation',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-12">
      {/* Header */}
      <header className="max-w-3xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-8 w-8 text-cyan-400 animate-pulse" />
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-400 to-indigo-400 bg-clip-text text-transparent">
              Mock Sensor Node
            </h1>
          </div>
          <p className="text-slate-400 mt-1 text-sm">
            Simulate IoT sensor events and execute key rotations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Network Indicator */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full py-1.5 px-4 text-xs font-semibold">
            <Globe className={`h-3.5 w-3.5 ${networkConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-500'}`} />
            <span>{networkName}</span>
          </div>

          {/* Switch Chain Action Button */}
          {isConnected && chain?.id !== 31337 && (
            <button
              onClick={() => switchChain({ chainId: 31337 })}
              className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-3 py-1.5 rounded-full cursor-pointer transition-colors"
            >
              Switch to Local Anvil
            </button>
          )}

          {/* Web3 Connect Button */}
          {isConnected ? (
            <button 
              onClick={() => disconnect()}
              className="flex items-center gap-2 bg-slate-900 border border-slate-850 hover:bg-slate-800 rounded-full py-1.5 px-4 text-xs font-semibold text-cyan-400 cursor-pointer"
            >
              <Wallet className="h-3.5 w-3.5 text-cyan-400" />
              <span>{userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}</span>
            </button>
          ) : (
            <button 
              onClick={() => connect({ connector: injected() })}
              className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white py-1.5 px-4 rounded-full text-xs font-bold transition-all cursor-pointer shadow-md shadow-cyan-950"
            >
              <Wallet className="h-3.5 w-3.5" />
              Connect Wallet
            </button>
          )}

          {/* Admin Route Link */}
          <Link
            href="/admin"
            className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-655/40 text-emerald-300 py-1.5 px-3.5 rounded-lg text-xs font-semibold border border-emerald-500/30 cursor-pointer"
          >
            <Shield className="h-3.5 w-3.5" />
            Admin
          </Link>

          {/* Setup Pillars Button */}
          <button 
            onClick={handleSetupPillars} 
            disabled={setupLoading}
            className="flex items-center gap-1.5 bg-indigo-600/30 hover:bg-indigo-655/40 text-indigo-300 py-1.5 px-3.5 rounded-lg text-xs font-semibold border border-indigo-500/30 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${setupLoading ? 'animate-spin' : ''}`} />
            Setup Pillars
          </button>

          {/* Settings Config Toggle */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-center p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto space-y-8">
        
        {/* Back Link to Dashboard */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Live Dashboard Monitor
        </Link>

        {/* Collapsible System Config Settings Form */}
        {showSettings && (
          <div className="bg-slate-900 border-2 border-indigo-500/30 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden transition-all duration-350">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-indigo-400" />
              Dynamic Settings
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1.5">Smart Contract Address</label>
                <input
                  type="text"
                  defaultValue={contractAddress}
                  id="sett_contract"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1.5">Blockchain RPC Provider URL</label>
                <input
                  type="text"
                  defaultValue={rpcUrl}
                  id="sett_rpc"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="http://..."
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1.5">Shipment ID</label>
                <input
                  type="text"
                  defaultValue={shipmentId}
                  id="sett_shipment"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. 4036"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const c = (document.getElementById('sett_contract') as HTMLInputElement).value;
                    const r = (document.getElementById('sett_rpc') as HTMLInputElement).value;
                    const s = (document.getElementById('sett_shipment') as HTMLInputElement).value;
                    saveSettings(c, r, s);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Panel 1: Manual Handover */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
                <Activity className="h-5 w-5 text-cyan-400" />
                Manual Custody Handover
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Manually record temperature readings and rotate custody between nodes.
              </p>

              <form onSubmit={handleHandover} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">Shipment ID (Numeric)</label>
                  <input
                    type="number"
                    value={shipmentId}
                    onChange={(e) => setShipmentId(e.target.value)}
                    placeholder="e.g. 4036"
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-650 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">Custody Transfers to</label>
                  {authorizedPillarsList.length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-2 bg-slate-950 rounded-xl border border-slate-900">
                      No whitelisted pillars found. Click "Setup Pillars" or use Admin Whitelist first.
                    </div>
                  ) : (
                    <select
                      value={selectedPillar}
                      onChange={(e) => setSelectedPillar(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                    >
                      {authorizedPillarsList.map((addr) => {
                        const truckAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
                        const warehouseAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
                        
                        let label = addr;
                        if (addr.toLowerCase() === truckAddress.toLowerCase()) label = 'TruckBeacon-Alpha';
                        else if (addr.toLowerCase() === warehouseAddress.toLowerCase()) label = 'WarehousePillar-Beta';
                        else label = `Custom Pillar (${addr.slice(0, 6)}...${addr.slice(-4)})`;
                        
                        return (
                          <option key={addr} value={addr}>{label}</option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {/* Show Private Key input only for custom whitelisted pillars */}
                {selectedPillar && 
                 selectedPillar.toLowerCase() !== '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'.toLowerCase() && 
                 selectedPillar.toLowerCase() !== '0x90F79bf6EB2c4f870365E785982E1f101E93b906'.toLowerCase() && (
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Custom Pillar Private Key</label>
                    <input
                      type="password"
                      value={customPillarPrivateKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomPillarPrivateKey(val);
                        if (typeof window !== 'undefined' && selectedPillar && ethers.isHexString(val, 32)) {
                          localStorage.setItem(`pkey_${selectedPillar.toLowerCase()}`, val);
                        }
                      }}
                      placeholder="0x..."
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 font-mono text-xs placeholder-slate-650 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-[9px] text-slate-500 mt-1 block">
                      *Required to witness and sign custody rotations for your custom whitelisted node.
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">Current Temperature (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="-18.5"
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-650 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-cyan-950 flex items-center justify-center gap-2 mt-2"
                >
                  {loading && !isSimulating ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Trigger Custody Handover
                </button>
              </form>
            </div>
          </div>

          {/* Panel 2: Periodic Simulation Runner */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
                <Cpu className="h-5 w-5 text-indigo-400" />
                Periodic Simulation Runner
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Automate periodic telemetry logging (temp, humidity, lat/long) and key rotation based on the shipment's on-chain recording frequency.
              </p>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleToggleSimulation}
                  disabled={loading}
                  className={`w-full py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 ${
                    isSimulating
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950'
                  }`}
                >
                  {loading && isSimulating ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  {isSimulating ? 'Stop Auto-Simulation' : 'Start Auto-Simulation'}
                </button>

                {/* Console Logs */}
                <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 h-[160px] overflow-y-auto font-mono text-[10px] space-y-1.5 text-slate-450">
                  {simulationLogs.length === 0 ? (
                    <span className="text-slate-600 italic">No simulation logs. Click start to simulate active nodes.</span>
                  ) : (
                    simulationLogs.map((log, idx) => (
                      <div key={idx} className={log.startsWith('[SYSTEM]') ? 'text-indigo-400 font-semibold' : log.includes('❌') ? 'text-rose-400' : 'text-emerald-400'}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
