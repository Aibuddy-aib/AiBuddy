import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'react-hot-toast';
import { ServerGame } from '../hooks/serverGame';
import NFTInventory from './NFTInventory';
import InfoModal from './InfoModal';
import EditProfileModal from './EditProfileModal';
import RandomEventModal from './RandomEventModal';
import SkillModal from './SkillModal';
import SolanaWalletConnect from './SolanaWalletConnect';
import WorksListModal from './WorksListModal';
import BlindBox from './BlindBox';
import { Id } from '../../convex/_generated/dataModel';
import { WORK_DURATION, SKILL_MAP, DEFAULT_SKILL_INFO } from '../../convex/constants';
import { parseGameId } from '../../convex/aiTown/ids';

type Timer = ReturnType<typeof setTimeout>;

interface ProfileSidebarProps {
  worldId?: Id<'worlds'>;
  game?: ServerGame;
  userData?: any;
  userAddress?: string | null;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
  onSolanaWalletConnect?: (address: string) => void;
  onWorldChange?: (worldId: Id<'worlds'>) => void;
}

function ProfileSidebar({ 
  worldId,
  game,
  userData, 
  userAddress, 
  onConnectWallet, 
  onDisconnectWallet,
  onSolanaWalletConnect,
  onWorldChange
}: ProfileSidebarProps) {
  const [name, setName] = useState<string>('');
  const [isTokenIncreasing, setIsTokenIncreasing] = useState<boolean>(false);
  const [isTokenDecreasing, setIsTokenDecreasing] = useState<boolean>(false);
  const [displayTokens, setDisplayTokens] = useState<number>(0);
  const [prevTokens, setPrevTokens] = useState<number>(0);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [workProgress, setWorkProgress] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<string>('08:00:00');
  const [avatarPath, setAvatarPath] = useState<string>("/assets/f1.png");
  const [isNFTInventoryOpen, setIsNFTInventoryOpen] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState<boolean>(false);
  const [isRandomEventsModalOpen, setIsRandomEventsModalOpen] = useState<boolean>(false);
  const [isSkillModalOpen, setIsSkillModalOpen] = useState<boolean>(false);
  const [userSkill, setUserSkill] = useState<string | null>(null);
  const [userUsedSkills, setUserUsedSkills] = useState<string[]>([]);
  const [isBlindBoxOpen, setIsBlindBoxOpen] = useState<boolean>(false);
  
  const [isWorkCompleteModalOpen, setIsWorkCompleteModalOpen] = useState<boolean>(false);
  const [workCompleteInfo, setWorkCompleteInfo] = useState<{
    // tokens: number;
    workReward: number;
    skillReward: number;
    startTime: string;
    endTime: string;
  }>({ workReward: 0, skillReward: 0, startTime: '', endTime: '' });
  
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  
  const tokenGrowthTimer = useRef<Timer | null>(null);
  
  // start work mutation
  const startWorkMutation = useMutation(api.newplayer.startWork);

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const players = worldState?.world.players || [];
  
  // Find player by ethAddress instead of playerId to handle world switching
  const player = players.find((p: any) => p.ethAddress === userData?.ethAddress);
  
  const [isTaxRecordsModalOpen, setIsTaxRecordsModalOpen] = useState<boolean>(false);  
  
  // work history modal state
  const [isWorksListModalOpen, setIsWorksListModalOpen] = useState<boolean>(false);
  
  // format time remaining
  const formatTimeRemaining = useCallback((ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return formatted;
  }, []);

  // get player tokens - use current world if player is in it, otherwise find player's world
  const playerTokens = useQuery(
    player ? api.world.getPlayerTokens : api.world.getPlayerTokensFromAnyWorld,
    userData?.ethAddress ? (player ? {
      worldId: worldId!,
      ethAddress: userData.ethAddress
    } : {
      ethAddress: userData.ethAddress
    }) : 'skip'
  );

  // get player's world when not in current world
  const playerWorldData = useQuery(
    api.world.getPlayerTokensFromAnyWorld,
    userData?.ethAddress && !player ? { ethAddress: userData.ethAddress } : 'skip'
  );

  // get work status
  const workStatus = useQuery(api.newplayer.getWorkStatus, 
    userData?.ethAddress ? { worldId: worldId!, ethAddress: userData.ethAddress, duration: WORK_DURATION } : 'skip'
  );

  // get latest unread work complete record
  const latestUnreadWorkRecord = useQuery(api.newplayer.getLatestUnreadWorkRecord,
    userData?.ethAddress ? { worldId: worldId!, ethAddress: userData.ethAddress } : 'skip'
  );

  // mark work record as read mutation
  const markWorkRecordAsReadMutation = useMutation(api.newplayer.markWorkRecordAsRead);

  // get user's used skills
  const userUsedSkillsData = useQuery(
    api.newplayer.getPlayerUsedSkills,
    playerId ? { playerId } : 'skip'
  );

  // update work status
  useEffect(() => {
    if (workStatus) {
      setIsWorking(workStatus.status === 'working');
      setWorkProgress(workStatus.progress);
      setTimeRemaining(formatTimeRemaining(workStatus.remainingTime));
      
      // update token display - use the real-time token data
      const newTokens = playerTokens?.aibtoken || 0;
      setDisplayTokens(newTokens);
    }
  }, [workStatus, playerTokens, formatTimeRemaining]);

  // update timer
  useEffect(() => {
    if (!isWorking || !workStatus || !workStatus.startTime) return;
    
    const updateTimer = () => {
      if (workStatus.status === 'working' && workStatus.startTime) {
        const now = Date.now();
        const elapsed = now - workStatus.startTime;
        const remaining = Math.max(0, WORK_DURATION - elapsed);
        const progress = Math.min(100, (elapsed / WORK_DURATION) * 100);
        
        setWorkProgress(progress);
        setTimeRemaining(formatTimeRemaining(remaining));
        
        // if work is completed, stop the timer
        if (remaining <= 0) {
          return;
        }
      }
    };
    
    // update once immediately
    updateTimer();
    
    // update every second
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [isWorking, workStatus, formatTimeRemaining]);

  const animateTokenIncrease = useCallback((from: number, to: number, duration: number = 1000) => {
    const startTime = Date.now();
    const difference = to - from;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = from + (difference * easeOutQuart);
      
      setDisplayTokens(Math.round(currentValue * 100) / 100);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
          } else {
        setDisplayTokens(to);
      }
    };
    
    requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (userData) {
      if (player) {
        const newTokens = playerTokens?.aibtoken || 0;
        
        // check if the tokens are increasing or decreasing
        if (newTokens > prevTokens) {
          setIsTokenIncreasing(true);
          setIsTokenDecreasing(false);
          // trigger the token increase animation
          animateTokenIncrease(prevTokens, newTokens, 1000);
        } else if (newTokens < prevTokens) {
          setIsTokenDecreasing(true);
            setIsTokenIncreasing(false);
          // trigger the token decrease animation
          animateTokenIncrease(prevTokens, newTokens, 1000);
      } else {
          setDisplayTokens(newTokens);
        }
        
        setPrevTokens(newTokens);
      } else {
        // set the initial tokens when the player is not found
        const initialTokens = playerTokens?.aibtoken || 0;
        setDisplayTokens(initialTokens);
        setPrevTokens(initialTokens);
      }
      
      setPlayerId(userData.playerId);
      
      // use the role data from the world display to ensure consistency
      if (game && player) {
        const playerDescription = game.playerDescriptions.get(parseGameId('players', player.id));
        if (playerDescription) {
          setName(playerDescription.name || userData.name);
          // convert the character to the avatarPath format
          const avatarPath = `/assets/${playerDescription.character}.png`;
          setAvatarPath(avatarPath);
        } else {
          setName(userData.name);
          setAvatarPath(userData.avatarPath);
        }
      } else {
        // when user is not in current world, use data from their world
        if (playerWorldData) {
          setName(playerWorldData.name || userData.name);
          // use the character from playerWorldData to get correct avatar
          const character = playerWorldData.character || 'f1';
          const avatarPath = `/assets/${character}.png`;
          setAvatarPath(avatarPath);
        } else {
          setName(userData.name);
          setAvatarPath(userData.avatarPath);
        }
      }
      
      const formattedAddress = `${userData.ethAddress.substring(0, 6)}...${userData.ethAddress.substring(userData.ethAddress.length - 4)}`;
      setWalletAddress(formattedAddress);
      setUserSkill(userData.skill);
    }
    
    // delay the closing of the animation state
    setTimeout(() => {
      setIsTokenIncreasing(false);
      setIsTokenDecreasing(false);
    }, 1000);
  }, [userData, player, playerTokens, prevTokens, animateTokenIncrease, game]);

  // update user used skills
  useEffect(() => {
    if (userUsedSkillsData) {
      setUserUsedSkills(userUsedSkillsData);
    }
  }, [userUsedSkillsData]);

  useEffect(() => {
    if (userAddress) {
      setIsWalletConnected(true);
    } else {
      setIsWalletConnected(false);
    }
  }, [userAddress]);

  // listen to unread work complete record, show completion modal
  useEffect(() => {
    if (latestUnreadWorkRecord && !isWorking) {
      // set work complete info
      setWorkCompleteInfo({
        workReward: latestUnreadWorkRecord.workReward || 0,
        skillReward: latestUnreadWorkRecord.skillReward || 0,
        startTime: latestUnreadWorkRecord.startTime,
        endTime: latestUnreadWorkRecord.endTime
      });
      
      // show work complete modal
      setIsWorkCompleteModalOpen(true);
      
      console.log("Unread work completed! Showing completion modal");
    }
  }, [latestUnreadWorkRecord, isWorking]);

  // handle start working button click
  const handleStartWorking = async () => {
    if (isWorking) {
      console.log("[ProfileSidebar] user is already working, cannot start again");
      return;
    }
    
    try {
      console.log("[ProfileSidebar] start working");
      
      const result = await startWorkMutation({
        worldId: worldId!,
        ethAddress: userData.ethAddress
      });
      
      if (result.success) {
        toast.success("Work started!");
        console.log("[ProfileSidebar] work started successfully");
      } else {
        toast.error("Failed to start work");
      }
    } catch (error) {
      console.error("[ProfileSidebar] start work failed:", error);
        toast.error("Failed to start work, please try again");
    }
  };

  // handle withdraw function
  const handleWithdraw = () => {
    // use native alert instead of toast
    alert("Coming Soon!");
    console.log("Withdraw button clicked - Coming Soon!");
  };
  
  // handle NFT Market function
  const handleNFTMarket = () => {
    alert("NFT Market Coming Soon!");
    console.log("NFT Market button clicked - Coming Soon!");
  };

  // handle NFT inventory open function
  const handleOpenNFTInventory = () => {
    setIsNFTInventoryOpen(true);
  };

  // handle NFT inventory close function
  const handleCloseNFTInventory = () => {
    setIsNFTInventoryOpen(false);
  };

  // handle info modal open function
  const handleOpenInfoModal = () => {
    setIsInfoModalOpen(true);
  };

  // handle info modal close function
  const handleCloseInfoModal = () => {
    setIsInfoModalOpen(false);
  };

  // handle edit profile modal open function
  const handleOpenEditProfileModal = () => {
    setIsEditProfileModalOpen(true);
  };

  // handle edit profile modal close function
  const handleCloseEditProfileModal = () => {
    setIsEditProfileModalOpen(false);
  };

  // handle random events modal open function
  const handleOpenRandomEventsModal = () => {
    setIsRandomEventsModalOpen(true);
  };

  // handle random events modal close function
  const handleCloseRandomEventsModal = () => {
    setIsRandomEventsModalOpen(false);
  };

  // handle skill modal open function
  const handleOpenSkillModal = () => {
    setIsSkillModalOpen(true);
  };

  // handle skill modal close function
  const handleCloseSkillModal = () => {
    setIsSkillModalOpen(false);
    // Refresh user used skills data when modal closes
    // The query will automatically refetch when the modal closes
  };

  // handle blind box modal open function
  const handleOpenBlindBox = () => {
    setIsBlindBoxOpen(true);
  };

  // handle blind box modal close function
  const handleCloseBlindBox = () => {
    setIsBlindBoxOpen(false);
  };

  // handle logout function
  const handleLogout = () => {
    // clear localStorage to ensure the role name is not highlighted
    localStorage.removeItem('currentUserName');
    
    // call the disconnect wallet function provided by the parent component
    if (onDisconnectWallet) {
      onDisconnectWallet();
    } else {
      // if no disconnect function is provided, execute default behavior
      setIsWalletConnected(false);
      setName('');
      setWalletAddress('');
      setPlayerId(null);
      
      // show success message
      toast.success("Logged out successfully");
      
      // refresh page
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  // handle close work complete modal function
  const handleCloseWorkCompleteModal = async () => {
    // mark the current record as read
    if (latestUnreadWorkRecord?._id) {
      try {
        await markWorkRecordAsReadMutation({ recordId: latestUnreadWorkRecord._id });
        console.log("Work record marked as read");
      } catch (error) {
        console.error("Failed to mark work record as read:", error);
      }
    }
    
    setIsWorkCompleteModalOpen(false);
  };

  // clean up when component is unmounted
  useEffect(() => {
    // clean up timer when component is unmounted
    return () => {
      if (tokenGrowthTimer.current) {
        clearInterval(tokenGrowthTimer.current);
        tokenGrowthTimer.current = null;
      }
      // reset all work related states
      setIsWorking(false);
      setWorkProgress(0);
      setTimeRemaining('00:00:00');
    };
  }, []);

  // if wallet is not connected, only show connect wallet button
  if (!isWalletConnected) {
    return (
      <div className="flex flex-col p-4 bg-gray-900 text-white h-full justify-center items-center">
        <p className="text-center text-gray-300 text-sm mb-6">
          Welcome to Ai Buddy World, where you can log in with your web3 wallet address and adopt your very own Ai Buddy!
        </p>
        <button
          onClick={onConnectWallet}
          className="w-full py-3 bg-blue-500 hover:bg-blue-600 rounded-md text-sm font-medium mb-3 flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 256 417" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" className="mr-2">
            <path fill="currentColor" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"/>
            <path fill="currentColor" d="M127.962 0L0 212.32l127.962 75.639V154.158z"/>
            <path fill="currentColor" d="M127.961 312.183l-1.575 1.92v98.199l1.575 4.6L256 236.587z"/>
            <path fill="currentColor" d="M127.962 416.902V312.183L0 236.587z"/>
            <path fill="currentColor" d="M127.961 287.958l127.96-75.637-127.96-58.162z"/>
            <path fill="currentColor" d="M0 212.32l127.962 75.638v-133.8z"/>
          </svg>
          Connect Ethereum Wallet
        </button>
        <div className="text-center text-gray-400 text-xs my-2">- Or -</div>
        <button
          onClick={() => {
            // directly trigger Solana wallet connection, not relying on selector
            const solanaConnectBtn = document.getElementById('solana-connect-button')?.querySelector('.wallet-adapter-button');
            if (solanaConnectBtn instanceof HTMLElement) {
              solanaConnectBtn.click();
            } else {
              toast.error("Solana wallet component not loaded correctly, please refresh the page and try again");
              console.error("Solana wallet connection button not found");
            }
          }}
          className="w-full py-3 bg-purple-500 hover:bg-purple-600 rounded-md text-sm font-medium flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2">
            <path fill="currentColor" d="M6.425 3.952H17.55L15.075 7.7H3.95L6.425 3.952ZM8.8 8.7H19.925L17.45 12.45H6.325L8.8 8.7ZM11.2 13.45H22.325L19.85 17.2H8.725L11.2 13.45Z"/>
          </svg>
          Connect Solana Wallet
        </button>
        
        {/* hidden Solana wallet component, for actual connection functionality */}
        <div id="solana-connect-button" className="hidden">
          <SolanaWalletConnect 
            onWalletConnect={(address) => {
              // call the onSolanaWalletConnect function when wallet is connected
              if (onSolanaWalletConnect) {
                onSolanaWalletConnect(address);
              } else {
                console.log("Solana wallet connected, but no callback function provided:", address);
                // if no callback function is provided, refresh page
                window.location.reload(); 
              }
            }}
          />
        </div>
      </div>
    );
  }

  const getProfessionLevel = (profession: string | null) => {
    if (!profession) return null;
    
    if (["Waiter", "Chef", "Staff"].includes(profession)) {
      return "Common";
    } else if (["Firefighter", "Singer", "Doctor"].includes(profession)) {
      return "Rare";
    } else if (profession === "Astronaut") {
      return "Epic";
    } else if (profession === "Tax officer") {
      return "Hidden";
    }
    return null;
  };

  // skill mapping function
  const getSkillInfo = (skillId: string) => {
    return SKILL_MAP[skillId as keyof typeof SKILL_MAP] || DEFAULT_SKILL_INFO;
  };

  // handle open tax records modal function
  const handleOpenTaxRecordsModal = () => {
    setIsTaxRecordsModalOpen(true);
  };

  // handle close tax records modal function
  const handleCloseTaxRecordsModal = () => {
    setIsTaxRecordsModalOpen(false);
  };

  // add open works list modal function
  const handleOpenWorksListModal = () => {
    setIsWorksListModalOpen(true);
  };

  const handleCloseWorksListModal = () => {
    setIsWorksListModalOpen(false);
  };

  // handle avatar click to switch to player's world
  const handleAvatarClick = () => {
    if (!player && playerWorldData?.worldId && onWorldChange) {
      console.log('Switching to player world:', playerWorldData.worldId);
      toast.success('Switching to your world...');
      onWorldChange(playerWorldData.worldId);
    }
  };

  // Show loading only for new registrations, not for world switching
  // Check if player exists in any world to determine if this is a new registration
  const playerExistsInAnyWorld = playerWorldData?.aibtoken !== undefined;
  
  if (userData?.ethAddress && !player && !playerExistsInAnyWorld) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
        <div>Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 bg-gray-900 text-white h-full max-h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900 custom-scrollbar">
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes shake {
            0%, 100% { transform: rotate(0deg) scale(1.1); }
            20% { transform: rotate(-8deg) scale(1.1); }
            40% { transform: rotate(8deg) scale(1.1); }
            60% { transform: rotate(-4deg) scale(1.1); }
            80% { transform: rotate(4deg) scale(1.1); }
          }
          
          @keyframes flowingGradient {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }
        `
      }} />
      {/* NFT inventory modal */}
      <NFTInventory 
        isOpen={isNFTInventoryOpen} 
        onClose={handleCloseNFTInventory} 
      />
      
      {/* edit profile modal */}
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={handleCloseEditProfileModal}
        userData={userData}
        worldId={worldId}
      />
      
      {/* work complete modal */}
      {isWorkCompleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-semibold">Work Completed!</h2>
              <button 
                onClick={handleCloseWorkCompleteModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-6 text-center">
              <div className="text-green-400 text-5xl mb-4">🎉</div>
              <p className="text-xl text-white font-bold mb-2">
                Successfully earned <span className="text-yellow-400">{workCompleteInfo.workReward + workCompleteInfo.skillReward}</span> AI BUDDY Tokens!
              </p>
            </div>
            <div className="bg-gray-800 rounded-md p-4 mb-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-gray-400">Start Time:</div>
                <div className="col-span-2 text-white">{workCompleteInfo.startTime}</div>
                
                <div className="text-gray-400">End Time:</div>
                <div className="col-span-2 text-white">{workCompleteInfo.endTime}</div>
                
                <div className="text-gray-400">Work Reward:</div>
                <div className="col-span-2 text-yellow-400 font-semibold">{workCompleteInfo.workReward} AI BUDDY Tokens</div>

                <div className="text-gray-400">Skill Reward:</div>
                <div className="col-span-2 text-yellow-400 font-semibold">{workCompleteInfo.skillReward} AI BUDDY Tokens</div>
              </div>
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleCloseWorkCompleteModal}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
              >
                Awesome!
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* work history modal */}
      <WorksListModal
        isOpen={isWorksListModalOpen}
        onClose={handleCloseWorksListModal}
        worldId={worldId}
        playerId={playerId}
      />
      
      {/* skill modal */}
      <SkillModal
        isOpen={isSkillModalOpen}
        onClose={handleCloseSkillModal}
        playerId={playerId}
      />
      
      {/* blind box modal */}
      <BlindBox
        isOpen={isBlindBoxOpen}
        onClose={handleCloseBlindBox}
        playerId={playerId}
        ethAddress={userData?.ethAddress}
        worldId={worldId}
      />
      
      {/* info modal */}
      <InfoModal
        isOpen={isInfoModalOpen}
        onClose={handleCloseInfoModal}
      />
      
      {/* random events modal */}
      <RandomEventModal
        isOpen={isRandomEventsModalOpen}
        onClose={handleCloseRandomEventsModal}
        worldId={worldId}
        playerId={playerId}
      />
      
      {/* top toolbar: left info icon, right logout button */}
      <div className="flex justify-between mb-4">
        <div className="flex items-center gap-2">
        {/* left info icon */}
        <button
          onClick={handleOpenInfoModal}
          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        
        {/* edit profile button - only show when user is in current world */}
        {player && (
          <button
            onClick={handleOpenEditProfileModal}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
        </div>
        {/* right logout button */}
        <button
          onClick={handleLogout}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
      
      {/* avatar and name section */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative">
          <div 
            className={`w-20 h-20 rounded-full overflow-hidden mb-3 ${
              !player && playerWorldData?.worldId 
                ? 'cursor-pointer hover:scale-105 transition-transform duration-200 ring-2 ring-yellow-400 hover:ring-yellow-300' 
                : ''
            }`}
            onClick={handleAvatarClick}
            title={!player && playerWorldData?.worldId ? 'return my world' : ''}
          >
            <img
              src={avatarPath}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="flex items-center">
            <span className="text-lg font-medium">{name || 'Guest User'}</span>
          </div>
          
          {/* add UID display and copy button */}
          <div className="flex items-center mt-1 text-sm text-gray-400 bg-gray-800 px-3 py-1 rounded-md">
            <span>UID: {playerId ? playerId.substring(0, 9) : 'N/A'}</span>
            <button 
              onClick={() => {
                if (playerId) {
                  navigator.clipboard.writeText(playerId);
                  toast.success("UID copied to clipboard");
                }
              }}
              className="ml-2 text-blue-400 hover:text-blue-300 transition-colors"
              title="Copy UID"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
        </div>
          
          {/* add profession badges */}
          <div className="mt-2">
            {userUsedSkills && userUsedSkills.length > 0 ? (
              <div className="flex items-center gap-2 justify-center">
                <span className="text-gray-300 text-sm">Profession:</span>
                <div className="flex flex-wrap gap-1">
                  {userUsedSkills
                    .map(skillId => ({ skillId, ...getSkillInfo(skillId) }))
                    .sort((a, b) => b.levelOrder - a.levelOrder)
                    .map((skillInfo, index) => (
                      <div
                        key={index}
                        className="relative group cursor-pointer"
                        title={skillInfo.name}
                      >
                        <div className="w-3.5 h-3.5 flex items-center justify-center transition-all duration-200 hover:scale-110">
                          <img 
                            src={skillInfo.image} 
                            alt={skillInfo.name}
                            className="w-3.5 h-3.5 object-cover rounded"
                          />
                        </div>
                        {/* tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                          {skillInfo.name}
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div 
                className="py-1 px-4 bg-gray-800 rounded-full text-sm flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors"
                onClick={player ? handleOpenSkillModal : undefined}
              >
                <span className="text-gray-300 mr-1">Profession:</span>
                <span className={`flex items-center ${player ? 'text-green-400 hover:text-green-300 transition-colors' : 'text-gray-500 cursor-not-allowed'}`}>
                  Learn
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>
            )}
          </div>
          
          {/* user not in current world hint */}
          {userData && !player && (
            <div className="mt-3 text-center">
              <div className="bg-yellow-900/50 border border-yellow-600/50 rounded-lg p-3">
                <div className="text-yellow-400 text-sm font-medium mb-1">
                  ⚠️ User not in this world
                </div>
                <div className="text-yellow-300 text-xs">
                  You are viewing a different world. Switch to your world to access full features.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NFT and skill buttons - only show when user is in current world */}
      {player && (
        <div className="space-y-2 mb-4">
          {/* First row: NFT and Skills */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleOpenNFTInventory}
              className="flex-1 py-2 px-3 bg-[#212937] hover:bg-[#2c3748] text-white text-sm rounded-md flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              My NFT
            </button>
            <button
              onClick={handleOpenSkillModal}
              className="flex-1 py-2 px-3 bg-[#212937] hover:bg-[#2c3748] text-white text-sm rounded-md flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            Skills
            </button>
          </div>
          
          {/* Second row: Blind Box */}
          <button
            onClick={handleOpenBlindBox}
            className="w-full py-2 px-3 text-white text-sm rounded-md flex items-center justify-center transition-all duration-300 hover:scale-105 relative overflow-hidden group"
            style={{
              background: 'linear-gradient(90deg, #9333ea, #ec4899, #9333ea, #ec4899)',
              backgroundSize: '300% 100%',
              animation: 'flowingGradient 3s ease-in-out infinite',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            <span className="relative z-10">🎁 Blind Box</span>
          </button>
        </div>
      )}

      {/* AIB token section */}
      <div className={`bg-gray-800 rounded-lg p-4 mb-4 transition-all duration-500 ${isTokenIncreasing ? 'ring-2 ring-green-400 ring-opacity-30 shadow-lg' : ''}`}>
        <h3 className="text-sm font-medium mb-2 text-gray-400">AIB TOKENS</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center transition-all duration-300">
            <img 
              src="/assets/aib.png" 
              alt="Token" 
              className={`w-8 h-8 transition-all duration-300 ${isTokenIncreasing ? 'scale-110' : isTokenDecreasing ? 'scale-90' : 'scale-100'}`} 
              style={isTokenIncreasing ? {
                animation: 'shake 1s ease-in-out'
              } : isTokenDecreasing ? {
                animation: 'shake 1s ease-in-out'
              } : {}}
            />
            <span className={`text-2xl font-bold ml-2 transition-all duration-500 ease-in-out ${
              isTokenIncreasing ? 'text-green-400 drop-shadow-lg transform scale-105 animate-pulse' : 
              isTokenDecreasing ? 'text-red-400 drop-shadow-lg transform scale-95 animate-pulse' : 
              'text-white'
            }`}>
              {displayTokens.toFixed(2)}
            </span>
          </div>
          {player && (
            <button
              onClick={handleWithdraw}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 rounded text-sm"
            >
              Withdraw
            </button>
          )}
        </div>
        {/* working status indicator - only show when user is in current world */}
        {player && (
          <div className={`text-xs mt-3 text-center flex items-center justify-center transition-all duration-300 ${isWorking ? 'text-green-400' : 'text-gray-400'}`}>
            <img 
              src={isWorking ? "/assets/working.png" : "/assets/notworking.png"} 
              alt={isWorking ? "Working" : "Not Working"} 
              className="w-4 h-4 mr-1 transition-all duration-300" 
            />
            <span className="transition-all duration-300">
            {isWorking 
              ? "Ai Buddy is working......" 
              : "Not working yet"}
            </span>
          </div>
        )}
      </div>

      {/* wallet address section */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-medium mb-2 text-gray-400">WALLET ADDRESS</h3>
        <div className="text-sm">
          {walletAddress}
        </div>
      </div>

      {/* working status section - only show when user is in current world */}
      {player && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">
            {userSkill === "Tax officer" ? "TAXATION" : "WORK"}
          </h3>
            {userSkill !== "Tax officer" && (
              <button
                onClick={handleOpenWorksListModal}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                More
              </button>
            )}
          </div>
          <div className="space-y-4">
            {isWorking && (userSkill !== "Tax officer") ? (
              /* working status display - non tax officer */
              <div className="bg-gray-900 rounded-lg p-4">
                {/* working status text */}
                <div className="text-center mb-3">
                  <span className="text-lg font-medium text-green-400">
                    Working...
                  </span>
                  <div className="text-xs text-gray-400 mt-1">
                    Complete 8 hours work to earn {
                      userSkill ? 
                      (getProfessionLevel(userSkill) === "Common" ? "100" :
                       getProfessionLevel(userSkill) === "Rare" ? "400" : 
                       getProfessionLevel(userSkill) === "Epic" ? "1600" : "10") : "10"
                    } tokens
                  </div>
                </div>
                
                {/* progress bar and percentage */}
                <div className="mb-2">
                  <div className="flex items-center">
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden flex-grow">
                      <div 
                        className="h-full bg-green-500" 
                        style={{ width: `${workProgress}%` }}
                      ></div>
                    </div>
                    <div className="text-sm font-medium text-yellow-400 ml-2 min-w-[40px] text-right">
                      {Math.round(workProgress)}%
                    </div>
                  </div>
                </div>
                
                {/* remaining time */}
                <div className="text-center text-gray-200 text-xl font-mono mt-2">
                  {timeRemaining}
                </div>
              </div>
            ) : (
              /* not working status or tax officer */
              <div className="bg-gray-900 rounded-lg p-4">
                {userSkill === "Tax officer" ? (
                  /* tax officer exclusive interface */
                  <>
                    <div className="text-center mb-3">
                      <span className="text-lg font-medium text-red-400">
                        Tax Collection
                      </span>
                      <div className="text-xs text-gray-400 mt-1">
                        As a Tax officer, you collect taxes instead of working
                      </div>
                    </div>
                    <button
                      onClick={handleOpenTaxRecordsModal}
                      className="w-full py-2 bg-red-600 hover:bg-red-700 rounded text-white font-medium"
                    >
                      Tax Records
                    </button>
                  </>
                ) : (
                  /* normal profession interface */
                  <>
                <div className="text-center mb-3">
                  <span className="text-lg font-medium text-gray-300">
                    Not Working
                  </span>
                      <div className="text-xs text-gray-400 mt-1">
                        Complete 8 hours work to earn {
                          userSkill ? 
                          (getProfessionLevel(userSkill) === "Common" ? "100" :
                           getProfessionLevel(userSkill) === "Rare" ? "400" : 
                           getProfessionLevel(userSkill) === "Epic" ? "1600" : "10") : "10"
                        } tokens
                      </div>
                </div>
                <button
                  onClick={handleStartWorking}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-white font-medium"
                >
                  Start Working
                </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* random events section - only show when user is in current world */}
      {player && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <h3 className="text-sm font-medium text-gray-400">RANDOM EVENTS</h3>
            <div className="relative group">
              <div className="w-4 h-4 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center cursor-help transition-colors">
                <span className="text-xs text-white font-bold">!</span>
              </div>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-4 py-3 bg-blue-900/90 text-blue-100 text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64 border border-blue-600/50">
                <div className="text-left leading-relaxed">
                  Random events won't trigger when tokens are 0
                </div>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-blue-900/90"></div>
              </div>
            </div>
          </div>
          <button
            onClick={handleOpenRandomEventsModal}
            className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-md h-10 flex items-center justify-center"
          >
            <span className="mr-2">📅</span>
            View My Event Records
          </button>
        </div>
      )}
      
      {/* NFT Market section - only show when user is in current world */}
      {player && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium mb-2 text-gray-400">NFT MARKET</h3>
          <button
            onClick={handleNFTMarket}
            className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-md h-10 flex items-center justify-center"
          >
            <span className="mr-2">🖼️</span>
            Browse NFT Market
          </button>
        </div>
      )}
      
      {/* footer text */}
      <div className="text-center text-gray-500 text-xs mt-2 mb-2">
        Ai Buddy World @2025
      </div>



      {/* tax records modal */}
      {isTaxRecordsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-xl font-medium">Tax Records</h2>
              <button 
                onClick={handleCloseTaxRecordsModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="text-center py-8">
              <div className="text-red-400 text-5xl mb-4">📋</div>
              <p className="text-lg text-white mb-2">Tax Collection Records</p>
              <p className="text-gray-400 mb-6">No tax records found</p>
              <div className="bg-gray-800 rounded-md p-4 text-sm text-left">
                <p className="text-gray-300 mb-2">As a Tax Officer, you will be able to:</p>
                <ul className="list-disc pl-5 text-gray-400 space-y-1">
                  <li>Collect taxes from other players</li>
                  <li>View transaction histories</li>
                  <li>Generate tax reports</li>
                </ul>
              </div>
            </div>
            
            <div className="flex justify-center mt-4">
              <button
                onClick={handleCloseTaxRecordsModal}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 

// update React.memo implementation
export default React.memo(ProfileSidebar, (prevProps, nextProps) => {
  // control log output frequency - only about 0.01% of comparison operations will be recorded
  const shouldLog = Math.random() < 0.0001;
  
  // custom comparison function, only compare key properties
  const prevAddress = prevProps.userAddress;
  const nextAddress = nextProps.userAddress;
  
  // check key fields in userData
  const prevData = prevProps.userData;
  const nextData = nextProps.userData;
  
  // only check the most important fields: playerId, token and working status
  const userDataEqual = 
    (!prevData && !nextData) || 
    (prevData && nextData && 
     prevData.playerId === nextData.playerId && 
     prevData.aibtoken === nextData.aibtoken &&
     prevData.isWorking === nextData.isWorking);
  
  // check if userAddress has changed  
  const addressEqual = prevAddress === nextAddress;
  
  // determine if re-rendering is needed
  const areEqual = userDataEqual && addressEqual;
  
  // significantly reduce log output frequency
  if (shouldLog) {
    console.log(`[ProfileSidebar.memo] Comparing: ${areEqual ? "Equal, skip render" : "Changed, re-render"}`);
  }
  
  // return if re-rendering is needed (return true means equal, skip rendering)
  return areEqual;
}); 