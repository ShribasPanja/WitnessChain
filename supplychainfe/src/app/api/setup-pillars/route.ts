import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { CONFIG, CONTRACT_ABI } from '../../../lib/config';
import { getAuthorizedPillars } from '../../../lib/mock_data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      contractAddress = CONFIG.contractAddress, 
      rpcUrl = CONFIG.rpcUrl 
    } = body;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Master node from standard Anvil mnemonic
    const masterNode = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(CONFIG.mnemonic)
    );
    
    // Admin is account index 0
    const adminWallet = masterNode.connect(provider);
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, adminWallet);

    const pillars = getAuthorizedPillars();
    const results = [];

    for (const pillar of pillars) {
      const address = pillar.getAddress();
      const isAuthorized = await contract.isPillarAuthorized(address);
      
      if (!isAuthorized) {
        console.log(`Authorizing pillar ${pillar.name} (${address}) on-chain...`);
        const tx = await contract.authorizePillar(address);
        const receipt = await tx.wait();
        results.push({
          pillarName: pillar.name,
          address,
          status: 'authorized',
          txHash: receipt.hash,
        });
      } else {
        results.push({
          pillarName: pillar.name,
          address,
          status: 'already-authorized',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Pillars setup complete',
      results,
    });

  } catch (error: any) {
    console.error('Setup pillars failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to setup pillars' 
    }, { status: 500 });
  }
}
