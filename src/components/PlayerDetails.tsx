import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { SelectElement } from './Player';
import { Messages } from './Messages';
import DirectChat from './DirectChat';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { DIRECT_CHAT_COOLDOWN, WORK_DURATION } from '../../convex/constants';
import RandomEventModal from './RandomEventModal';
import WorksListModal from './WorksListModal';

type PlayerDetailsProps = {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerId?: GameId<'players'>;
  setSelectedElement: SelectElement;
  scrollViewRef: React.RefObject<HTMLDivElement>;
  userData?: any | null;
  userAddress?: string | null;
};

export default function PlayerDetails({
  worldId,
  engineId,
  game,
  playerId,
  setSelectedElement,
  scrollViewRef,
  userData,
  userAddress,
}: PlayerDetailsProps) {
  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId, ethAddress: userAddress ?? '' });
  const [isDirectChatOpen, setIsDirectChatOpen] = useState(false);
  const [directChatCooldown, setDirectChatCooldown] = useState<number>(0);
  const workEndTimeRef = useRef<number | null>(null);
  
  // Cooldown timer effect
  useEffect(() => {
    if (directChatCooldown > 0) {
      const timer = setTimeout(() => {
        setDirectChatCooldown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [directChatCooldown]);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showWorkHistoryModal, setShowWorkHistoryModal] = useState(false);

  const players = [...game.world.players.values()];
  const agents = [...game.world.agents.values()];
  const humanPlayer = players.find((p) => p.ethAddress === humanTokenIdentifier);
  const humanConversation = humanPlayer ? game.world.playerConversation(humanPlayer) : undefined;
  
  // save the last selected character ID to avoid overwriting
  const userSelectedPlayerId = useRef<GameId<'players'> | undefined>(playerId);
  
  // update the user's selected character ID
  useEffect(() => {
    if (playerId) {
      userSelectedPlayerId.current = playerId;
    }
  }, [playerId]);
  
  // key improvement: only consider characters in the conversation when no playerId is passed
  // this ensures that manually selected characters are not overwritten by conversation
  let effectivePlayerId = playerId;

  // only use conversation characters when no playerId is set
  if (!effectivePlayerId && !userSelectedPlayerId.current && humanPlayer && humanConversation) {
    const otherPlayerIds = [...humanConversation.participants.keys()].filter(
      (p) => p !== humanPlayer.id,
    );
    effectivePlayerId = otherPlayerIds[0];
  } else if (!effectivePlayerId && userSelectedPlayerId.current) {
    // if there is no current playerId but there is a saved selection, use the saved one
    effectivePlayerId = userSelectedPlayerId.current;
  }

  const player = effectivePlayerId && game.world.players.get(effectivePlayerId);
  const playerConversation = player && game.world.playerConversation(player);

  const previousConversation = useQuery(
    api.world.previousConversation,
    effectivePlayerId ? { worldId, playerId: effectivePlayerId } : 'skip',
  );

  const playerDescription = effectivePlayerId && game.playerDescriptions.get(effectivePlayerId);
  const agent = agents.find((a) => a.playerId === effectivePlayerId);

  // add new API call method
  const sendInput = useMutation(api.world.sendWorldInput);

  // Handle ESC key to close the chat modal
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDirectChatOpen) {
        setIsDirectChatOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [isDirectChatOpen]);

  // calculate remaining work time
  useEffect(() => {   
    // record the reference to the last update time
    const lastUpdateRef = { current: Date.now() };
    
    // when the player is in work status, set the end time
    if (player && player.isWorking) {
      const workDuration = WORK_DURATION;
      // const workDuration = 20 * 1000; // 20 seconds (for testing)
      
      // check if the end time is already set
      if (workEndTimeRef.current === null) {
        // check if there is a saved work start time
        const savedStartTime = player.workStartTime || playerDescription?.workStartTime;
        
        if (savedStartTime) {
          // calculate the end time from the saved start time
          console.log("using saved work start time:", new Date(savedStartTime).toLocaleString());
          workEndTimeRef.current = savedStartTime + workDuration;
          
          // immediately calculate the remaining time
          const now = Date.now();
          const remaining = Math.max(0, workEndTimeRef.current - now);
          
          if (remaining > 0) {
            // format the remaining time
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            
            console.log(`immediately update countdown: ${hours}h ${minutes}m ${seconds}s`);
            // setWorkTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
          }
        } else {
          // if there is no saved start time, use the current time and trigger a database update
          console.log("no saved work start time, using current time");
          const currentTime = Date.now();
          workEndTimeRef.current = currentTime + workDuration;
        }
      }
      
      // set timer to update remaining time every second
      const timer = setInterval(() => {
        if (workEndTimeRef.current === null) {
          console.log("end time not set, but timer is still running");
          return;
        }
        
        const now = Date.now();
        const remaining = Math.max(0, workEndTimeRef.current - now);
        
        if (remaining <= 0) {
          console.log("work time ended, processing work completion");

          // clear timer
          clearInterval(timer);
          workEndTimeRef.current = null; // reset end time
          
          // check if there is a logged in user, if not, skip the notification and update
          const hasLoggedInUser = (isUrlLoggedInUser && player) || humanPlayer;
          if (!hasLoggedInUser) {
            console.log("No logged in user, skipping work completion process");
            return;
          }
          
          // show notification
          toast.info("Work time ended, updating status...");
          
          // create function to handle work completion, using the same direct API call method
          const handleWorkCompletion = async () => {
            try {
              // get the correct player ID
              let currentPlayerId: string | null = null;
              if (isUrlLoggedInUser && player) {
                currentPlayerId = player.id;
              } else if (humanPlayer) {
                currentPlayerId = humanPlayer.id;
              }
              
              if (!currentPlayerId) {
                console.log("Unable to determine player ID");
                return;
              }
              
              console.log("Attempting to automatically stop working, player ID:", currentPlayerId);
              
              // try to use game engine API to stop working
              try {
                const result = await sendInput({
                  engineId,
                  name: "stopWorking",
                  args: {
                    playerId: currentPlayerId
                  }
                });
                console.log("Automatic stop working API call result:", result);
              } catch (error) {
                console.warn("Game engine API call failed, trying direct database update:", error);
              }              
              // show success message
              toast.success("Work completed! You've earned AIB tokens.");
              
              // reset state instead of refreshing the page
              // setPlayerIsWorking(false);
              workEndTimeRef.current = null;
            } catch (error: any) {
              console.error("Failed to stop working automatically:", error);
              toast.error(`Failed to stop working: ${error.message || 'Unknown error'}`);
              
              // reset state instead of refreshing the page
              // setPlayerIsWorking(false);
              workEndTimeRef.current = null;
            }
          };
          
          // execute the function
          handleWorkCompletion();
        } else {
          lastUpdateRef.current = Date.now();
        }
      }, 1000);
      
      // add logic to automatically
      const checkTimerWorking = setInterval(() => {
        const now = Date.now();
        // if the countdown has not been updated for 5 seconds, try to reinitialize
        if (now - lastUpdateRef.current > 5000 && workEndTimeRef.current !== null) {
          console.log("detected countdown not updating for a long time, trying to reinitialize...");
          
          // check if the work start time exists
          if (player.workStartTime) {
            workEndTimeRef.current = player.workStartTime + WORK_DURATION;
            
            // immediately calculate the remaining time
            const remaining = Math.max(0, workEndTimeRef.current - now);
            
            if (remaining > 0) {
              lastUpdateRef.current = now;
            }
          }
        }
      }, 5000); // check every 5 seconds
      
      // clear timer
      if (clearTimerRef.current) {
        clearInterval(clearTimerRef.current);
      }
      clearTimerRef.current = timer;
      
      return () => {
        if (timer) {
          clearInterval(timer);
        }
        clearInterval(checkTimerWorking);
      };
    } else {
      // when not working, reset the end time
      // console.log("player is not working, resetting countdown");
      workEndTimeRef.current = null;
      // setWorkTimeLeft(null);
      
      // clear existing timer
      if (clearTimerRef.current) {
        clearInterval(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    }
  }, [player?.isWorking, player?.activity?.description, player?.workStartTime, playerDescription?.workStartTime]);

  if (!effectivePlayerId) {
    return (
      <div className="h-full text-base flex text-center items-center p-4 text-white font-system">
        Click on the character to view details.
      </div>
    );
  }
  if (!player) {
    return null;
  }
  // use two ways to define isMe:
  // 1. standard way: through humanPlayer and player.id
  // 2. URL parameter way: through userAddress and player.ethAddress
  const isUrlLoggedInUser = userAddress && player.ethAddress === userAddress;
  const isMe = (humanPlayer && player.id === humanPlayer.id) || isUrlLoggedInUser;
  const sameConversation =
    !isMe &&
    humanPlayer &&
    humanConversation &&
    playerConversation &&
    humanConversation.id === playerConversation.id;

  const humanStatus =
    humanPlayer && humanConversation && humanConversation.participants.get(humanPlayer.id)?.status;
  const playerStatus = playerConversation && playerConversation.participants.get(effectivePlayerId)?.status;

  const inConversationWithMe =
    sameConversation &&
    playerStatus?.kind === 'participating' &&
    humanStatus?.kind === 'participating';

  return (
    <div className="flex flex-col space-y-4 p-3 bg-slate-900 text-white font-system h-full relative">
        <div className="flex justify-between items-center mb-2 pb-3 border-b border-gray-700">
          <div>
            <h2 className={`text-xl font-bold font-body ${userAddress && userData && player.ethAddress === userAddress ? 'bg-amber-500 text-black px-2 py-1 rounded' : ''}`} style={{ imageRendering: 'pixelated' }}>
              {playerDescription?.name}
              {userAddress && userData && player.ethAddress === userAddress && ' (Own)'}
            </h2>
            {/* hide ethereum address display */}
            <div className="hidden">
            {player.ethAddress && (
              <p className="text-sm text-gray-300 font-body mt-2 tracking-wide">
                {`${player.ethAddress.substring(0, 6)}......${player.ethAddress.substring(player.ethAddress.length - 6)}`}
              </p>
            )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              console.log("close button clicked, clearing selection...");
              // navigate back to main page
              setSelectedElement(undefined);
              console.log("selection cleared");
              
              // if needed, add extra cleanup operations here
              // like resetting current state etc
            }}
            className="hidden w-10 h-10 flex items-center justify-center bg-red-600 hover:bg-red-700 transition-colors rounded-md text-white font-bold text-xl shadow-md"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 pb-20">
          {/* AIB TOKENS section - only show for other players */}
          {!isMe && (
            <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
              <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
                AIB TOKENS
              </h3>
              <div className="p-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-300 font-system">Balance:</p>
                  <p className="text-sm text-yellow-400 font-bold font-system">
                    {(player.aibtoken !== undefined 
                      ? player.aibtoken 
                      : playerDescription?.aibtoken || 0).toFixed(4)} AIB
                  </p>
                </div>
                <div className="mt-2 flex justify-between items-center">
                  <p className="text-sm text-gray-300 font-system">Status:</p>
                  {(player.isWorking || playerDescription?.isWorking) ? (
                    <p className="text-sm text-red-400 font-system">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1"></span>
                      Working
                    </p>
                  ) : (
                    <p className="text-sm text-green-400 font-system">
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                      Idle
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Action buttons for other players */}
          {!isMe && (
            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => setShowEventsModal(true)}
                className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-500 transition-colors duration-200 text-white text-center font-system"
              >
                View Events
              </button>
              <button
                onClick={() => setShowWorkHistoryModal(true)}
                className="flex-1 py-2 rounded bg-green-600 hover:bg-green-500 transition-colors duration-200 text-white text-center font-system"
              >
                Work History
              </button>
            </div>
          )}
          
          <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
            <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
              CHARACTER INFO
            </h3>
            <div className="p-3">
              <p className="text-sm text-gray-300 font-system">
                {playerDescription?.description}
                {isMe && (
                  <>
                    <br />
                    <br />
                    <i>This is your character!</i>
                  </>
                )}
                {!isMe && inConversationWithMe && (
                  <>
                    <br />
                    <br />(<i>You're talking to me!</i>)
                  </>
                )}
              </p>
            </div>
          </div>
          
          <button
            className={`w-full py-2 rounded transition-colors duration-200 text-center font-system mb-4 ${
              !userAddress || !userData
                ? 'bg-gray-500 cursor-not-allowed text-gray-300'
                : directChatCooldown > 0
                ? 'bg-gray-500 cursor-not-allowed text-gray-300'
                : 'bg-amber-500 hover:bg-amber-400 text-black'
            }`}
            onClick={() => {
              if (!userAddress || !userData) {
                toast.error("Please connect your wallet and login to start a conversation");
                return;
              }
              if (directChatCooldown === 0) {
                setIsDirectChatOpen(true);
              }
            }}
            disabled={!userAddress || !userData || directChatCooldown > 0}
          >
            {!userAddress || !userData 
              ? "Connect wallet to chat"
              : `Start a conversation${directChatCooldown > 0 ? ` (${directChatCooldown}s)` : ''}`
            }
          </button>
          
          {!isMe && playerConversation && playerStatus?.kind === 'participating' && (
            <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
              <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
                CURRENT CONVERSATION
              </h3>
              <div className="p-3">
                <Messages
                  worldId={worldId}
                  engineId={engineId}
                  inConversationWithMe={inConversationWithMe ?? false}
                  conversation={{ kind: 'active', doc: playerConversation }}
                  humanPlayer={humanPlayer}
                  scrollViewRef={scrollViewRef}
                />
              </div>
            </div>
          )}
          
          {!playerConversation && previousConversation && (
            <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
              <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
                PREVIOUS CONVERSATION
              </h3>
              <div className="p-3">
                <Messages
                  worldId={worldId}
                  engineId={engineId}
                  inConversationWithMe={false}
                  conversation={{ kind: 'archived', doc: previousConversation }}
                  humanPlayer={humanPlayer}
                  scrollViewRef={scrollViewRef}
                />
              </div>
            </div>
          )}        
      </div>
      
      <DirectChat
        worldId={worldId}
        engineId={engineId}
        game={game}
        playerDescription={playerDescription}
        agentId={agent?.id}
        playerId={userData?.playerId}
        isOpen={isDirectChatOpen}
        onClose={() => {
          setIsDirectChatOpen(false);
        }}
        onLeaveWithCooldown={() => {
          // Start cooldown only when actually leaving a conversation
          setDirectChatCooldown(DIRECT_CHAT_COOLDOWN); // Convert milliseconds to seconds
        }}
      />
      
      {/* Events Modal */}
      {showEventsModal && (
        <RandomEventModal
          isOpen={showEventsModal}
          onClose={() => setShowEventsModal(false)}
          worldId={worldId}
          playerId={playerId}
        />
      )}
      
      {/* Work History Modal */}
      {showWorkHistoryModal && (
        <WorksListModal
          isOpen={showWorkHistoryModal}
          onClose={() => setShowWorkHistoryModal(false)}
          worldId={worldId}
          playerId={playerId}
        />
      )}
    </div>
  );
}
