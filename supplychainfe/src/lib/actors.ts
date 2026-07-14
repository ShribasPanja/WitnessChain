import { ethers } from 'ethers';

export class WitnessNode {
  private wallet: ethers.HDNodeWallet | ethers.Wallet;
  public name: string;

  constructor(name: string, privateKey?: string) {
    this.name = name;
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey);
    } else {
      this.wallet = ethers.Wallet.createRandom();
    }
  }

  async signChallenge(nonce: string): Promise<string> {
    const message = `COLD_CHAIN_WITNESS:${nonce}`;
    const signature = await this.wallet.signMessage(message);
    return signature;
  }

  getAddress(): string {
    return this.wallet.address;
  }

  getWallet(): ethers.HDNodeWallet | ethers.Wallet {
    return this.wallet;
  }
}

export class SensorDevice {
  public deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 12; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }
}
