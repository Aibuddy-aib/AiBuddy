import React, { FC, useCallback, useEffect, useState, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { toast } from 'react-hot-toast';

interface SolanaWalletConnectProps {
  onWalletConnect?: (walletAddress: string) => void;
  onWalletDisconnect?: () => void;
}

export const SolanaWalletConnect: FC<SolanaWalletConnectProps> = ({ 
  onWalletConnect,
  onWalletDisconnect
}) => {
  const { publicKey, connected, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const hasNotifiedConnect = useRef<boolean>(false);
  const lastConnectedAddress = useRef<string | null>(null);

  // Handle connection changes
  useEffect(() => {
    if (connected && publicKey) {
      const address = publicKey.toString();
      setWalletAddress(address);
      
      // Only trigger callback when address changes or on first connection
      if (onWalletConnect && (!hasNotifiedConnect.current || lastConnectedAddress.current !== address)) {
        console.log("[Solana Wallet] Connected:", address);
        onWalletConnect(address);
        toast.success("Solana wallet connected successfully");
        hasNotifiedConnect.current = true;
        lastConnectedAddress.current = address;
      }
    } else if (!connected) {
      // Reset state when disconnected
      const wasConnected = walletAddress !== null;
      setWalletAddress(null);
      
      if (wasConnected && onWalletDisconnect) {
        console.log("[Solana Wallet] Disconnected");
        onWalletDisconnect();
        hasNotifiedConnect.current = false;
        lastConnectedAddress.current = null;
      }
    }
  }, [connected, publicKey, onWalletConnect, onWalletDisconnect]);

  // Disconnect handler
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      toast.success("Solana wallet disconnected");
      hasNotifiedConnect.current = false;
      lastConnectedAddress.current = null;
      
      // Add a very short delay before refreshing the page, ensuring disconnect operation completes
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error) {
      console.error("[Solana Wallet] Error during disconnect:", error);
      toast.error("Failed to disconnect wallet");
    }
  }, [disconnect]);

  return (
    <div className="flex flex-col w-full">
      {connected ? (
        <div className="flex flex-col items-center">
          <p className="text-sm text-gray-400 mb-2">Connected to Solana Wallet</p>
          <p className="text-xs text-gray-500 mb-4 truncate w-full text-center">
            {walletAddress}
          </p>
          <button
            onClick={handleDisconnect}
            className="w-full py-2 bg-red-500 hover:bg-red-600 rounded-md text-sm font-medium"
          >
            Disconnect Solana Wallet
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <WalletMultiButton className="w-full py-2 bg-purple-500 hover:bg-purple-600 rounded-md text-sm font-medium">
            Connect Solana Wallet
          </WalletMultiButton>
        </div>
      )}
    </div>
  );
};

export default SolanaWalletConnect; 