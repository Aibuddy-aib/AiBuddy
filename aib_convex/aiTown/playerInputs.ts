import { v } from "convex/values";
import { inputHandler } from './inputHandler';
import { parseGameId } from "./ids";
import { Player } from "./player";
import { point } from "../util/types";
import { movePlayer, stopPlayer } from "./movement";
import { RANDOM_EVENT_COUNT, RANDOM_EVENTS, RANDOM_EVENT_INTERVAL } from "../constants";
import { Conversation } from "./conversation";
import { PlayerAgent } from "./playerAgent";
import { characters } from '../../data/characters';
import { WORK_DURATION, WORK_REWARD_INTERVAL } from "../constants";
import { Game } from "./game";
import { GameId } from "./ids";

// Helper function to get player with error handling
function getPlayer(game: Game, playerIdStr: string) {
  const playerId = parseGameId('players', playerIdStr);
  const player = game.world.players.get(playerId);
  if (!player) {
    throw new Error(`Invalid player ID ${playerId}`);
  }
  return { playerId, player };
}

// Helper function to get player description with error handling
function getPlayerDescription(game: Game, playerId: GameId<'players'>) {
  const playerDesc = game.playerDescriptions.get(playerId);
  if (!playerDesc) {
    throw new Error(`Player description not found for player ID ${playerId}`);
  }
  return playerDesc;
}

export const playerInputs = {
  join: inputHandler({
    args: {
      name: v.string(),
      character: v.string(),
      description: v.string(),
      ethAddress: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      Player.join(game, now, args.name, args.character, args.description, args.ethAddress);
      return null;
    },
  }),
  leave: inputHandler({
    args: { playerId: v.string() },
    handler: (game, now, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);
      player.leave(game, now);
      return null;
    },
  }),
  moveTo: inputHandler({
    args: {
      playerId: v.string(),
      destination: v.union(point, v.null()),
    },
    handler: (game, now, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      } else {
        stopPlayer(player);
      }
      return null;
    },
  }),
  startWorking: inputHandler({
    args: { 
      playerId: v.string(),
      workStartTime: v.number(),
      workRecordId: v.optional(v.id('workCompleteRecords'))
    },
    handler: (game, now, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);

      // If custom work start time is provided, use it
      if (args.workStartTime !== undefined) {
        player.workStartTime = args.workStartTime;
        console.log(`use custom work start time: ${new Date(args.workStartTime).toISOString()}`);
      }
      
      // Start work status
      const success = player.startWorking();
      if (!success) {
        throw new Error(`Player ${player.name} start working failed`);
      }
      
      // Set work activity, using saved start time or current time
      player.activity = {
        description: "Working",
        emoji: "👷",
        until: now + 1000
      };
      
      // Also update isWorking status and workStartTime in PlayerDescription
      try {
        const playerDesc = getPlayerDescription(game, player.id);
        playerDesc.isWorking = true;
        playerDesc.workStartTime = player.workStartTime;
        game.descriptionsModified = true;

        if (args.workRecordId) {
          // schedule work reward distribution
          const totalIntervals = Math.floor(WORK_DURATION / WORK_REWARD_INTERVAL);
          game.scheduleOperation('scheduleWorkRewards', 'player', {
            playerId: player.id,
            worldId: game.worldId,
            workStartTime: now,
            workRecordId: args.workRecordId,
            currentInterval: 1,
            maxIntervals: totalIntervals,
            rewardInterval: WORK_REWARD_INTERVAL
          });
          
          console.log(`Scheduled ${totalIntervals} reward distributions for player ${player.name}, completeWork will be triggered after final reward`)
        }
      } catch (error) {
        console.error("Error updating player description:", error);
      }

      return { success };
    },
  }),
  stopWorking: inputHandler({
    args: { playerId: v.string() },
    handler: (game, _, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);
      
      const success = player.stopWorking();
      
      // Also update isWorking status and workStartTime in PlayerDescription
      try {
        const playerDesc = getPlayerDescription(game, player.id);
        playerDesc.isWorking = false;
        playerDesc.workStartTime = undefined;
        game.descriptionsModified = true;
      } catch (error) {
        console.error("Error updating player description:", error);
      }
      
      // Clear the working activity
      if (player.activity?.description === "Working") {
        player.activity = undefined;
      }
      
      return { success };
    },
  }),
  // Add handler function for sending head messages
  sendHeadMessage: inputHandler({
    args: { 
      playerId: v.string(),
      message: v.string()
    },
    handler: (game, now, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);
      
      // Create an activity that lasts 10 seconds with yellow background
      player.activity = {
        description: args.message,
        emoji: "💬",
        until: now + 10000, // Disappear after 10 seconds
        style: {
          background: "#ffcc00", // Yellow background
          color: "black" // Black text to ensure readability
        }
      };
      
      // Get player name
      const playerName = player.name || `Player ${playerId}`;
      
      // Save head message to database, this requires using mutation instead of directly operating database
      // Set a flag here, the game engine will handle this request
      game.pendingHeadMessage = {
        playerId: player.id,
        playerName,
        message: args.message,
        timestamp: now
      };
      
      return { success: true };
    },
  }),
  // Edit player information transaction
  edit: inputHandler({
    args: {
      playerId: v.string(),
      name: v.optional(v.string()),
      character: v.optional(v.string()),
      description: v.optional(v.string()),
      ethAddress: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);
      
      // Update player basic information
      if (args.name !== undefined) {
        player.name = args.name;
      }
      if (args.ethAddress !== undefined) {
        player.ethAddress = args.ethAddress;
      }
      
      // Update player description information - use passed playerId instead of player.id
      try {
        const playerDesc = getPlayerDescription(game, playerId);
        if (args.name !== undefined) {
          playerDesc.name = args.name;
        }
        if (args.character !== undefined) {
          playerDesc.character = args.character;
        }
        if (args.description !== undefined) {
          playerDesc.description = args.description;
        }
        game.descriptionsModified = true;
      } catch (error) {
        console.error("Error updating player description:", error);
      }
      
      // Mark for database sync - use passed playerId
      game.pendingPlayerEdit = {
        playerId: playerId,
        name: args.name,
        character: args.character,
        description: args.description,
        ethAddress: args.ethAddress,
        timestamp: now
      };
      
      return { 
        success: true, 
        updatedPlayer: {
          id: playerId,
          name: player.name,
          character: game.playerDescriptions.get(playerId)?.character,
          description: game.playerDescriptions.get(playerId)?.description,
          ethAddress: player.ethAddress
        }
      };
    },
  }),
  triggerRandomEvent: inputHandler({
    args: {
      playerId: v.string(),
    },
    handler: (game, now, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);
      
      // check event interval
      const eventInterval = now - (player.lastEventTime || 0);
      if (eventInterval < RANDOM_EVENT_INTERVAL) {
        return { success: false, message: 'Event interval too short' };
      }
      
      // check daily event limit
      const today = new Date(now);
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      
      // check if it's a new day
      if (player.lastEventTime && player.lastEventTime < startOfDay) {
        // new day, reset count
        player.dailyEventCount = 0;
      }
      
      // check daily event limit
      if ((player.dailyEventCount || 0) >= RANDOM_EVENT_COUNT) {
        return { success: false, message: 'Daily event limit reached' };
      }
      
      // random select event
      const randomEvent = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
      
      const playerEvent = {
        title: randomEvent.title,
        description: randomEvent.description,
        type: randomEvent.type,
        amount: randomEvent.amount,
        createdAt: now,
      };
      
      // calculate token change
      const tokenChange = playerEvent.type === 'income' ? playerEvent.amount : -playerEvent.amount;
      const newTokenAmount = (player.aibtoken || 0) + tokenChange;
      
      // update player token
      player.aibtoken = newTokenAmount < 0 ? 0 : newTokenAmount;
      player.lastEventTime = now;
      player.dailyEventCount = (player.dailyEventCount || 0) + 1;
      
      // Event tokens are controlled by game engine, can sync
      player.syncTokenToDatabase(game);
     
      // add event to pendingOperations
      game.pendingOperations.push({
        name: 'insertEvent',
        type: 'player',
        args: {
          worldId: game.worldId,
          playerId: playerId,
          event: playerEvent,
        }
      });

      console.log(`Player ${player.name || playerId} triggered random event: ${playerEvent.title}, token change: ${tokenChange}`);

      return { 
        success: true, 
        event: playerEvent,
        tokenChange: tokenChange,
        newTokenAmount: newTokenAmount
      };
    },
  }),
  syncTokenData: inputHandler({
    args: {
      playerId: v.string(),
      aibtoken: v.number(),
    },
    handler: (game, now, args) => {
      const { playerId, player } = getPlayer(game, args.playerId);
      
      player.aibtoken = args.aibtoken;
      player.syncTokenToDatabase(game);
      
      console.log(`Synced token data for player ${player.name || playerId}: ${args.aibtoken}`);
      
      return { success: true };
    },
  }),
  sendMessageToAgent: inputHandler({
    args: {
      worldId: v.id('worlds'),
      agentId: v.string(),
      playerId: v.string(),
      conversationId: v.string(),
      text: v.string(),
      messageUuid: v.string(),
      isDirectChat: v.optional(v.boolean()),
    },
    handler: (game, now, args) => {
      const { player } = getPlayer(game, args.playerId);
      
      let conversationId = args.conversationId;
      if (!conversationId || conversationId === '') {
        const agentId = parseGameId('agents', args.agentId);
        const agent = game.world.agents.get(agentId);
        if (!agent) {
          return { success: false, error: 'Agent not found' };
        }
        
        // if isDirectChat, create conversation directly, otherwise use Conversation.start method (check distance)
        if (args.isDirectChat) {
          const newConversationId = game.allocId('conversations');
          const conversation = new Conversation({
            id: newConversationId,
            created: now,
            creator: player.id,
            numMessages: 0,
            participants: [
              { playerId: player.id, invited: now, status: { kind: 'participating', started: now } },
              { playerId: agent.playerId, invited: now, status: { kind: 'participating', started: now } },
            ],
            isDirectChat: true,
          });
          
          game.world.conversations.set(newConversationId, conversation);
          conversationId = newConversationId;
          console.log(`Created new conversation ${conversationId} for direct chat (bypassing distance check)`);
        } else {
          // for normal game interaction, use Conversation.start method (check distance)
          const agentPlayer = game.world.players.get(agent.playerId);
          if (!agentPlayer) {
            return { success: false, error: 'Agent player not found' };
          }
          
          const result = Conversation.start(game, now, player, agentPlayer);
          if (result.error) {
            return { success: false, error: result.error };
          }
          conversationId = result.conversationId!;
          console.log(`Created new conversation ${conversationId} for normal interaction`);
        }
      }
      
      const operationId = game.allocId('operations');
      player.startOperation(game, now, 'sendMessageToAgent', 'player', {
        worldId: args.worldId,
        agentId: args.agentId,
        playerId: args.playerId,
        conversationId: conversationId,
        text: args.text,
        messageUuid: args.messageUuid,
        operationId: operationId,
      });
      
      return { success: true };
    },
  }),
  leaveDirectChat: inputHandler({
    args: {
      worldId: v.id('worlds'),
      agentId: v.string(),
      playerId: v.string(),
      conversationId: v.string(),
    },
    handler: (game, now, args) => {
      // delete conversation
      const conversationId = parseGameId('conversations', args.conversationId);
      const deleted = game.world.conversations.delete(conversationId);
      
      // clean up agent state
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (agent) {
        // clean up agent conversation state
        agent.inProgressOperation = undefined;
        agent.lastConversation = undefined;
        agent.toRemember = undefined;
      }
      
      // clean up player agent state
      try {
        const playerAgentId = parseGameId('players', args.playerId);
        const playerAgent = game.world.playerAgents.get(playerAgentId);
        if (playerAgent) {
          playerAgent.inProgressOperation = undefined;
        }
      } catch (error) {
        // Player agent might not exist, which is fine
        console.debug("Player agent not found:", error);
      }
      
      console.log(`[leaveDirectChat] Directly deleted conversation ${args.conversationId}, deleted: ${deleted}`);
      return { success: true };
    },
  }),
  createPlayerAgent: inputHandler({
    args: {
      name: v.string(),
      ethAddress: v.string(),
      character: v.string(),
      identity: v.string(),
    },
    handler: (game, now, args) => {
      const { character, name: customName, identity, ethAddress } = args;
      const char = characters.find(c => c.name === character);
      if (!char) throw new Error(`Character ${character} not found`);

      // generate ethereum address and token amount
      const playerId = Player.join(
        game,
        now,
        customName,
        character,
        identity,
        ethAddress,
      );
      
      // ensure Player object has isWorking property
      try {
        const { player } = getPlayer(game, playerId);
        if (player && player.isWorking === undefined) {
          player.isWorking = false;
        }
        
        // ensure PlayerDescription object has isWorking property
        const playerDesc = getPlayerDescription(game, playerId);
        if (playerDesc && playerDesc.isWorking === undefined) {
          playerDesc.isWorking = false;
        }
      } catch (error) {
        console.error("Error ensuring isWorking property:", error);
      }
      
      game.world.playerAgents.set(
        playerId,
        new PlayerAgent({
          id: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      
      console.log(`Created player agent ${playerId}: ${customName}`);
      return {
        playerId,
        data: {
          playerId: playerId,
          name: customName,
          ethAddress: ethAddress,
          character: character,
          identity: identity,
          avatarPath: `/assets/${character}.png`,
          createdAt: now,
          updatedAt: now,
        }
      };
    },
  }),
};

export type PlayerInputs = typeof playerInputs;