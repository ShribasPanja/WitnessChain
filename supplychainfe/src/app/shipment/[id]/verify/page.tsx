'use client';

import { useState, useEffect, use } from 'react';
import { ShieldCheck, ShieldAlert, Cpu, Thermometer, Droplet, Clock, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { ethers } from 'ethers';
import { CONFIG, CONTRACT_ABI } from '../../../../lib/config';

interface VerifyData {
  success: boolean;
  shipmentId: string;
  metadata: {
    name: string;
    description: string;
    minTemp: number;
    maxTemp: number;
    minHumid: number;
    maxHumid: number;
  };
  safe: boolean;
  violationsCount: number;
  violations: Array<{
    timestamp: number;
    temperature: number;
    humidity: number;
    location: string;
    reason: string;
  }>;
  totalChecks: number;
  blockchain: {
    active: boolean;
    completed: boolean;
    onHold: boolean;
    rotationCount: number;
    contractAddress: string;
  };
}

export default function VerifyShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const shipmentId = resolvedParams.id;
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyDirectly = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
        
        // 1. Fetch metadata off-chain (name, description, bounds)
        let metadata = {
          name: `Shipment #${shipmentId}`,
          description: 'No registered description.',
          minTemp: -25.0,
          maxTemp: -15.0,
          minHumid: 40.0,
          maxHumid: 60.0
        };
        try {
          const metaRes = await fetch(`/api/shipment-metadata?shipmentId=${shipmentId}`);
          const metaData = await metaRes.json();
          if (metaData.success) {
            metadata = metaData.metadata;
          }
        } catch (e) {
          console.warn('Could not fetch off-chain metadata:', e);
        }

        // 2. Fetch shipment telemetry logs
        let telemetryLogs: any[] = [];
        try {
          const telRes = await fetch('/api/telemetry');
          const telData = await telRes.json();
          if (telData.telemetry) {
            telemetryLogs = telData.telemetry
              .filter((t: any) => t.shipmentId === shipmentId)
              .sort((a: any, b: any) => a.timestamp - b.timestamp);
          }
        } catch (e) {
          console.warn('Could not fetch telemetry logs:', e);
        }

        // 3. Query contract directly
        const contract = new ethers.Contract(CONFIG.contractAddress, CONTRACT_ABI, provider);
        const onChainInfo = await contract.getShipmentInfo(BigInt(shipmentId));
        
        const blockchainData = {
          active: onChainInfo[2],
          completed: onChainInfo[3],
          onHold: onChainInfo[4],
          rotationCount: Number(onChainInfo[1]),
          contractAddress: CONFIG.contractAddress
        };

        // 4. Query KeyRotated events on-chain
        const filter = contract.filters.KeyRotated(BigInt(shipmentId));
        const rotationEvents = await contract.queryFilter(filter);

        // Map events by rotationCount
        const eventMap = new Map<number, any>();
        rotationEvents.forEach((ev: any) => {
          eventMap.set(Number(ev.args[4]), {
            pillar: ev.args[1],
            oldKey: ev.args[2],
            newKey: ev.args[3]
          });
        });

        // 5. Audit logs against boundaries and verify signatures directly
        const violations: any[] = [];
        let totalChecks = 0;

        for (let i = 0; i < telemetryLogs.length; i++) {
          const log = telemetryLogs[i];
          const tempViolated = log.temperature < metadata.minTemp || log.temperature > metadata.maxTemp;
          const humidViolated = log.humidity !== undefined && (log.humidity < metadata.minHumid || log.humidity > metadata.maxHumid);
          
          let sigValid = true;
          const rotationIndex = i; // Sequence corresponds to rotationCount
          const event = eventMap.get(rotationIndex + 1);
          
          if (event && log.witnessSignature) {
            try {
              const msgHash = ethers.solidityPackedKeccak256(
                ['uint256', 'address', 'uint256'],
                [BigInt(shipmentId), event.newKey, BigInt(rotationIndex)]
              );
              const recovered = ethers.verifyMessage(ethers.getBytes(msgHash), log.witnessSignature);
              if (recovered.toLowerCase() !== event.pillar.toLowerCase()) {
                sigValid = false;
              }
            } catch (sigErr) {
              sigValid = false;
            }
          }

          if (tempViolated || humidViolated || !sigValid) {
            violations.push({
              timestamp: Number(log.timestamp),
              temperature: log.temperature,
              humidity: log.humidity,
              location: log.location,
              reason: !sigValid 
                ? 'Signature verification failed (Pillar key spoofed!)'
                : tempViolated 
                  ? `Temperature ${log.temperature}°C out of range (${metadata.minTemp}°C to ${metadata.maxTemp}°C)`
                  : `Humidity ${log.humidity}% out of range (${metadata.minHumid}% to ${metadata.maxHumid}%)`
            });
          }
          totalChecks++;
        }

        setData({
          success: true,
          shipmentId,
          metadata,
          safe: violations.length === 0,
          violationsCount: violations.length,
          violations,
          totalChecks,
          blockchain: blockchainData
        });
      } catch (err: any) {
        console.error('Direct verification error:', err);
        setError(err.message || 'Failed to verify shipment directly from blockchain.');
      } finally {
        setLoading(false);
      }
    };
    verifyDirectly();
  }, [shipmentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <Cpu className="h-10 w-10 text-indigo-400 animate-spin mb-4" />
        <p className="text-sm text-slate-400 font-semibold animate-pulse">Running cryptographic journey audits...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-200">Verification Failed</h1>
          <p className="text-sm text-slate-400 leading-relaxed">{error || 'This shipment ID is not recognized by the system.'}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl transition-all font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        
        {/* Verification Status Card */}
        <div className={`relative overflow-hidden rounded-3xl border p-8 backdrop-blur-md shadow-2xl transition-all duration-500 ${
          data.safe 
            ? 'bg-emerald-950/20 border-emerald-500/30 shadow-emerald-950/10' 
            : 'bg-rose-950/20 border-rose-500/30 shadow-rose-950/10'
        }`}>
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl -z-10" />

          <div className="flex flex-col items-center text-center space-y-6">
            {data.safe ? (
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl scale-125 animate-pulse" />
                <ShieldCheck className="h-20 w-20 text-emerald-400 relative" />
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl scale-125 animate-pulse" />
                <ShieldAlert className="h-20 w-20 text-rose-500 relative" />
              </div>
            )}

            <div className="space-y-2">
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                data.safe 
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40' 
                  : 'bg-rose-950/60 text-rose-450 border-rose-800/40'
              }`}>
                {data.safe ? 'Verified Safe & Intact' : 'Warning: Temperature Out-of-Range'}
              </span>
              <h1 className="text-3xl font-black tracking-tight text-slate-100">{data.metadata.name}</h1>
              <p className="text-xs text-slate-400">{data.metadata.description}</p>
            </div>

            {/* Consumer Guarantee Banner */}
            <div className="w-full bg-slate-900/80 border border-slate-850 rounded-2xl p-4 flex items-center justify-between text-left">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">Blockchain Anchor</span>
                <span className="text-xs font-semibold text-slate-300">
                  Secured via Ephemeral Ratchet Count: <strong className="text-indigo-400">{data.blockchain.rotationCount}</strong>
                </span>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-400 py-1 px-3 rounded-lg border border-slate-700 font-bold">
                ID #{data.shipmentId}
              </span>
            </div>
          </div>
        </div>

        {/* Audit Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Section 1: Journey Audit Bounds */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ideal Transit Parameters</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-850">
                <div className="flex items-center gap-2 text-slate-300 text-xs">
                  <Thermometer className="h-4 w-4 text-cyan-400" />
                  <span>Allowed Temperature</span>
                </div>
                <span className="text-xs font-bold text-slate-200">
                  {data.metadata.minTemp}°C to {data.metadata.maxTemp}°C
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-850">
                <div className="flex items-center gap-2 text-slate-300 text-xs">
                  <Droplet className="h-4 w-4 text-blue-400" />
                  <span>Allowed Humidity</span>
                </div>
                <span className="text-xs font-bold text-slate-200">
                  {data.metadata.minHumid}% to {data.metadata.maxHumid}%
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Audit Results */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Auditing Statistics</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-850">
                <div className="flex items-center gap-2 text-slate-300 text-xs">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>Total Checkpoints Verified</span>
                </div>
                <span className="text-xs font-black text-slate-200">{data.totalChecks}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-850">
                <div className="flex items-center gap-2 text-slate-300 text-xs">
                  <AlertTriangle className={`h-4 w-4 ${data.safe ? 'text-slate-450' : 'text-rose-500'}`} />
                  <span>Threshold Violations</span>
                </div>
                <span className={`text-xs font-black ${data.safe ? 'text-emerald-400' : 'text-rose-450 animate-pulse'}`}>
                  {data.violationsCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Violations Timeline Log if unsafe */}
        {!data.safe && data.violations.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Detected Temperature Violations
            </h3>
            
            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 scrollbar-none">
              {data.violations.map((violation, idx) => (
                <div key={idx} className="bg-slate-950 border border-rose-900/30 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-semibold">{new Date(violation.timestamp).toLocaleString()}</span>
                    <span className="bg-rose-950/80 text-rose-400 border border-rose-900/40 px-2 py-0.5 rounded-full font-bold">
                      EXCEEDED LIMIT
                    </span>
                  </div>
                  <p className="text-xs text-slate-350">{violation.reason}</p>
                  <span className="text-[9px] text-slate-500 block italic">Recorded at: {violation.location}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Footer Credits */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-[10px] text-slate-600 font-medium">
            This verification audit was automatically derived from the cold chain smart contract deployed at:<br />
            <span className="font-mono text-[9px] text-slate-500 block mt-1 break-all select-all">{data.blockchain.contractAddress}</span>
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard Console
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
