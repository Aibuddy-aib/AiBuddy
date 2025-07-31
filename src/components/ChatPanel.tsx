import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'react-toastify';
import { useSendInput } from '../hooks/sendInput';
import { toastOnError } from '../toasts';
import { GameId } from '../../convex/aiTown/ids';

interface HeadMessage {
  _id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
  worldId: string;
}

// Simple time formatting function to avoid date-fns dependency
function formatTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  } else {
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  }
}

interface ChatPanelProps {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  userData: any;
  userAddress?: string | null;
  isMobile?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = React.memo(({ worldId, engineId, userData, userAddress, isMobile }) => {
  // get saved collapse state from localStorage, default to false if not found
  const getSavedCollapseState = () => {
    try {
      const saved = localStorage.getItem('chatPanelCollapsed');
      return saved === 'true';
    } catch (e) {
      // if error accessing localStorage, return default value
      return false;
    }
  };
  
  // modify initialization state, use saved state from localStorage, default to collapsed (button only)
  const [isCollapsed, setIsCollapsed] = useState(isMobile ? true : (getSavedCollapseState() !== false));
  // record last device type
  const wasMobile = useRef(false);
  // record if component has been initialized
  const isInitialized = useRef(false);
  
  // create a setIsCollapsed function with saved state
  const setCollapsedWithSave = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    // save to localStorage
    try {
      localStorage.setItem('chatPanelCollapsed', String(collapsed));
    } catch (e) {
      console.error('Unable to save chat panel state to localStorage', e);
    }
  };
  
  // detect if mobile device when component mounts, and handle window size changes intelligently
  useEffect(() => {
    // function to detect device type
    const checkDeviceType = () => {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      
      // first load
      if (!isInitialized.current) {
        // only log in development environment
        if (process.env.NODE_ENV !== 'production') {
          console.debug("[ChatPanel] first load - device type:", isMobile ? "mobile" : "desktop");
        }
        
        // if mobile device, always collapse chat panel (show button only)
        if (isMobile) {
          setCollapsedWithSave(true);
        }
        isInitialized.current = true;
        wasMobile.current = isMobile;
        return;
      }
      
      // handle window size change: from desktop to mobile
      if (!wasMobile.current && isMobile) {
        // only log in development environment
        if (process.env.NODE_ENV !== 'production') {
          console.debug("[ChatPanel] device type changed: from desktop to mobile");
        }
        setCollapsedWithSave(true);
      }
      
      // update device type record
      wasMobile.current = isMobile;
    };
    
    // initial detection
    checkDeviceType();
    
    // listen for window size changes
    window.addEventListener('resize', checkDeviceType);
    
    // cleanup function
    return () => {
      window.removeEventListener('resize', checkDeviceType);
    };
  }, []);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // add a ref to record previous message count
  const prevMessagesCountRef = useRef<number>(0);
  const [headMessage, setHeadMessage] = useState('');
  // add sending status marker
  const [isSending, setIsSending] = useState(false);
  
  // Get recent head messages history
  const headMessagesResult = useQuery(api.headMessages.listHeadMessages, { 
    worldId,
    limit: 50 // Get most recent 50 messages
  });
  
  // Safely get message array, if result is null or undefined, use empty array
  const headMessages = headMessagesResult || [];
  
  // Get player information from userData
  const playerId = userData?.playerId as GameId<'players'> | undefined;
  
  // add: get user information from Convex database, based on wallet address
  const playerData = useQuery(
    api.newplayer.getPlayerByEthAddress, 
    userAddress ? { ethAddress: userAddress } : 'skip'
  );
  
  // add debug log to help identify wallet connection issues
  useEffect(() => {
    // use ref to track wallet status changes, avoid duplicate logs
    const walletStatus = {
      hasAddress: !!userAddress,
      hasPlayerData: !!playerData
    };
    
    const currentWalletStatus = JSON.stringify(walletStatus);
    
    // only output log in development environment and when status changes
    if (process.env.NODE_ENV !== 'production' && 
      prevWalletStatusRef.current !== currentWalletStatus) {     
      // update status record
      prevWalletStatusRef.current = currentWalletStatus;
    }
  }, [userAddress, playerData]);
  
  // add a ref to track wallet status changes at the top of the component
  const prevWalletStatusRef = useRef<string | null>(null);
  
  // Get game state to access player name
  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const players = worldState?.world.players || [];
  
  // add debug log to check existing players in the game
  useEffect(() => {
    if (players.length > 0) {
      // modify: control log output frequency, only output in development environment and when player list changes
      // use ref to track the hash value of the last output player ID list
      const currentPlayersHash = players.map(p => p.id).join(',');
      
      // only output log in development environment, first load or when player list changes
      if (process.env.NODE_ENV !== 'production' && 
          (!prevPlayersHashRef.current || 
          prevPlayersHashRef.current !== currentPlayersHash)) {
        
        console.debug("[ChatPanel] player list updated:", players.map(p => ({ 
          id: p.id.substring(0, 8) + '...', // shorten ID display
          name: p.name,
          isHuman: !!p.human
      })));
        
        // update hash value
        prevPlayersHashRef.current = currentPlayersHash;
      }
    }
  }, [players]);
  
  // add a ref to track player list changes at the top of the component
  const prevPlayersHashRef = useRef<string | null>(null);
  
  // Try to find the player using the ID from userData first
  let player = playerId ? players.find(p => p.id === playerId) : undefined;
  
  // If player not found through userData, fallback to traditional method
  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId });
  const humanPlayer = !player ? players.find(p => p.human === humanTokenIdentifier) : player;
  
  // Use sendInput hook to send head message
  const sendHeadMessage = useSendInput(engineId, 'sendHeadMessage');
  
  // add: handle player registration
  const registerAndSendMessage = async (message: string) => {
    try {
      // use wallet address as temporary user identifier
      const displayName = userAddress ? 
        `${userAddress.substring(0, 8)}...${userAddress.substring(userAddress.length - 6)}` : 
        'Unknown User';
      
      // show toast to indicate trying to send as temporary user
      toast.info("Trying to send as temporary user...");
      
      // wait for some existing game players to load
      if (players.length === 0) {
        toast.warning("No available characters in the game");
        return false;
      }
      
      // select an existing NPC character
      const npcPlayer = players.find(p => !p.human);
      if (!npcPlayer) {
        toast.warning("Cannot find available NPC character");
        return false;
      }
      
      // directly use NPC's ID to send message
      try {
        // add user name to message start, ensure message looks like it's from the correct user
        // since system uses NPC's name, we need to include the real user name in the message content
        await sendHeadMessage({
          playerId: npcPlayer.id as GameId<'players'>,
          message: `[${displayName} says]: ${message}`
        });
        
        // only output log in development environment
        if (process.env.NODE_ENV !== 'production') {
          console.debug(`[ChatPanel] sent successfully through NPC character (${npcPlayer.id.substring(0, 8)}...), actual user: ${displayName}`);
        }
        return true;
      } catch (npcError) {
        console.error("[ChatPanel] failed to send through NPC:", npcError);
        return false;
      }
    } catch (error) {
      console.error("[ChatPanel] player registration failed:", error);
      return false;
    }
  };
  
  // Handle sending head message
  const handleSendHeadMessage = async () => {
    if (!headMessage.trim()) {
      toast.warning("Please enter a message");
      return;
    }
    
    // set sending status to true
    setIsSending(true);
    
    // only output log in development environment
    if (process.env.NODE_ENV !== 'production') {
      console.debug("[ChatPanel] sending message:", headMessage);
      console.debug("[ChatPanel] debug info:", {
        playerId: playerId ? playerId.substring(0, 8) + '...' : null,
        hasUserData: !!userData,
        hasHumanPlayer: !!humanPlayer,
        hasPlayerData: !!playerData, 
        userAddressShort: userAddress ? userAddress.substring(0, 6) + '...' : null,
      playersCount: players.length
    });
    }
    
    try {
      // modify logic: only show wallet connection prompt when userAddress is completely missing
      if (!userAddress) {
        console.error("No wallet connected");
        toast.error("Please connect your wallet to send messages");
        setIsSending(false);
        return;
      }
      
      // get user name - used to clearly label in message content
      const displayName = userAddress ? 
        playerData?.name : 
        'Unknown User';
      
      // modify message to send, use Chinese format
      const formattedMessage = `[${displayName} says]: ${headMessage.trim()}`;
      
      // get new playerID strategy:
      // 1. use existing playerId first
      // 2. if not, get from humanPlayer
      // 3. try to select an NPC from existing player list as proxy speaker
      let playerIdToUse = playerId;
      let playerNameToLog = "Unknown";
      
      // if no playerId but has humanPlayer, use humanPlayer.id
      if (!playerIdToUse && humanPlayer) {
        playerIdToUse = humanPlayer.id as GameId<'players'>;
        playerNameToLog = humanPlayer.name || "Human Player";
        console.log(`Using humanPlayer ID: ${playerIdToUse} (${playerNameToLog})`);
      }
      
      // if still no playerID, try to find an available NPC from player list
      if (!playerIdToUse && players.length > 0) {
        // prioritize non-human players
        const npcPlayer = players.find(p => !p.human);
        if (npcPlayer) {
          playerIdToUse = npcPlayer.id as GameId<'players'>;
          playerNameToLog = npcPlayer.name || "NPC Player";
          // only output log in development environment
          if (process.env.NODE_ENV !== 'production') {
            console.debug(`[ChatPanel] using existing NPC ID: ${playerIdToUse.substring(0, 8)}... (${playerNameToLog})`);
          }
        } else {
          // if no NPC, use any available player
          playerIdToUse = players[0].id as GameId<'players'>;
          playerNameToLog = players[0].name || "Random Player";
          // only output log in development environment
          if (process.env.NODE_ENV !== 'production') {
            console.debug(`[ChatPanel] using random player ID: ${playerIdToUse.substring(0, 8)}... (${playerNameToLog})`);
          }
      }
      }
      
      // if all methods fail to get valid ID, show error
      if (!playerIdToUse) {
        console.error("[ChatPanel] cannot find valid player ID");
        toast.error("Cannot send message: No available characters in the system");
        setIsSending(false);
        return;
      }
      
      // for debugging, output final used player ID (only in development environment)
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[ChatPanel] final used player ID: ${playerIdToUse.substring(0, 8)}... (${playerNameToLog})`);
      }
      
      // immediately clear input box
      setHeadMessage('');
      
      // use determined playerIdToUse to send message
      try {
      await toastOnError(
        sendHeadMessage({
          playerId: playerIdToUse,
          message: formattedMessage
        })
      );
      
      toast.success("Message sent!");
      } catch (sendError: any) {
        console.error("[ChatPanel] message sending failed:", sendError);
        // provide more specific error information
        if (sendError.message && sendError.message.includes("Invalid player ID")) {
          toast.error(`Invalid player ID (${playerIdToUse.substring(0, 8)}...), trying alternative method...`);
          
          // try to register a temporary player and send message
          try {
            const success = await registerAndSendMessage(headMessage.trim());
            if (success) {
              toast.success("Sent using temporary character!");
            } else {
              toast.error("Failed even with temporary character, please refresh");
            }
          } catch (retryError) {
            console.error("[ChatPanel] failed to send using temporary character:", retryError);
            toast.error("All sending attempts failed, please refresh and try again");
          }
        } else if (sendError.message && sendError.message.includes("Invalid game ID")) {
          toast.error("Cannot send: Invalid game ID format, please refresh");
        } else {
          toast.error(`Sending failed: ${sendError.message || 'Server error'}`);
        }
      } finally {
        // reset sending status regardless of success or failure
        setIsSending(false);
      }
      
    } catch (error: any) {
      console.error("Message preparation failed:", error);
      toast.error(`Message sending failed: ${error?.message || 'Unknown error'}`);
      // restore sending status
      setIsSending(false);
    }
  };
  
  // modify: scroll to bottom when new message arrives, avoid initial loading auto scroll
  useEffect(() => {
    // only scroll when chat panel is not collapsed, has messages, and message count increases
    if (!isCollapsed && headMessages.length > 0 && headMessages.length > prevMessagesCountRef.current) {
      // only scroll when new message arrives (not initial loading)
      if (prevMessagesCountRef.current > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    // update previous message count
    prevMessagesCountRef.current = headMessages.length;
  }, [headMessages, isCollapsed]);
  
  // optimize MessageItem to React.memo component, reduce rendering frequency
  const MessageItem = React.memo(({ msg }: { msg: HeadMessage }) => {
    // modify regex to support both Chinese and English formats
    const messagePattern = /\[(.*?) (?:says)\]:(.*)/;
    const match = msg.message.match(messagePattern);
    
    let actualSender = msg.playerName;
    let actualMessage = msg.message;
    
    // if message format matches "[xxx says]: yyy", extract actual sender and message content
    if (match && match.length >= 3) {
      actualSender = match[1].trim(); // extract sender name
      actualMessage = match[2].trim(); // extract actual message content
    }
    
    // check if current logged-in user is the message sender
    const isCurrentUser = userAddress && 
                          (actualSender.includes(userAddress.substring(0, 8)) || 
                           actualSender.includes(userAddress.substring(userAddress.length - 6)));
    
    return (
      <div className="mb-2">
        <div className={`rounded-lg p-2 ${isCurrentUser ? 'bg-blue-800' : 'bg-slate-700'}`}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-yellow-400 font-medium text-sm">
              {actualSender}
              {isCurrentUser && <span className="ml-1 text-xs text-gray-300">(Own)</span>}
            </span>
            <span className="text-gray-400 text-xs">
              {formatTime(msg.timestamp)}
            </span>
          </div>
          <p className="text-white text-sm">{actualMessage}</p>
        </div>
      </div>
    );
  });

  return (
    <>
      {/* Chat Button - Fixed in top-right corner */}
      <div className="fixed top-0 right-0 z-20">
        <button 
          className="bg-slate-800 text-white p-2 self-start h-10 flex items-center justify-center w-32"
          onClick={() => setCollapsedWithSave(false)}
        >
          <span className="mr-2">◀</span>
          <span className="font-medium">Chat</span>
        </button>
      </div>

      {/* Chat Drawer - Slides in from right */}
      <div className={`fixed right-0 top-0 h-screen z-30 flex flex-col transition-all duration-300 ease-in-out ${
        isCollapsed ? 'translate-x-full' : 'translate-x-0'
      } ${isMobile ? 'w-full' : 'w-96'}`}>
        <div className="flex flex-col h-full bg-slate-800 shadow-lg overflow-hidden">
          {/* Header with title and close button */}
          <div className="bg-slate-700 py-3 px-4 text-white font-medium border-b border-slate-600 flex justify-between items-center">
            <span>Chat ({headMessages.length})</span>
            <button 
              className="text-white hover:text-gray-300 flex items-center justify-center transition-colors"
              onClick={() => setCollapsedWithSave(true)}
            >
              ✕
            </button>
          </div>
          
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-2 scrollbar" style={isMobile ? {paddingBottom: '120px'} : {}}>
            {headMessages.length === 0 ? (
              <div className="text-gray-400 text-center py-4 text-sm">
                No messages yet
              </div>
            ) : (
              headMessages.map((msg) => (
                <MessageItem key={msg._id} msg={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Send Message area */}
          <div className={`${isMobile ? 'fixed bottom-24 left-0 right-0 z-10 shadow-lg' : ''} bg-slate-900 border-t border-gray-700 p-3`}>
            {/* Player name - only show on desktop */}
            {!isMobile && (
              <div className="text-sm font-medium mb-2 text-yellow-400">
                {userAddress ? (playerData?.name) : 'Please connect wallet'}
              </div>
            )}
            <div className="flex">
              <input
                type="text"
                value={headMessage}
                onChange={(e) => setHeadMessage(e.target.value)}
                placeholder="Type message here..."
                className="flex-1 rounded-l border border-gray-300 px-3 py-2 text-sm text-black"
                maxLength={50}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isSending) {
                    handleSendHeadMessage();
                  }
                }}
                disabled={isSending}
              />
              <button
                onClick={handleSendHeadMessage}
                className={`${
                  isSending 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white rounded-r px-3 py-2 text-sm`}
                disabled={isSending}
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop overlay - only show when chat is open */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={() => setCollapsedWithSave(true)}
        />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // compare function, only re-render when key properties change
  return (
    prevProps.worldId === nextProps.worldId &&
    prevProps.engineId === nextProps.engineId &&
    prevProps.userAddress === nextProps.userAddress &&
    prevProps.isMobile === nextProps.isMobile
    // note: do not compare userData, it may change frequently but does not affect UI
  );
});

export default ChatPanel; 