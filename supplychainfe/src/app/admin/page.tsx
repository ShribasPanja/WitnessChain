'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { 
  Shield, 
  PlusCircle, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Cpu, 
  Settings,
  Wallet,
  Globe,
  ArrowLeft,
  UserCheck
} from 'lucide-react';

import { CONFIG, CONTRACT_ABI } from '../../lib/config';

export default function AdminConsole() {
  // Config state
  const [contractAddress, setContractAddress] = useState<string>(CONFIG.contractAddress);
  const [rpcUrl, setRpcUrl] = useState<string>(CONFIG.rpcUrl);
  
  // Wagmi hooks
  const { address: userAddress, isConnected, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const networkConnected = isConnected;
  const networkName = chain ? chain.name : 'Offline';
  
  // Admin Form States
  const [pillarAddress, setPillarAddress] = useState<string>('');
  const [shipmentId, setShipmentId] = useState<string>('');
  const [initialSensorKey, setInitialSensorKey] = useState<string>('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  const [recordingInterval, setRecordingInterval] = useState<string>('3600');
  const [authorizedPillarsList, setAuthorizedPillarsList] = useState<string[]>([]);
  
  // Custom Metadata States
  const [shipmentName, setShipmentName] = useState<string>('COVID Vaccine Transit');
  const [shipmentDesc, setShipmentDesc] = useState<string>('Ultra-cold Pfizer carrier');
  const [minTemp, setMinTemp] = useState<string>('-25');
  const [maxTemp, setMaxTemp] = useState<string>('-15');
  const [minHumid, setMinHumid] = useState<string>('40');
  const [maxHumid, setMaxHumid] = useState<string>('60');
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  
  // Status Update form states
  const [statusShipmentId, setStatusShipmentId] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<string>('transit'); // 'transit', 'completed', 'hold'

  // UI UX States
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load configs on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedContract = localStorage.getItem('cc_contract');
      const storedRpc = localStorage.getItem('cc_rpc');
      if (storedContract) setContractAddress(storedContract);
      if (storedRpc) setRpcUrl(storedRpc);
    }
  }, []);

  const saveSettings = (newContract: string, newRpc: string) => {
    setContractAddress(newContract);
    setRpcUrl(newRpc);
    localStorage.setItem('cc_contract', newContract);
    localStorage.setItem('cc_rpc', newRpc);
    setMessage({ type: 'success', text: 'Settings saved!' });
    setShowSettings(false);
  };

  // Get active provider (MetaMask or custom fallback)
  const getProvider = (): ethers.Provider => {
    if (typeof window !== 'undefined' && (window as any).ethereum && userAddress) {
      return new ethers.BrowserProvider((window as any).ethereum);
    }
    return new ethers.JsonRpcProvider(rpcUrl);
  };

  const fetchAuthorizedPillars = async () => {
    if (!ethers.isAddress(contractAddress)) return;
    try {
      const provider = getProvider();
      
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
      
      const activePillars = new Set<string>();
      
      const allEvents = [
        ...authEvents.map(e => ({ type: 'auth', address: (e as any).args[0], block: e.blockNumber })),
        ...revokeEvents.map(e => ({ type: 'revoke', address: (e as any).args[0], block: e.blockNumber }))
      ].sort((a, b) => a.block - b.block);
      
      for (const ev of allEvents) {
        if (ev.type === 'auth') {
          activePillars.add(ev.address);
        } else {
          activePillars.delete(ev.address);
        }
      }
      
      setAuthorizedPillarsList(Array.from(activePillars));
    } catch (e) {
      console.error('Failed to fetch authorized pillars:', e);
    }
  };

  useEffect(() => {
    fetchAuthorizedPillars();
  }, [contractAddress, rpcUrl, userAddress, message]);

  // Execute registerShipment on-chain
  const handleRegisterShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAddress) {
      setMessage({ type: 'error', text: 'Please connect your Web3 wallet first!' });
      return;
    }
    if (!shipmentId || !ethers.isAddress(initialSensorKey)) {
      setMessage({ type: 'error', text: 'Please enter a valid shipment ID and initial key address!' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

      console.log(`Registering shipment ${shipmentId} with initial key ${initialSensorKey}, interval ${recordingInterval}s, and allowed pillars: ${selectedPillars}`);
      const tx = await contract.registerShipment(
        BigInt(shipmentId),
        initialSensorKey,
        BigInt(recordingInterval),
        selectedPillars
      );
      
      setMessage({ type: 'success', text: 'Transaction broadcasted! Waiting for confirmation...' });
      const receipt = await tx.wait();
      
      // Save shipment metadata off-chain
      try {
        await fetch('/api/shipment-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shipmentId: shipmentId.toString(),
            name: shipmentName,
            description: shipmentDesc,
            minTemp: Number(minTemp),
            maxTemp: Number(maxTemp),
            minHumid: Number(minHumid),
            maxHumid: Number(maxHumid)
          })
        });
      } catch (metaErr) {
        console.error('Failed to save shipment metadata off-chain:', metaErr);
      }

      setMessage({
        type: 'success',
        text: `Success! Shipment #${shipmentId} registered on-chain with off-chain thresholds. (Tx: ${receipt.hash.slice(0, 16)}...)`
      });
      setShipmentId('');
      setInitialSensorKey('0x70997970C51812dc3A010C7d01b55e0d17dc79C8');
      setShipmentName('COVID Vaccine Transit');
      setShipmentDesc('Ultra-cold Pfizer carrier');
      setMinTemp('-25');
      setMaxTemp('-15');
      setMinHumid('40');
      setMaxHumid('60');
      setSelectedPillars([]);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.reason || err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  // Execute authorizePillar on-chain
  const handleAuthorizePillar = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!userAddress) {
      setMessage({ type: 'error', text: 'Please connect your Web3 wallet first!' });
      return;
    }
    if (!ethers.isAddress(pillarAddress)) {
      setMessage({ type: 'error', text: 'Please enter a valid pillar wallet address!' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

      console.log(`Authorizing pillar: ${pillarAddress}`);
      const tx = await contract.authorizePillar(pillarAddress);
      
      setMessage({ type: 'success', text: 'Transaction broadcasted! Waiting for confirmation...' });
      const receipt = await tx.wait();

      setMessage({
        type: 'success',
        text: `Success! Pillar ${pillarAddress.slice(0, 10)}... authorized on-chain. (Tx: ${receipt.hash.slice(0, 16)}...)`
      });
      setPillarAddress('');
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.reason || err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  // Execute updateShipmentStatus on-chain
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAddress) {
      setMessage({ type: 'error', text: 'Please connect your Web3 wallet first!' });
      return;
    }
    if (!statusShipmentId) {
      setMessage({ type: 'error', text: 'Please enter a valid shipment ID!' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

      let hold = false;
      let complete = false;
      if (targetStatus === 'hold') hold = true;
      else if (targetStatus === 'completed') complete = true;

      console.log(`Updating shipment ${statusShipmentId} status to: hold=${hold}, complete=${complete}`);
      const tx = await contract.updateShipmentStatus(BigInt(statusShipmentId), hold, complete);
      setMessage({ type: 'success', text: 'Transaction broadcasted! Waiting for confirmation...' });
      const receipt = await tx.wait();
      setMessage({
        type: 'success',
        text: `Success! Shipment #${statusShipmentId} status updated on-chain. (Tx: ${receipt.hash.slice(0, 16)}...)`
      });
      setStatusShipmentId('');
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.reason || err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  // Execute revokePillar on-chain
  const handleRevokePillar = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!userAddress) {
      setMessage({ type: 'error', text: 'Please connect your Web3 wallet first!' });
      return;
    }
    if (!ethers.isAddress(pillarAddress)) {
      setMessage({ type: 'error', text: 'Please enter a valid pillar wallet address!' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

      console.log(`Revoking pillar: ${pillarAddress}`);
      const tx = await contract.revokePillar(pillarAddress);
      
      setMessage({ type: 'success', text: 'Transaction broadcasted! Waiting for confirmation...' });
      const receipt = await tx.wait();

      setMessage({
        type: 'success',
        text: `Success! Pillar ${pillarAddress.slice(0, 10)}... authorization revoked. (Tx: ${receipt.hash.slice(0, 16)}...)`
      });
      setPillarAddress('');
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.reason || err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-12">
      {/* Header */}
      <header className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-8 w-8 text-cyan-400 animate-pulse" />
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-400 to-indigo-400 bg-clip-text text-transparent">
              On-Chain Admin Console
            </h1>
          </div>
          <p className="text-slate-400 mt-1 text-sm">
            Configure whitelisted pillars and register asset identity tracking keys.
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
              className="flex items-center gap-2 bg-slate-900 border border-slate-855 hover:bg-slate-805 rounded-full py-1.5 px-4 text-xs font-semibold text-cyan-400 cursor-pointer"
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
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto space-y-8">
        
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
              Contract Configuration
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
                    saveSettings(c, r);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Feedback message */}
        {message && (
          <div className={`p-4 rounded-xl text-sm border flex items-start gap-2.5 ${
            message.type === 'success' 
              ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300' 
              : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Card 1: Register Shipment */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
                <PlusCircle className="h-5 w-5 text-indigo-400" />
                Register New Shipment
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Registers a new shipment ID on-chain with its first physical tracking sensor key.
              </p>

              <form onSubmit={handleRegisterShipment} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">Shipment ID (Numeric)</label>
                  <input
                    type="number"
                    value={shipmentId}
                    onChange={(e) => setShipmentId(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">
                    Initial Sensor Key (Public Address)
                  </label>
                  <input
                    type="text"
                    value={initialSensorKey}
                    readOnly
                    className="w-full bg-slate-950/70 border border-slate-900 rounded-xl px-4 py-2.5 text-slate-400 font-mono text-xs cursor-not-allowed focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    *Derived deterministically from the standard configuration mnemonic.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Shipment Name</label>
                    <input
                      type="text"
                      value={shipmentName}
                      onChange={(e) => setShipmentName(e.target.value)}
                      placeholder="e.g. COVID Vaccines"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Shipment Description</label>
                    <input
                      type="text"
                      value={shipmentDesc}
                      onChange={(e) => setShipmentDesc(e.target.value)}
                      placeholder="e.g. Phase 1 Carrier box"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Ideal Temp Range (°C)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={minTemp}
                        onChange={(e) => setMinTemp(e.target.value)}
                        placeholder="Min (e.g. -25)"
                        className="w-1/2 bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 text-xs placeholder-slate-650 focus:outline-none focus:border-indigo-500 text-center"
                      />
                      <span className="text-slate-500 text-xs">to</span>
                      <input
                        type="number"
                        step="0.1"
                        value={maxTemp}
                        onChange={(e) => setMaxTemp(e.target.value)}
                        placeholder="Max (e.g. -15)"
                        className="w-1/2 bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 text-xs placeholder-slate-650 focus:outline-none focus:border-indigo-500 text-center"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Ideal Humid Range (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={minHumid}
                        onChange={(e) => setMinHumid(e.target.value)}
                        placeholder="Min (e.g. 40)"
                        className="w-1/2 bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 text-xs placeholder-slate-650 focus:outline-none focus:border-indigo-500 text-center"
                      />
                      <span className="text-slate-500 text-xs">to</span>
                      <input
                        type="number"
                        value={maxHumid}
                        onChange={(e) => setMaxHumid(e.target.value)}
                        placeholder="Max (e.g. 60)"
                        className="w-1/2 bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 text-xs placeholder-slate-650 focus:outline-none focus:border-indigo-500 text-center"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">Recording Frequency & Mode</label>
                  <select
                    value={recordingInterval}
                    onChange={(e) => setRecordingInterval(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="5">5 Seconds (Simulation Mode)</option>
                    <option value="60">1 Minute</option>
                    <option value="900">15 Minutes</option>
                    <option value="3600">1 Hour</option>
                    <option value="7200">2 Hours</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">Authorized Witness Pillars for this Shipment</label>
                  {authorizedPillarsList.length === 0 ? (
                    <div className="text-xs text-slate-500 italic bg-slate-950 p-3 rounded-xl border border-slate-900">
                      ⚠️ No pillars authorized yet. Please add a pillar using the whitelist panel first.
                    </div>
                  ) : (
                    <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 max-h-[120px] overflow-y-auto space-y-2 scrollbar-none">
                      {authorizedPillarsList.map((pillar) => {
                        const isChecked = selectedPillars.includes(pillar);
                        const label = pillar.toLowerCase() === '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'.toLowerCase() 
                          ? 'TruckBeacon-Alpha' 
                          : pillar.toLowerCase() === '0x90F79bf6EB2c4f870365E785982E1f101E93b906'.toLowerCase() 
                            ? 'WarehousePillar-Beta' 
                            : `Custom (${pillar.slice(0, 6)}...${pillar.slice(-4)})`;
                        return (
                          <label key={pillar} className="flex items-center gap-2.5 text-xs text-slate-350 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedPillars(prev =>
                                  prev.includes(pillar) ? prev.filter(p => p !== pillar) : [...prev, pillar]
                                );
                              }}
                              className="rounded border-slate-800 text-indigo-650 focus:ring-0 focus:ring-offset-0 bg-slate-900"
                            />
                            <span>{label}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({pillar.slice(0, 8)}...)</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !userAddress}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-indigo-950 flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Register Shipment & Save Thresholds
                </button>
              </form>
            </div>
          </div>

          {/* Card 2: Witness Pillars Management */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
                <UserCheck className="h-5 w-5 text-emerald-400" />
                Pillar Whitelist Manager
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Authorize or revoke trusted infrastructure nodes allowed to witness shipment custody.
              </p>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs text-slate-400 font-semibold block">Pillar Public Wallet Address</label>
                    <button
                      type="button"
                      onClick={() => {
                        const randWallet = ethers.Wallet.createRandom();
                        setPillarAddress(randWallet.address);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem(`pkey_${randWallet.address.toLowerCase()}`, randWallet.privateKey);
                        }
                        setMessage({
                          type: 'success',
                          text: `Generated Pillar Keypair! Address: ${randWallet.address} | Private Key: ${randWallet.privateKey} (Saved locally for demo auto-fill!)`
                        });
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer"
                    >
                      Generate Keypair
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pillarAddress}
                    onChange={(e) => setPillarAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={handleAuthorizePillar}
                    disabled={loading || !userAddress}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-emerald-950 flex items-center justify-center gap-1.5"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Authorize
                  </button>
                  <button
                    onClick={handleRevokePillar}
                    disabled={loading || !userAddress}
                    className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-rose-950 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </button>
                </div>
              </div>
              {/* Authorized Pillars List */}
              <div className="mt-8 pt-6 border-t border-slate-800">
                <h3 className="text-sm font-bold text-slate-350 mb-3 flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  Currently Whitelisted Pillars
                </h3>
                {authorizedPillarsList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No whitelisted pillars found on this contract.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {authorizedPillarsList.map((addr) => (
                      <div key={addr} className="flex justify-between items-center bg-slate-950/70 border border-slate-900 rounded-xl p-2 px-3 text-[10px]">
                        <span className="font-mono text-slate-300">{addr}</span>
                        <button
                          onClick={() => {
                            setPillarAddress(addr);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-[10px] text-slate-500 text-center mt-6">
              *Requires connected wallet to be the smart contract Administrator (Owner).
            </div>
          </div>

          {/* Card 3: Shipment Status Manager */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden flex flex-col justify-between md:col-span-2 max-w-xl mx-auto w-full">
            <div>
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
                <Cpu className="h-5 w-5 text-indigo-400" />
                Shipment Status Manager
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Update a shipment's active lifecycle state on-chain. Only shipments in the **In-Transit** state are allowed to run custody simulations or submit log telemetry.
              </p>

              <form onSubmit={handleUpdateStatus} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Shipment ID (Numeric)</label>
                    <input
                      type="number"
                      value={statusShipmentId}
                      onChange={(e) => setStatusShipmentId(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Set Target Status</label>
                    <select
                      value={targetStatus}
                      onChange={(e) => setTargetStatus(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                    >
                      <option value="transit">In-Transit</option>
                      <option value="hold">On Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !userAddress}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-indigo-950 flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Update Status On-Chain
                </button>
              </form>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
