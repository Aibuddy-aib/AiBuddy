import { Character } from './Character.tsx';
import { orientationDegrees } from '../../convex/util/geometry.ts';
import { characters } from '../../data/characters.ts';
import { toast } from 'react-toastify';
import { Player as ServerPlayer } from '../../convex/aiTown/player.ts';
import { GameId } from '../../convex/aiTown/ids.ts';
import { Location, locationFields, playerLocation } from '../../convex/aiTown/location.ts';
import { useHistoricalValue } from '../hooks/useHistoricalValue.ts';
import { ServerGame } from '../hooks/serverGame.ts';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export type SelectElement = (element?: { kind: 'player'; id: GameId<'players'> }) => void;

const logged = new Set<string>();

export const Player = ({
  game,
  isViewer,
  player,
  onClick,
  historicalTime,
  userAddress,
  viewportInfo,
}: {
  game: ServerGame;
  isViewer: boolean;
  player: ServerPlayer;
  onClick: SelectElement;
  historicalTime?: number;
  userAddress?: string | null;
  viewportInfo?: any;
}) => {
  const playerCharacter = game.playerDescriptions.get(player.id)?.character;
  if (!playerCharacter) {
    throw new Error(`Player ${player.id} has no character`);
  }
  const character = characters.find((c) => c.name === playerCharacter);

  const locationBuffer = game.world.historicalLocations?.get(player.id);
  const historicalLocation = useHistoricalValue<Location>(
    locationFields,
    historicalTime,
    playerLocation(player),
    locationBuffer,
  );
  if (!character) {
    if (!logged.has(playerCharacter)) {
      logged.add(playerCharacter);
      toast.error(`Unknown character ${playerCharacter}`);
    }
    return null;
  }

  if (!historicalLocation) {
    return null;
  }

  // Find the conversation that the character is participating in
  const conversation = [...game.world.conversations.values()].find(c => {
    return [...c.participants.keys()].includes(player.id) &&
      [...c.participants.values()].some(p => p.status.kind === 'participating');
  });

  const conversationId = conversation?.id;
  const worldId = useQuery(api.world.defaultWorldStatus)?.worldId;
  
  // Determine if the character is currently speaking
  const isSpeaking = !![...game.world.conversations.values()].find(
    (c) => c.isTyping?.playerId === player.id,
  );
  
  // Get all messages in the conversation
  const messages = useQuery(
    api.messages.listMessages,
    conversationId && worldId ? { worldId, conversationId } : 'skip'
  );
  
  // Only get the message that the character is currently saying or the most recent one
  let currentMessage = '';
  if (messages?.length) {
    // If the character is speaking, find what they are typing
    if (isSpeaking) {
      // Find the latest message from this character
      const latestMessage = messages
        .filter(m => m.author === player.id)
        .sort((a, b) => b._creationTime - a._creationTime)[0]?.text;
      
      if (latestMessage) {
        currentMessage = latestMessage;
      }
    }
  }

  const isThinking =
    !isSpeaking &&
    !![...game.world.agents.values()].find(
      (a) => a.playerId === player.id && !!a.inProgressOperation && a.inProgressOperation.name !== 'agentDoSomething'
    );
    
  // Determine whether to show the thinking icon, but don't affect movement
  const shouldShowThinking = isThinking && (!historicalLocation.speed || historicalLocation.speed === 0);
    
  const tileDim = game.worldMap.tileDim;
  const historicalFacing = { dx: historicalLocation.dx, dy: historicalLocation.dy };
  
  // Get character name
  const playerName = game.playerDescriptions.get(player.id)?.name || playerCharacter;
  
  // Get character AIB token data - from player object, which is kept up-to-date by AIBTokenService
  const playerAibtoken = player.aibtoken !== undefined 
    ? player.aibtoken 
    : game.playerDescriptions.get(player.id)?.aibtoken || 0;
  
  // Determine if this is the current logged-in user's character
  const isCurrentUser = userAddress && player.ethAddress === userAddress ? true : false;
  
  // Add debug log
  if (isCurrentUser) {
    console.log('Current user character:', {
      playerName,
      playerEthAddress: player.ethAddress,
      userAddress,
      isCurrentUser
    });
  }
  
  const inConversation = !![...game.world.conversations.values()].find(
    (c) => c.participants.has(player.id) && !['invited'].includes(c.participants.get(player.id)!.status.kind),
  );

  // Enhanced click handling
  const handleClick = () => {
    console.log("Player component: Handling click event, setting selected character:", player.id);
    onClick({
      kind: 'player',
      id: player.id,
    });
  };

  return (
    <Character
      textureUrl={character.textureUrl}
      spritesheetData={character.spritesheetData}
      x={historicalLocation.x * tileDim + tileDim / 2}
      y={historicalLocation.y * tileDim + tileDim / 2}
      orientation={orientationDegrees(historicalFacing)}
      isMoving={historicalLocation.speed > 0}
      isThinking={shouldShowThinking}
      isViewer={isViewer}
      speed={character.speed}
      isSpeaking={isSpeaking && !!currentMessage}
      emoji={
        player.activity && player.activity.until > (historicalTime ?? Date.now())
          ? player.activity?.emoji
          : undefined
      }
      lastMessage={currentMessage}
      characterName={playerName}
      aibtoken={playerAibtoken}
      onClick={handleClick}
      activity={player.activity && player.activity.until > (historicalTime ?? Date.now()) 
        ? player.activity
        : undefined}
      isCurrentUser={isCurrentUser}
      ethAddress={player.ethAddress || ''}
      viewportInfo={viewportInfo}
    />
  );
};
