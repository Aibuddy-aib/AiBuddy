import { useRef, useState, useEffect, useCallback } from 'react';
import PixiGame from './PixiGame.tsx';
import ChatPanel from './ChatPanel.tsx';
import ProfileSidebar from './ProfileSidebar.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery, useMutation } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { toast } from 'react-hot-toast';
import SolanaWalletConnect from './SolanaWalletConnect';
import SolanaWalletProvider from './SolanaWalletProvider';
import { Id } from '../../convex/_generated/dataModel';
import { requestSignature, type SignatureData, switchToTargetNetwork, isNetworkSupported, getNetworkName } from '../utils/walletSignature';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

// Define types for window.ethereum and window.solana
declare global {
  interface Window {
    ethereum?: any;
    solana?: any;
  }
}

// PIXI game component wrapper, wrapped with error boundary
const PixiGameWrapper = ({ 
  game, 
  worldId, 
  engineId, 
  width, 
  height, 
  historicalTime, 
  setSelectedElement, 
  userAddress,
  convex
}: any) => {
  return (
    <ErrorBoundary fallback={
      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white">
        <div className="text-center p-6 max-w-md">
          <h3 className="text-xl font-bold mb-4">Game Rendering Error</h3>
          <p className="mb-4">An error occurred while rendering the game interface. This may be due to network connection issues or resource loading failures.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Refresh Page
          </button>
        </div>
      </div>
    }>
      <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
        <ConvexProvider client={convex}>
          <PixiGame
            game={game}
            worldId={worldId}
            engineId={engineId}
            width={width}
            height={height}
            historicalTime={historicalTime}
            setSelectedElement={setSelectedElement}
            userAddress={userAddress}
          />
        </ConvexProvider>
      </Stage>
    </ErrorBoundary>
  );
};

function generateSecureRandomName(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(array[i] % chars.length);
  }
  return result;
}

interface GameProps {
  selectedWorldId?: Id<'worlds'> | null;
  onWorldChange?: (worldId: Id<'worlds'>) => void;
}

export default function Game({ selectedWorldId, onWorldChange }: GameProps) {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  
  // Add wallet connection state
  const [connectedWalletAddress, setConnectedWalletAddress] = useState<string | null>(null);
  
  // Determine if it's a mobile device
  const [isMobile, setIsMobile] = useState(false);
  // Add mobile view switching state, add chat option
  const [mobileView, setMobileView] = useState<'game' | 'profile' | 'details' | 'chat'>('game');
  
  // Add registration state tracking
  const [isRegistered, setIsRegistered] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  
  // Add world selection logic
  const [currentWorldId, setCurrentWorldId] = useState<Id<'worlds'> | null>(null);
  // const [selectedWorldForLogin, setSelectedWorldForLogin] = useState<Id<'worlds'> | null>(null);

  const registrationDelay = useRef<NodeJS.Timeout | null>(null);
  const pendingAutoRegister = useRef(false);

  // Use the passed selectedWorldId, if not available use default world
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = selectedWorldId || worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);
  
  // Add reference for last registration attempt time
  const lastRegistrationAttempt = useRef(0);

  // login
  const loginMutation = useMutation(api.newplayer.loginPlayer);

  // register
  const registerMutation = useMutation(api.newplayer.registerPlayer);

  // verify signature
  const verifySignatureMutation = useMutation(api.newplayer.verifyWalletSignature);

  // useEffect(() => {
  //   if (engineId && player?.playerId) {
  //     usePlayerHeartbeat(engineId, player.playerId);
  //     console.log("player heartbeat: ", player.playerId);
  //   }
  // }, [engineId, player]);
  
  // Listen for worldId changes, assign value on first entry
  useEffect(() => {
    if (worldId && !currentWorldId) setCurrentWorldId(worldId);
  }, [worldId]);

  // Listen for selectedWorldId changes, update current world ID
  useEffect(() => {
    if (selectedWorldId) {
      setCurrentWorldId(selectedWorldId);
    }
  }, [selectedWorldId]);
  
  // Detect device type
  useEffect(() => {
    const checkDeviceType = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };
    
    // Initial detection
    checkDeviceType();
    
    // Listen for window size changes
    window.addEventListener('resize', checkDeviceType);
    
    return () => {
      window.removeEventListener('resize', checkDeviceType);
    };
  }, []);

  useEffect(() => {
    async function checkWalletConnection() {
      console.log(`[flash] check ethereum ${window.ethereum} and connectedWalletAddress ${localStorage.getItem('connectedWalletAddress')}`);
      if (window.ethereum && localStorage.getItem('connectedWalletAddress')) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0]) {
          setConnectedWalletAddress(accounts[0]);
          localStorage.setItem('connectedWalletAddress', accounts[0]);
          // Only login player if not already logged in or if this is the initial load
          if (!player) {
            const player = await loginPlayer(accounts[0], selectedWorldId || worldId);
            if (player) {
              setPlayer(player);
            }
          }
        } else {
          setConnectedWalletAddress(null);
          setPlayer(null);
          localStorage.removeItem('connectedWalletAddress');
        }
      }
    }
    if (worldId) {
      checkWalletConnection();
    }
  }, [worldId, player]);

  // Connect Ethereum wallet function with signature authentication
  const connectWallet = async () => {
    try {
      // Check if there's MetaMask or other Ethereum provider
      if (window.ethereum) {
        console.log("[wallet] Ethereum provider detected");
        
        try {
          // First request user authorization to connect account (popup MetaMask window)
          console.log("[debug] Requesting user authorization...");
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          console.log("[debug] Got accounts:", accounts);
          const account = accounts[0];
          
          // After user authorization, check and switch network
          console.log("[debug] Checking network...");
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          console.log("[debug] Current network chainId:", chainId);
          
          // Check if current network is supported
          if (!isNetworkSupported(chainId)) {
            console.log("[debug] Current network not supported, switching to BSC...");
            toast("Switching to BSC network...");
            await switchToTargetNetwork();
          } else if (chainId !== '0x38') {
            // If on supported network but not BSC mainnet, switch to BSC
            console.log("[debug] On supported network but not BSC mainnet, switching...");
            toast("Switching to BSC mainnet for best experience...");
            await switchToTargetNetwork();
          } else {
            console.log("[debug] Already on BSC mainnet");
          }
          
          // Request signature for authentication
          console.log("[debug] Requesting signature for authentication...");
          const signatureData = await requestSignature(account);
          console.log("[debug] Got signature:", signatureData);
          
          // Verify signature on backend
          const verifyResult = await verifySignatureMutation({
            ethAddress: account,
            signature: signatureData.signature,
            message: signatureData.message,
            worldId: selectedWorldId || worldStatus?.worldId!
          });
          
          if (!verifyResult.success) {
            if (verifyResult.requiresRegistration) {
              // Player not found, proceed with registration
              console.log("[wallet] Player not found, proceeding with registration");
              const player = await loginPlayer(account, selectedWorldId || worldStatus?.worldId);
              if (player) {
                setConnectedWalletAddress(account);
                setPlayer(player);
                toast.success("Wallet connected and player registered successfully!");
              }
            } else {
              throw new Error(verifyResult.message);
            }
          } else {
            // Signature verified successfully or player exists in different world
            console.log("[wallet] Signature verified successfully");
            setConnectedWalletAddress(account);
            toast.success("Wallet connected and authenticated successfully!");
            
            const player = await loginPlayer(account, selectedWorldId || worldStatus?.worldId);
            if (player) {
              setPlayer(player);
            }
          }
        } catch (error) {
          console.error("[wallet] User rejected the connection or signature request", error);
          toast.error("Failed to connect wallet. User rejected the request.");
        }
      } else {
        console.log("[wallet] No Ethereum provider found");
        toast.error("No wallet detected! Please install MetaMask or other Web3 wallet.");
      }
    } catch (error) {
      console.error("[wallet] Error connecting to wallet:", error);
      toast.error("Failed to connect wallet. Please try again.");
    }
  };

  const loginPlayer = async (account: string, worldId: Id<'worlds'> | undefined) => {
    const loginResult = await loginMutation({
      worldId: worldId!,
      ethAddress: account
    });

    // login, if player not found, register player
    if (!loginResult.success && (loginResult.player === null)) {
      console.log("[wallet] login player failed, register player: ", loginResult);
      const registerResult = await registerMutation({
        worldId: worldId!,
        name: generateSecureRandomName(8),
        ethAddress: account,
      });
      if (registerResult.success) {
        // Set the world ID for the newly registered player
        if (registerResult.worldId) {
          setCurrentWorldId(registerResult.worldId);
          if (onWorldChange) {
            onWorldChange(registerResult.worldId);
          }
        }
        return registerResult.player;
      } else {
        console.log("register player failed", registerResult);
        return;
      }
    }

    // Handle case where player exists in different world
    if (loginResult.success && loginResult.player && loginResult.message?.includes('different world')) {
      const playerWorldId = loginResult.player.worldId;
      
      // Switch to player's world
      setCurrentWorldId(playerWorldId);
      if (onWorldChange) {
        onWorldChange(playerWorldId);
      }
      
      // Try to login again in the correct world
      const retryLoginResult = await loginMutation({
        worldId: playerWorldId,
        ethAddress: account
      });
      
      if (retryLoginResult.success) {
        localStorage.setItem('connectedWalletAddress', account);
        return retryLoginResult.player;
      }
    }

    // cache
    localStorage.setItem('connectedWalletAddress', account);

    return loginResult.player;
  }

  // Disconnect wallet function
  const disconnectWallet = () => {
    // Clear connection state
    setConnectedWalletAddress(null);
    
    // Clear username saved in localStorage, so no character highlighting in scene
    localStorage.removeItem('currentUserName');
    localStorage.removeItem('connectedWalletAddress');
    
    // Reset other related states
    setIsRegistered(false);
    // setIsShowingRegPrompt(false);
    pendingAutoRegister.current = false;
    
    if (registrationDelay.current) {
      clearTimeout(registrationDelay.current);
      registrationDelay.current = null;
    }
    
    // Show disconnect success message
    toast.success("Wallet disconnected successfully");
    
    // Add a short delay before refreshing page to ensure disconnect operation completes
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Handle Solana wallet connection
  const handleSolanaWalletConnect = useCallback(async (address: string) => {
    // Check if same as currently connected address to avoid duplicate connection
    if (connectedWalletAddress === address) {
      console.log("[solana wallet] Ignore duplicate connection request, same address:", address);
      return;
    }
    
    console.log("[solana wallet] Connected to wallet:", address);
    setConnectedWalletAddress(address);

    const player = await loginPlayer(address, worldStatus?.worldId);
    if (player) {
      setPlayer(player);
    }
  }, [connectedWalletAddress, player]);

  // Handle Solana wallet disconnection
  const handleSolanaWalletDisconnect = useCallback(() => {
    // Call common disconnect function
    disconnectWallet();
  }, []);

  // Use useEffect to check if already registered
  useEffect(() => {
    if (player) {
      console.log("[check] User data queried from database:", player);
      setIsRegistered(true);
      
      if (registrationDelay.current) {
        clearTimeout(registrationDelay.current);
        registrationDelay.current = null;
      }
    } 
    
    // Clear timer when component unmounts
    return () => {
      if (registrationDelay.current) {
        clearTimeout(registrationDelay.current);
      }
    };
  }, [player, connectedWalletAddress, isRegistered]);

  // monitor player change, trigger auto register
  useEffect(() => {
    let isMounted = true; // Component mount state marker
    
    const autoRegister = async () => {
      // Prevent duplicate registration: check if registration was attempted recently (within 1 second)
      const now = Date.now();
      if (now - lastRegistrationAttempt.current < 1000) {
        console.log("[auto register] Ignore duplicate registration requests in short time");
        return;
      }
      
      lastRegistrationAttempt.current = now;
      if (connectedWalletAddress && !isRegistered && pendingAutoRegister.current && isMounted) {
        console.log("[auto register] Player changed, trigger auto register");
        pendingAutoRegister.current = false;
        await registerMutation({
          worldId: worldId!,
          name: generateSecureRandomName(8),
          ethAddress: connectedWalletAddress,
        });
      }
    };
    
    autoRegister();
    
    return () => {
      isMounted = false; // Update marker when component unmounts
    };
  }, [connectedWalletAddress, isRegistered, registerMutation]);
  
  // Custom setSelectedElement handler function, add logs for debugging
  const handleSetSelectedElement = (element?: { kind: 'player'; id: GameId<'players'> }) => {
    console.log("Game: handleSetSelectedElement called, parameter:", element);
    setSelectedElement(element);
    console.log("Game: selectedElement updated to:", element);
    
    // On mobile, automatically switch to details view after selecting character
    if (isMobile && element) {
      handleMobileViewChange('details');
    } else if (element) {
      // Desktop also scroll to top
      window.scrollTo(0, 0);
      
      // If there's a scroll view reference, also scroll it to top
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTop = 0;
      }
    }
  };
  
  // Listen for selectedElement changes
  useEffect(() => {
    console.log("Game: selectedElement state change:", selectedElement);
  }, [selectedElement]);
  
  // Add ESC key exit functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedElement) {
        console.log("Game: ESC key pressed, clearing selection");
        setSelectedElement(undefined);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement]);
  
  const [gameWrapperRef, { width, height }] = useElementSize();

  // Add ref to track if initial character has been set
  const initialPlayerSelected = useRef(false);

  useEffect(() => {
    // Only set player as self on initial load, use ref to track if already initialized
    if (player && player.playerId && game && !initialPlayerSelected.current) {
      setSelectedElement({
        kind: 'player',
        id: player.playerId
      });
      initialPlayerSelected.current = true; // Mark as initialized
    }
  }, [player, game]);

  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);

  // Handle mobile view switching, special handling for chat view
  const handleMobileViewChange = (view: 'game' | 'profile' | 'details' | 'chat') => {
    // When switching to chat view, ensure chat panel is expanded
    if (view === 'chat') {
      try {
        localStorage.setItem('chatPanelCollapsed', 'false');
      } catch (e) {
        console.error('Unable to update chat panel state:', e);
      }
    }
    
    // Scroll to page top
    window.scrollTo(0, 0);
    
    // If view has corresponding container ref, also scroll it to top
    if (view === 'details' && scrollViewRef.current) {
      scrollViewRef.current.scrollTop = 0;
    }
    
    setMobileView(view);
  };

  if (!worldId || !engineId || !game) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-white">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }
  
  return (
    <ErrorBoundary>
      <SolanaWalletProvider>
      
      {/* Hidden global Solana wallet connection component, ensure mobile can also use */}
      <div className="hidden">
        <SolanaWalletConnect 
          onWalletConnect={handleSolanaWalletConnect}
          onWalletDisconnect={handleSolanaWalletDisconnect}
        />
      </div>
      
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      {/* Only show ChatPanel on desktop */}
      {!isMobile && worldId && 
        <ChatPanel 
          worldId={worldId} 
          engineId={engineId} 
          userData={player} 
          userAddress={connectedWalletAddress}
          isMobile={false}
        />
      }
      
      {/* Official website floating button - only show in production */}
      {process.env.NODE_ENV === 'production' && (
        <a 
          href="https://aibuddy.top/#/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="fixed top-4 left-4 z-50 px-4 py-2 bg-amber-400 hover:bg-amber-500 text-black rounded-md text-sm font-medium transition-all transform hover:scale-105 shadow-lg"
        >
          Official Website
        </a>
      )}
      
      {/* Mobile layout */}
      {isMobile ? (
        <div className="mx-auto w-full flex flex-col h-screen max-w-[1900px] overflow-hidden">
          {/* Main content area - display different content based on current view, add bottom padding to prevent being covered by navigation bar */}
          <div className="flex-1 overflow-hidden pb-16">
            {/* Only render game component when game view is selected, completely unload it when switching */}
            {mobileView === 'game' ? (
              <div className="relative h-full overflow-hidden bg-brown-900" ref={gameWrapperRef}>
                <div className="absolute inset-0">
                  <div className="w-full h-full">
                        <PixiGameWrapper
                          key={`game-${worldId}`} // Add key to ensure component is recreated when switching worlds
                          game={game}
                          worldId={worldId}
                          engineId={engineId}
                          width={width}
                          height={height}
                          historicalTime={historicalTime}
                          setSelectedElement={handleSetSelectedElement}
                          userAddress={connectedWalletAddress}
                          convex={convex}
                        />
                  </div>
                </div>
              </div>
            ) : null}
            
            {/* Only render profile component when profile view is selected */}
            {mobileView === 'profile' ? (
              <div className="h-full overflow-y-auto scrollbar">
                <ProfileSidebar 
                  worldId={worldId}
                  game={game}
                  userData={player} 
                  userAddress={connectedWalletAddress} 
                  onConnectWallet={connectWallet}
                  onDisconnectWallet={disconnectWallet}
                  onSolanaWalletConnect={handleSolanaWalletConnect}
                  onWorldChange={onWorldChange}
                />
              </div>
            ) : null}
            
            {/* Only render details component when details view is selected */}
            {mobileView === 'details' ? (
              <div className="h-full overflow-y-auto scrollbar" ref={scrollViewRef}>
                <PlayerDetails
                  worldId={worldId}
                  engineId={engineId}
                  game={game}
                  playerId={selectedElement?.id}
                  setSelectedElement={handleSetSelectedElement}
                  scrollViewRef={scrollViewRef}
                  userData={player}
                  userAddress={connectedWalletAddress}
                />
              </div>
            ) : null}
            
            {/* Only render chat component when chat view is selected */}
            {mobileView === 'chat' ? (
              <div className="h-full flex flex-col bg-gray-900">
                <div className="flex-1 overflow-hidden">
                  <ChatPanel 
                    worldId={worldId} 
                    engineId={engineId} 
                    userData={player} 
                    userAddress={connectedWalletAddress}
                    isMobile={true}
                  />
                </div>
              </div>
            ) : null}
          </div>
          
          {/* Bottom navigation bar - fixed at screen bottom */}
          <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex justify-around p-2 z-10 shadow-lg">
            <button 
              onClick={() => handleMobileViewChange('profile')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'profile' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs mt-1">Profile</span>
            </button>
            <button 
              onClick={() => handleMobileViewChange('game')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'game' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs mt-1">World</span>
            </button>
            <button 
              onClick={() => handleMobileViewChange('details')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'details' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs mt-1">Details</span>
            </button>
            <button 
              onClick={() => handleMobileViewChange('chat')} 
              className={`p-2 rounded-md flex flex-col items-center ${mobileView === 'chat' ? 'bg-gray-800 text-amber-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-xs mt-1">Chat</span>
            </button>
          </div>
        </div>
      ) : (
        /* Desktop layout - add ProfileSidebar */
        <div className="mx-auto w-full grid grid-rows-[1fr] grid-cols-[320px_1fr_auto] grow max-w-[1900px] min-h-[600px] max-h-[650px] rounded-b-xl overflow-hidden border-4 border-gray-300 shadow-2xl">
          {/* Left profile sidebar, fixed width */}
            <div className="w-[320px] h-full overflow-hidden flex flex-col">
            <ProfileSidebar 
              worldId={worldId}
              game={game}
              userData={player} 
              userAddress={connectedWalletAddress} 
              onConnectWallet={connectWallet}
              onDisconnectWallet={disconnectWallet}
              onSolanaWalletConnect={handleSolanaWalletConnect}
              onWorldChange={onWorldChange}
            />
          </div>
          
          <div className="relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
            <div className="absolute inset-0">
              <div className="container">
                <PixiGameWrapper
                  key={`game-${worldId}`} // Add key to ensure component is recreated when switching worlds
                  game={game}
                  worldId={worldId}
                  engineId={engineId}
                  width={width}
                  height={height}
                  historicalTime={historicalTime}
                  setSelectedElement={handleSetSelectedElement}
                  userAddress={connectedWalletAddress}
                  convex={convex}
                />
              </div>
            </div>
          </div>
          <div
            className="w-72 flex flex-col overflow-y-auto shrink-0 bg-slate-900 border-l border-gray-800 shadow-inner scrollbar"
            ref={scrollViewRef}
          >
            <PlayerDetails
              worldId={worldId}
              engineId={engineId}
              game={game}
              playerId={selectedElement?.id}
              setSelectedElement={handleSetSelectedElement}
              scrollViewRef={scrollViewRef}
              userData={player}
              userAddress={connectedWalletAddress}
            />
          </div>
        </div>
      )}
      </SolanaWalletProvider>
    </ErrorBoundary>
  );
}
