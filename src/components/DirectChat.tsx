import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';
import { randomUUID } from '../utils/crypto';

interface DirectChatProps {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerDescription: any;
  // conversation: 
  // | { kind: 'active'; doc: Conversation }
  // | { kind: 'archived'; doc: Doc<'archivedConversations'> };
  agentId: GameId<'agents'> | undefined;
  playerId: GameId<'players'> | undefined;
  isOpen: boolean;
  onClose: () => void;
  onLeaveWithCooldown?: () => void;
}

const DirectChat: React.FC<DirectChatProps> = ({
  worldId,
  engineId,
  game,
  playerDescription,
  agentId,
  playerId,
  isOpen,
  onClose,
  onLeaveWithCooldown
}) => {
  const conversations = Array.from(game.world.conversations.values());
  const playerConversation = conversations.find((c) => c.participants.has(playerId!));

  // Get the playerId corresponding to the agent
  const agentPlayerId = agentId ? game.world.agents.get(agentId)?.playerId : undefined;

  // Get the messages with the agent
  const messagesWithAgent = useQuery(api.world.getMessagesWithAgent,
    playerId && agentPlayerId ? { 
      worldId, 
      playerId, 
      agentPlayerId 
    } : 'skip'
  ) || [];

  // Use useState to track conversationId, ensuring consistency
  // Chat state management
  type ChatState = 'idle' | 'active' | 'leaving' | 'left';
  const [chatState, setChatState] = useState<ChatState>('idle');
  
  // Helper function to check if leaving
  const isLeaving = (state: ChatState): state is 'leaving' => state === 'leaving';
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [previousMessageCount, setPreviousMessageCount] = useState<number>(0);

  // Reset states when chat is opened
  useEffect(() => {
    if (isOpen) {
      setChatState('idle');
      setCurrentConversationId('');
    }
  }, [isOpen]);

  // When a conversation is found, set the conversationId
  useEffect(() => {
    // Don't set conversation ID if we're in the process of leaving or have already left
    if (chatState === 'leaving' || chatState === 'left') {
      console.log('DirectChat: Skipping conversation ID update during leave process or after leaving');
      return;
    }
    
    if (playerConversation?.id && !currentConversationId) {
      console.log('conversation id is change to:', playerConversation.id);
      setCurrentConversationId(playerConversation.id);
      setChatState('active');
    }
  }, [playerConversation?.id, currentConversationId, chatState]);

  // Use the history messages if available, otherwise use the current conversation messages
  const currentMessages = useQuery(api.messages.listMessages, 
    currentConversationId ? {
      worldId,
      conversationId: currentConversationId,
      limit: 50, // limit to get the last 50 messages
    } : 'skip'
  ) || [];
  
  // Handle the case where messages is undefined
  // const messages = currentMessages || [];
  const messages = [...new Map([...currentMessages, ...messagesWithAgent].map(msg => [msg._id, msg])).values()]
    .sort((a, b) => a._creationTime - b._creationTime);

  // Auto scroll to the bottom only when new messages are added
  useEffect(() => {
    if (chatContainerRef.current && messages && messages.length > 0) {
      const currentMessageCount = messages.length;
      // Scroll on first load or when new messages are added
      if (previousMessageCount === 0 || currentMessageCount > previousMessageCount) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        setPreviousMessageCount(currentMessageCount);
      }
    }
  }, [messages?.length, previousMessageCount]);

  // Scroll to bottom when chat is opened
  useEffect(() => {
    if (isOpen && chatContainerRef.current && messages.length > 0) {
      // Small delay to ensure the chat container is fully rendered
      const scrollTimeout = setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
      
      return () => clearTimeout(scrollTimeout);
    }
  }, [isOpen, messages.length]);
  
  // Check if agent is typing
  const agentIsTyping = useCallback(() => {
    if (!playerConversation?.isTyping || playerConversation.isTyping.playerId === playerId) {
      return false;
    }
    
    // Check if the typing message hasn't been sent yet
    return !messages.find((m: any) => m.messageUuid === playerConversation.isTyping?.messageUuid);
  }, [playerConversation, playerId, messages]);

  const sendInput = useMutation(api.world.sendWorldInput);

  const [directChatInput, setDirectChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Shared function to send message
  const handleSendMessage = useCallback(async () => {
    if (!directChatInput.trim() || isLoading || !agentId || !playerId) {
      return;
    }

    try {
      setIsLoading(true);
      
      // Generate a message UUID
      const messageUuid = randomUUID();
      
      // Use the current conversationId or create a new one
      let conversationId = currentConversationId || playerConversation?.id;
      
      if (!conversationId) {
        await sendInput({
          engineId,
          name: 'sendMessageToAgent',
          args: {
            worldId,
            agentId,
            playerId,
            conversationId: '',
            text: directChatInput.trim(),
            messageUuid,
            isDirectChat: true,
          }
        });
        
        // Wait for the conversation to be created, then re-query
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Re-query the conversation - look for conversation with both player and agent
        const updatedConversations = Array.from(game.world.conversations.values());
        const agentPlayerId = game.world.agents.get(agentId)?.playerId;
        const newConversation = updatedConversations.find((c) => {
          const hasPlayer = c.participants.has(playerId);
          const hasAgent = agentPlayerId && c.participants.has(agentPlayerId);
          return hasPlayer && hasAgent;
        });
        
        if (newConversation) {
          setCurrentConversationId(newConversation.id);
          conversationId = newConversation.id;
        }
      } else {
        await sendInput({
          engineId,
          name: 'sendMessageToAgent',
          args: {
            worldId,
            agentId,
            playerId,
            conversationId,
            text: directChatInput.trim(),
            messageUuid,
            isDirectChat: true,
          }
        });
      }
      
      // Clear the input
      setDirectChatInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  }, [directChatInput, isLoading, agentId, playerId, currentConversationId, playerConversation?.id, 
      sendInput, engineId, worldId, game.world]);

  const onKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();

    // Only send message when Enter is pressed
    if (e.key === 'Enter') {
      await handleSendMessage();
    }
  }, [handleSendMessage]);

  const closeDirectChat = useCallback(async () => {
    if (isLoading || chatState === 'leaving') return;
    
    try {
      setChatState('leaving');
      const conversationId = currentConversationId || playerConversation?.id;
      
      if (conversationId && agentId && playerId) {
        await sendInput({
          engineId,
          name: 'leaveDirectChat',
          args: {
            worldId,
            agentId,
            playerId,
            conversationId,
          }
        });
        
        // Wait a bit for the backend to process the leave operation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Only trigger cooldown if there was an actual conversation
        onLeaveWithCooldown?.();
      }
    } catch (error) {
      console.error('Failed to leave conversation:', error);
    } finally {
      setChatState('left');
      setCurrentConversationId('');
      onClose();
    }
  }, [isLoading, chatState, currentConversationId, playerConversation?.id, agentId, playerId, 
      sendInput, engineId, worldId, onLeaveWithCooldown, onClose]);

  if (!isOpen) return null;

  // Show leaving overlay if chatState is 'leaving'
  if (chatState === 'leaving') {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
        <div className="bg-slate-900 rounded-lg w-[500px] max-w-[90%] h-[600px] max-h-[90%] shadow-2xl overflow-hidden flex flex-col">
          <h3 className="bg-slate-700 py-3 px-4 text-sm font-medium text-center uppercase font-system">
            <span className="text-white">LEAVING CONVERSATION</span>
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-white text-lg font-medium mb-2">Leaving conversation...</p>
            <p className="text-gray-400 text-sm text-center">
              Please wait while we clean up the conversation
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50"
      onClick={closeDirectChat}
    >
      <div 
        className="bg-slate-900 rounded-lg w-[500px] max-w-[90%] h-[600px] max-h-[90%] shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-slate-700 py-3 px-4 text-sm font-medium text-center uppercase font-system flex justify-between items-center">
          <span className="text-white">DIRECT CONVERSATION</span>
          <button 
            onClick={closeDirectChat}
            disabled={chatState === 'leaving'}
            className={`text-gray-400 hover:text-white ${chatState === 'leaving' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            ✕
          </button>
        </div>
        <div className="p-4 flex flex-col h-full gap-3">
          <div className="flex items-center mb-4 flex-shrink-0">
            <div className="bg-slate-800 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden">
              {playerDescription?.character && (
                <img 
                  src={`/assets/${playerDescription.character}.png`}
                  alt={playerDescription.name || 'Character'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // if image fails to load, display character as fallback
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML = playerDescription?.character || '?';
                  }}
                />
              )}
            </div>
            <div className="ml-3 flex items-center">
              <p className="text-md font-semibold text-white">
                {playerDescription?.name}
              </p>
              {agentIsTyping && (
                <span className="ml-2 text-sm text-gray-400 font-system">
                  typing...
                </span>
              )}
            </div>
          </div>
          
          <div ref={chatContainerRef} className="flex-1 mb-3 border border-slate-700 rounded-lg p-3 bg-slate-800 overflow-y-auto min-h-0 max-h-[360px]">
            {!messages || messages.length === 0 ? (
              <p className="text-sm text-white italic text-center font-system py-4">
                Start chatting with {playerDescription?.name}
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isCurrentUser = msg.author === playerId;
                  return (
                    <div 
                      key={msg._id} 
                      className={`p-3 rounded max-w-[85%] ${
                        isCurrentUser 
                          ? 'bg-blue-600 ml-auto' 
                          : 'bg-slate-700'
                      }`}
                    >
                      <p className="text-sm text-white font-system">{msg.text}</p>
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="p-3 rounded bg-blue-600 ml-auto max-w-[85%]">
                    <p className="text-sm text-white font-system">Sending...</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex mt-2 flex-shrink-0">
            <input
              type="text"
              value={directChatInput}
              onChange={(e) => setDirectChatInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Message ${playerDescription?.name}...`}
              disabled={chatState === 'leaving'}
              className={`flex-1 p-3 rounded-l bg-slate-600 text-white text-sm font-system focus:outline-none focus:ring-1 focus:ring-indigo-500 border border-slate-500 ${
                chatState === 'leaving' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              autoFocus
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !directChatInput.trim() || chatState === 'leaving'}
              className={`px-4 py-3 rounded-r bg-amber-500 text-black font-system border border-amber-400 ${
                isLoading || !directChatInput.trim() || chatState === 'leaving' 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-amber-400'
              }`}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DirectChat;