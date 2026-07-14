'use client';

import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import Link from 'next/link';
import { 
  Activity, 
  Shield, 
  Truck, 
  Warehouse, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Cpu, 
  Clock, 
  Key, 
  Database,
  Thermometer,
  MapPin,
  TrendingDown,
  Settings,
  Wallet,
  Wifi,
  Globe,
  Download,
  QrCode,
  X
} from 'lucide-react';

import { CONFIG, CONTRACT_ABI } from '../lib/config';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';


const DEFAULT_CONTRACT = CONFIG.contractAddress;
const DEFAULT_RPC = CONFIG.rpcUrl;
const DEFAULT_SHIPMENT_ID = CONFIG.shipmentId.toString();

interface ShipmentState {
  currentKey: string;
  rotationCount: number;
  active: boolean;
  completed: boolean;
  onHold?: boolean;
  registeredAt: number;
  lastRotation: number;
  lastPillar: string;
  recordingInterval: number;
}

interface TelemetryItem {
  shipmentId: string;
  timestamp: number;
  temperature: number;
  humidity?: number;
  location: string;
  nonce: string;
  witnessSignature: string;
  pillarAddress?: string;
}

export default function Dashboard() {
  // Settings (persisted to localStorage)
  const [contractAddress, setContractAddress] = useState<string>(DEFAULT_CONTRACT);
  const [rpcUrl, setRpcUrl] = useState<string>(DEFAULT_RPC);
  const [shipmentId, setShipmentId] = useState<string>(DEFAULT_SHIPMENT_ID);
  
  // Wallet & Network State
  // Wagmi hooks
  const { address: userAddress, isConnected, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const networkConnected = isConnected;
  const networkName = chain ? chain.name : 'Offline';

  // App states
  const [shipmentInfo, setShipmentInfo] = useState<ShipmentState | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryItem[]>([]);
  
  interface ShipmentMetadata {
    name: string;
    description: string;
    minTemp: number;
    maxTemp: number;
    minHumid: number;
    maxHumid: number;
  }
  const [shipmentMetadata, setShipmentMetadata] = useState<ShipmentMetadata | null>(null);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  
  // UI UX States
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filterByShipment, setFilterByShipment] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  // Parse latitude and longitude from location string
  const parseCoordinates = (locStr: string) => {
    if (!locStr) return { lat: 40.7128, lon: -74.0060 };
    const latMatch = locStr.match(/Lat:\s*([-\d.]+)/i);
    const lonMatch = locStr.match(/Lon[g]?:\s*([-\d.]+)/i);
    if (latMatch && lonMatch) {
      return {
        lat: parseFloat(latMatch[1]),
        lon: parseFloat(lonMatch[1])
      };
    }
    return { lat: 40.7128, lon: -74.0060 };
  };

  // Convert witness address to friendly name
  const getPillarLabel = (addr?: string) => {
    if (!addr) return 'Unknown Pillar';
    const truckAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const warehouseAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
    if (addr.toLowerCase() === truckAddress.toLowerCase()) return 'TruckBeacon-Alpha';
    if (addr.toLowerCase() === warehouseAddress.toLowerCase()) return 'WarehousePillar-Beta';
    return `CustomPillar (${addr.slice(0, 6)}...${addr.slice(-4)})`;
  };

  const mapIframeRef = useRef<HTMLIFrameElement | null>(null);

  const handleFocusLocation = (locationStr: string) => {
    const { lat, lon } = parseCoordinates(locationStr);
    if (mapIframeRef.current && mapIframeRef.current.contentWindow) {
      mapIframeRef.current.contentWindow.postMessage({
        type: 'FOCUS_COORDINATE',
        coordinate: [lat, lon]
      }, '*');
    }
    mapIframeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Build chronologically sorted coordinate paths
  const getCoordinatesPath = (filteredTelemetry: TelemetryItem[]) => {
    const sorted = [...filteredTelemetry].sort((a, b) => a.timestamp - b.timestamp);
    const coords: [number, number][] = [];
    for (const item of sorted) {
      const { lat, lon } = parseCoordinates(item.location);
      if (coords.length === 0 || coords[coords.length - 1][0] !== lat || coords[coords.length - 1][1] !== lon) {
        coords.push([lat, lon]);
      }
    }
    return coords;
  };

  // Export current logs to CSV
  const handleExportCSV = () => {
    setExporting(true);
    setTimeout(() => {
      try {
        const filteredTelemetry = filterByShipment
          ? telemetry.filter(t => t.shipmentId === shipmentId)
          : telemetry;

        if (filteredTelemetry.length === 0) {
          alert('No telemetry records to export!');
          setExporting(false);
          return;
        }

        const headers = ['Shipment ID', 'Timestamp', 'Temperature (°C)', 'Humidity (%)', 'Location', 'Nonce', 'Witness Signature'];
        const rows = filteredTelemetry.map(item => {
          let dateStr = '';
          if (item.timestamp) {
            const d = new Date(item.timestamp);
            if (!isNaN(d.getTime())) {
              dateStr = d.toISOString();
            }
          }
          return [
            item.shipmentId || '',
            dateStr,
            item.temperature ?? '0.00',
            item.humidity ?? '0.00',
            `"${(item.location || '').replace(/"/g, '""')}"`,
            item.nonce || '',
            item.witnessSignature || ''
          ];
        });

        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `telemetry_shipment_${filterByShipment ? shipmentId : 'all'}_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Failed to export CSV:', err);
        alert('Failed to export CSV.');
      } finally {
        setExporting(false);
      }
    }, 600);
  };

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

  // Fetch shipment info on-chain
  const fetchShipmentData = async (targetId = shipmentId) => {
    if (!targetId || !ethers.isAddress(contractAddress)) return;
    try {
      const provider = getProvider();
      
      // Verify if the contract bytecode exists on the connected network
      const code = await provider.getCode(contractAddress);
      if (code === '0x' || code === '0x0') {
        console.warn(`No contract bytecode found at address: ${contractAddress}. Please check if the contract is deployed.`);
        setShipmentInfo(null);
        return;
      }

      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
      const data = await contract.getShipmentInfo(BigInt(targetId));
      
      setShipmentInfo({
        currentKey: data[0],
        rotationCount: Number(data[1]),
        active: data[2],
        completed: data[3],
        onHold: data[4],
        registeredAt: Number(data[5]) * 1000,
        lastRotation: Number(data[6]) * 1000,
        lastPillar: data[7],
        recordingInterval: Number(data[8]),
      });

      // Fetch off-chain metadata
      try {
        const metaRes = await fetch(`/api/shipment-metadata?shipmentId=${targetId}`);
        const metaData = await metaRes.json();
        if (metaData.success) {
          setShipmentMetadata(metaData.metadata);
        } else {
          setShipmentMetadata(null);
        }
      } catch (metaErr) {
        console.error('Failed to load shipment metadata:', metaErr);
        setShipmentMetadata(null);
      }
    } catch (e: any) {
      console.error('Failed to fetch on-chain shipment data:', e);
      if (e.code === 'BAD_DATA' && typeof window !== 'undefined') {
        console.warn('ABI desync detected. Resetting contract address to default.');
        localStorage.removeItem('cc_contract');
        window.location.reload();
      }
      setShipmentInfo(null);
    }
  };

  // Fetch off-chain telemetry from local Next.js API
  const fetchTelemetryData = async () => {
    try {
      const res = await fetch('/api/telemetry');
      const data = await res.json();
      if (data.telemetry) {
        // Filter and sort telemetry for the current shipmentId
        const filtered = data.telemetry
          .filter((item: TelemetryItem) => item.shipmentId === shipmentId)
          .sort((a: TelemetryItem, b: TelemetryItem) => b.timestamp - a.timestamp);
        setTelemetry(filtered);
      }
    } catch (e) {
      console.error('Failed to fetch telemetry:', e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchShipmentData(), fetchTelemetryData()]);
    setRefreshing(false);
  };

  useEffect(() => {
    handleRefresh();
  }, [shipmentId, contractAddress, rpcUrl, userAddress]);

  // Connect to Real-Time SSE Telemetry Stream
  useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log('Connecting to real-time telemetry stream...');
    const eventSource = new EventSource('/api/telemetry/stream');

    eventSource.onmessage = (event) => {
      try {
        const item: TelemetryItem = JSON.parse(event.data);
        if (item.shipmentId === shipmentId) {
          // Prepend new telemetry log item dynamically
          setTelemetry((prev) => {
            if (prev.some((x) => x.nonce === item.nonce && x.timestamp === item.timestamp)) {
              return prev;
            }
            return [item, ...prev];
          });
          
          // Instantly refresh on-chain shipment data (rotated key, rotation count)
          fetchShipmentData();
        }
      } catch (err) {
        console.error('Error parsing SSE telemetry item:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
    };

    return () => {
      eventSource.close();
      console.log('Telemetry stream disconnected.');
    };
  }, [shipmentId, contractAddress, rpcUrl]);



  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-12">
      <style>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
      `}</style>
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-8 w-8 text-cyan-400 animate-pulse" />
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-400 to-indigo-400 bg-clip-text text-transparent">
              Witness Chain
            </h1>
          </div>
          <p className="text-slate-400 mt-1 text-sm">
            Forward Secrecy Custody Verification & Cryptographic Telemetry Anchoring
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

          {/* Settings Config Toggle */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-center p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>

          {/* Admin Route Link */}
          <Link
            href="/admin"
            className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-650/40 text-emerald-300 py-1.5 px-3.5 rounded-lg text-xs font-semibold border border-emerald-500/30 cursor-pointer"
          >
            <Shield className="h-3.5 w-3.5" />
            Admin
          </Link>

          {/* Mock Sensor Route Link */}
          <Link
            href="/mock-sensor"
            className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-650/40 text-indigo-300 py-1.5 px-3.5 rounded-lg text-xs font-semibold border border-indigo-500/30 cursor-pointer"
          >
            <Cpu className="h-3.5 w-3.5" />
            Mock Sensor
          </Link>

          {/* Refresh Button */}
          <button 
            onClick={handleRefresh} 
            disabled={refreshing}
            className="flex items-center gap-1.5 bg-slate-850 hover:bg-slate-800 text-slate-200 py-1.5 px-3.5 rounded-lg text-xs font-medium border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>
      {/* Top Metrics Summary Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 px-4 lg:px-0">
        {/* Metric 1: Status */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Shipment Status</label>
          <div className="mt-3 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${
              shipmentInfo?.onHold
                ? 'bg-rose-500 animate-pulse'
                : shipmentInfo?.completed 
                  ? 'bg-amber-500' 
                  : shipmentInfo?.active
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-slate-600'
            }`} />
            <span className="text-sm font-bold text-slate-200">
              {shipmentInfo?.onHold ? 'On Hold' : shipmentInfo?.completed ? 'Delivered & Locked' : shipmentInfo?.active ? 'In Transit' : 'Not Registered'}
            </span>
          </div>
        </div>

        {/* Metric 2: Latest Temperature */}
        {(() => {
          const latestItem = telemetry[0];
          const isAlert = latestItem && latestItem.temperature > -15.0;
          return (
            <div className={`bg-slate-900/60 border rounded-2xl p-5 backdrop-blur-md relative overflow-hidden flex flex-col justify-between ${
              isAlert ? 'border-rose-900/50 shadow-lg shadow-rose-950/10' : 'border-slate-800'
            }`}>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Latest Temperature</label>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-black tracking-tight ${isAlert ? 'text-rose-400 animate-pulse' : 'text-teal-400'}`}>
                  {latestItem ? `${latestItem.temperature.toFixed(2)}` : 'N/A'}
                </span>
                <span className="text-xs text-slate-500 font-bold">{latestItem ? '°C' : ''}</span>
                {isAlert && (
                  <span className="ml-auto text-[9px] bg-rose-950/80 text-rose-400 border border-rose-800/40 py-0.5 px-2 rounded-full font-bold">
                    ⚠️ ALERT
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Metric 3: Key Handovers */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Key Rotations</label>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-100 tracking-tight">{shipmentInfo ? shipmentInfo.rotationCount : '0'}</span>
            <span className="text-[10px] text-slate-500 font-bold">handovers</span>
          </div>
        </div>

        {/* Metric 4: Frequency */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Logging Interval</label>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-indigo-400 tracking-tight">
              {shipmentInfo ? (shipmentInfo.recordingInterval >= 3600 ? shipmentInfo.recordingInterval / 3600 : shipmentInfo.recordingInterval) : 'N/A'}
            </span>
            <span className="text-[10px] text-slate-500 font-bold">
              {shipmentInfo ? (shipmentInfo.recordingInterval >= 3600 ? 'Hour(s)' : 'Second(s)') : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 px-4 lg:px-0">
        
        {/* Left Side: Shipment Status and Controls */}
        <section className="lg:col-span-7 flex flex-col gap-8">

          {/* Collapsible System Config Settings Modal/Form */}
          {showSettings && (
            <div className="bg-slate-900 border-2 border-indigo-500/30 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden transition-all duration-350">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
                <Settings className="h-5 w-5 text-indigo-400" />
                Dynamic Settings (Phase 1)
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

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowSettings(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const c = (document.getElementById('sett_contract') as HTMLInputElement).value;
                      const r = (document.getElementById('sett_rpc') as HTMLInputElement).value;
                      saveSettings(c, r, shipmentId);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Shipment ID Query Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
              <Database className="h-5 w-5 text-indigo-400" />
              Shipment Search
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={shipmentId}
                onChange={(e) => {
                  setShipmentId(e.target.value);
                  localStorage.setItem('cc_shipment', e.target.value);
                }}
                placeholder="Enter Shipment ID (e.g. 4036)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button 
                onClick={() => handleRefresh()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Search
              </button>
            </div>
          </div>

          {/* On-Chain Status Info Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10" />
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-450" />
                On-Chain Shipment Identity
              </h2>
              {shipmentInfo && (
                <button
                  onClick={() => setShowQRModal(true)}
                  className="bg-indigo-650/20 hover:bg-indigo-650/45 border border-indigo-500/35 text-indigo-300 text-[10px] font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  Generate QR
                </button>
              )}
            </div>

            {shipmentMetadata && (
              <div className="mb-6 p-4 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1">
                <h3 className="text-sm font-extrabold text-indigo-400">{shipmentMetadata.name}</h3>
                {shipmentMetadata.description && (
                  <p className="text-xs text-slate-400 font-medium text-slate-400">{shipmentMetadata.description}</p>
                )}
                <div className="flex gap-4 pt-1.5 text-[10px] text-slate-500 font-semibold">
                  <span>Ideal Temp: <strong className="text-slate-300">{shipmentMetadata.minTemp}°C to {shipmentMetadata.maxTemp}°C</strong></span>
                  <span>Ideal Humid: <strong className="text-slate-300">{shipmentMetadata.minHumid}% to {shipmentMetadata.maxHumid}%</strong></span>
                </div>
              </div>
            )}

            {shipmentInfo ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 font-medium block">Current Ephemeral Public Key</label>
                    <div className="flex items-center gap-2 mt-1 bg-slate-950 py-1.5 px-3 rounded-xl border border-slate-800/50">
                      <Key className="h-4 w-4 text-cyan-400 shrink-0" />
                      <span className="font-mono text-xs text-slate-300 break-all">{shipmentInfo.currentKey}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium block">Rotation Count (Anti-Replay)</label>
                    <div className="text-2xl font-black text-indigo-300 mt-1">{shipmentInfo.rotationCount}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 font-medium block">Last Witnessing Pillar</label>
                    <div className="flex items-center gap-2 mt-1 bg-slate-950 py-1.5 px-3 rounded-xl border border-slate-800/50">
                      {shipmentInfo.lastPillar === ethers.ZeroAddress ? (
                        <span className="text-slate-500 text-xs font-medium">None (Initial State)</span>
                      ) : (
                        <>
                          <Warehouse className="h-4 w-4 text-teal-400 shrink-0" />
                          <span className="font-mono text-xs text-slate-300 break-all">{shipmentInfo.lastPillar}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 font-medium block">Registered At</label>
                      <span className="text-xs font-semibold text-slate-300 block mt-1">
                        {new Date(shipmentInfo.registeredAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium block">Logging Frequency</label>
                      <span className="text-xs font-semibold text-indigo-300 block mt-1">
                        {shipmentInfo.recordingInterval >= 3600 
                          ? `${shipmentInfo.recordingInterval / 3600} Hour(s)` 
                          : `${shipmentInfo.recordingInterval} Second(s)`}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 pt-4 border-t border-slate-850">
                    <div>
                      <label className="text-xs text-slate-400 font-medium block">Last Key Rotation</label>
                      <span className="text-xs font-semibold text-slate-300 block mt-1">
                        {shipmentInfo.rotationCount > 0 
                          ? new Date(shipmentInfo.lastRotation).toLocaleTimeString() 
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
                <p className="text-sm font-semibold text-slate-300">Shipment {shipmentId} Not Active On-Chain</p>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  You can register and kick off this shipment automatically by performing the first simulated handover.
                </p>
              </div>
            )}
          </div>

          {/* Live Custody Map Card */}
          {(() => {
            const filteredTelemetry = filterByShipment
              ? telemetry.filter(t => t.shipmentId === shipmentId)
              : telemetry;
            
            const coordsPath = getCoordinatesPath(filteredTelemetry);
            const latestItem = filteredTelemetry[0];
            const latestLoc = latestItem?.location || '';
            const { lat, lon } = parseCoordinates(latestLoc);

            const srcDocContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <style>
                  html, body, #map { height: 100%; margin: 0; padding: 0; background: #090d16; }
                  .leaflet-container { background: #090d16 !important; }
                  .leaflet-bar a { background-color: #0f172a !important; color: #94a3b8 !important; border-color: #334155 !important; }
                  .leaflet-bar a:hover { background-color: #1e293b !important; color: #f8fafc !important; }
                  .leaflet-popup-content-wrapper { background: #0f172a !important; color: #e2e8f0 !important; border: 1px solid #334155 !important; border-radius: 8px; }
                  .leaflet-popup-tip { background: #0f172a !important; border: 1px solid #334155 !important; }
                </style>
              </head>
              <body>
                <div id="map"></div>
                <script>
                  const coords = ${JSON.stringify(coordsPath)};
                  const latest = ${JSON.stringify([lat, lon])};
                  
                  const map = L.map('map', { zoomControl: false }).setView(latest, 11);
                  L.control.zoom({ position: 'topright' }).addTo(map);

                  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; CARTO',
                    maxZoom: 20
                  }).addTo(map);

                  if (coords.length > 0) {
                    // Draw Polyline path
                    const polyline = L.polyline(coords, {
                      color: '#6366f1',
                      weight: 4,
                      opacity: 0.8,
                      dashArray: '5, 8'
                    }).addTo(map);

                    // Add markers
                    coords.forEach((coord, idx) => {
                      const isLast = idx === coords.length - 1;
                      const marker = L.circleMarker(coord, {
                        radius: isLast ? 8 : 5,
                        fillColor: isLast ? '#10b981' : '#6366f1',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 1
                      }).addTo(map);
                      
                      marker.bindPopup(\`<b>Stop #\${idx + 1}</b><br>Lat: \${coord[0].toFixed(4)}<br>Lon: \${coord[1].toFixed(4)}\`);
                    });

                    // Fit to bounds
                    map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
                  }

                  // Listen for messages from parent window to pan/zoom
                  window.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'FOCUS_COORDINATE') {
                      const coord = event.data.coordinate;
                      map.setView(coord, 14, { animate: true });
                      
                      // Highlight marker
                      L.popup()
                        .setLatLng(coord)
                        .setContent('<b>Focused Location</b><br>Lat: ' + coord[0].toFixed(4) + ', Lon: ' + coord[1].toFixed(4))
                        .openOn(map);
                    }
                  });
                </script>
              </body>
              </html>
            `;

            return (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden flex flex-col">
                <div>
                  <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
                    <MapPin className="h-5 w-5 text-indigo-450" />
                    Live Custody Transit Path
                  </h2>
                  <div className="w-full h-[300px] rounded-xl overflow-hidden border border-slate-800 relative bg-slate-950">
                    {latestItem ? (
                      <iframe
                        ref={mapIframeRef}
                        title="Live Custody Map"
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        srcDoc={srcDocContent}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                        <Globe className="h-8 w-8 animate-pulse text-indigo-500" />
                        <span className="text-xs italic">Waiting for live location signals...</span>
                      </div>
                    )}
                  </div>
                  {latestItem && (
                    <div className="mt-3 flex justify-between items-center text-[10px] text-slate-400 px-1">
                      <span>Transit Points: {coordsPath.length} | Lat: {lat.toFixed(4)}°, Lon: {lon.toFixed(4)}°</span>
                      <span className="text-indigo-400 font-semibold">{latestLoc.split('(')[0].trim() || 'Active Custodian'}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </section>

        {/* Right Side: Off-Chain Telemetry Timeline */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col min-h-[950px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-400" />
                Telemetry Log
              </h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleExportCSV}
                  disabled={exporting}
                  className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-300 text-xs font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {exporting ? 'Preparing...' : 'Export CSV'}
                </button>
                <label className="flex items-center gap-2 text-xs text-slate-400 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterByShipment}
                    onChange={(e) => setFilterByShipment(e.target.checked)}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-slate-950"
                  />
                  Filter by ID
                </label>
              </div>
            </div>

            {(() => {
              const filteredTelemetry = filterByShipment
                ? telemetry.filter(t => t.shipmentId === shipmentId)
                : telemetry;

              if (filteredTelemetry.length === 0) {
                return (
                  <p className="text-xs text-slate-500 italic py-4 text-center">
                    No telemetry records found {filterByShipment ? `for Shipment #${shipmentId}` : ''}.
                  </p>
                );
              }

              return (
                <div className="overflow-y-auto space-y-6 h-[940px] pr-2 scrollbar-none">
                  {filteredTelemetry.map((item, index) => {
                    const minT = shipmentMetadata ? shipmentMetadata.minTemp : -25;
                    const maxT = shipmentMetadata ? shipmentMetadata.maxTemp : -15;
                    const minH = shipmentMetadata ? shipmentMetadata.minHumid : 40;
                    const maxH = shipmentMetadata ? shipmentMetadata.maxHumid : 60;

                    const isTempBelow = item.temperature < minT;
                    const isTempAbove = item.temperature > maxT;
                    const isTempAlert = isTempBelow || isTempAbove;

                    const isHumidBelow = item.humidity !== undefined && item.humidity < minH;
                    const isHumidAbove = item.humidity !== undefined && item.humidity > maxH;
                    const isHumidAlert = isHumidBelow || isHumidAbove;

                    const isAlert = isTempAlert || isHumidAlert;
                    
                    return (
                      <div key={index} className="relative pl-6 border-l border-slate-800 last:border-0 pb-1">
                        {/* Timeline dot */}
                        <span className={`absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full ${
                          isAlert ? 'bg-rose-500 shadow-md shadow-rose-950' : 'bg-teal-500'
                        }`} />

                        <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-semibold text-slate-500 block">
                                {new Date(item.timestamp).toLocaleString()}
                              </span>
                              {item.pillarAddress && (
                                <span className="text-[9px] font-medium text-slate-400">
                                  Witness: <span className="text-indigo-400 font-semibold">{getPillarLabel(item.pillarAddress)}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setShipmentId(item.shipmentId);
                                  localStorage.setItem('cc_shipment', item.shipmentId);
                                  setFilterByShipment(true);
                                  fetchShipmentData(item.shipmentId);
                                }}
                                className="bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/40 text-indigo-300 text-[10px] font-bold py-0.5 px-2 rounded-md transition-colors cursor-pointer"
                              >
                                Shipment #{item.shipmentId}
                              </button>
                              {item.humidity !== undefined && (
                                <div className={`flex items-center gap-1 text-xs font-bold py-0.5 px-2 rounded-md ${
                                  isHumidAlert 
                                    ? 'bg-rose-950/40 text-rose-400 border border-rose-900/45' 
                                    : 'bg-blue-950/40 text-blue-400 border border-blue-900/40'
                                }`}>
                                  Humid: {item.humidity}% {isHumidAlert && '⚠️'}
                                </div>
                              )}
                              <div className={`flex items-center gap-1 text-xs font-bold py-0.5 px-2 rounded-md ${
                                isTempAlert 
                                  ? 'bg-rose-950/40 text-rose-450 border border-rose-900/45' 
                                  : 'bg-teal-950/40 text-teal-400 border border-teal-900/40'
                              }`}>
                                <Thermometer className="h-3.5 w-3.5" />
                                {item.temperature}°C {isTempAlert && '⚠️'}
                              </div>
                            </div>
                          </div>

                        <div className="flex justify-between items-start gap-4">
                          <div className="flex items-start gap-2 text-xs">
                            <MapPin className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                            <span className="text-slate-300 font-medium">{item.location}</span>
                          </div>
                          <button
                            onClick={() => handleFocusLocation(item.location)}
                            className="shrink-0 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-350 hover:text-slate-100 text-[10px] font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <MapPin className="h-3 w-3 text-indigo-400" />
                            View on Map
                          </button>
                        </div>

                        <div className="border-t border-slate-900 pt-2.5 space-y-1 text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-semibold">Nonce:</span>
                            <span className="font-mono text-slate-400">{item.nonce}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-slate-500 font-semibold">Witness Signature:</span>
                            <span className="font-mono text-slate-400 break-all bg-slate-900/50 p-1.5 rounded border border-slate-850">{item.witnessSignature}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </div>
        </section>

      </main>
      {/* QR Verification Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center relative space-y-6">
            <button 
              onClick={() => setShowQRModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
                <QrCode className="h-5 w-5 text-indigo-400" />
                Verification QR Code
              </h2>
              <p className="text-xs text-slate-400">
                Scan this QR code to view the public cold-chain journey integrity report for Shipment #{shipmentId}.
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-2xl w-fit mx-auto border border-slate-200 shadow-md">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  typeof window !== 'undefined' ? `${window.location.origin}/shipment/${shipmentId}/verify` : `http://localhost:3000/shipment/${shipmentId}/verify`
                )}`}
                alt="Verification QR"
                width={200}
                height={200}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <input 
                type="text" 
                readOnly
                value={typeof window !== 'undefined' ? `${window.location.origin}/shipment/${shipmentId}/verify` : `http://localhost:3000/shipment/${shipmentId}/verify`}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-400 text-[10px] font-mono text-center focus:outline-none"
              />
              <button 
                onClick={() => {
                  const url = typeof window !== 'undefined' ? `${window.location.origin}/shipment/${shipmentId}/verify` : `http://localhost:3000/shipment/${shipmentId}/verify`;
                  navigator.clipboard.writeText(url);
                  alert('Verification link copied to clipboard!');
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 w-full rounded-xl cursor-pointer transition-colors"
              >
                Copy Public Audit URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
