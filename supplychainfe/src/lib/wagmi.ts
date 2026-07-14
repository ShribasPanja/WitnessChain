import { http, createConfig } from 'wagmi';
import { foundry, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [foundry, sepolia],
  connectors: [
    injected({ target: 'metaMask' })
  ],
  ssr: true,
  transports: {
    [foundry.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(),
  },
});
