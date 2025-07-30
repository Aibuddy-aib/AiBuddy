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
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
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
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
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
      workStartTime: v.optional(v.number()) // Add optional work start time parameter
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
      // Check if player is in conversation (but allow working while moving)
      const conversation = [...game.world.conversations.values()].find((c) =>
        c.participants.has(player.id)
      );
      
      if (conversation) {
        return { success: false, reason: "Cannot start working while in a conversation" };
      }
      
      // If custom work start time is provided, use it
      if (args.workStartTime !== undefined) {
        player.workStartTime = args.workStartTime;
        console.log(`use custom work start time: ${new Date(args.workStartTime).toISOString()}`);
      }
      
      // Start work status
      const success = player.startWorking();
      
      // Set work activity, using saved start time or current time
      player.activity = {
        description: "Working",
        emoji: "👷",
        until: now + 1000
      };
      
      // Also update isWorking status and workStartTime in PlayerDescription
      const playerDesc = game.playerDescriptions.get(player.id);
      if (playerDesc) {
        playerDesc.isWorking = true;
        playerDesc.workStartTime = player.workStartTime;
        game.descriptionsModified = true;
      }

      return { success };
    },
  }),
  stopWorking: inputHandler({
    args: { playerId: v.string() },
    handler: (game, _, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
      const success = player.stopWorking();
      
      // Also update isWorking status and workStartTime in PlayerDescription
      const playerDesc = game.playerDescriptions.get(player.id);
      if (playerDesc) {
        playerDesc.isWorking = false;
        playerDesc.workStartTime = undefined;
        game.descriptionsModified = true;
      }
      
      // Clear the working activity
      if (player.activity?.description === "Working") {
        player.activity = undefined;
      }
      
      // Sync token data to database
      // player.syncTokenToDatabase(game);
      
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
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
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
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
      // Update player basic information
      if (args.name !== undefined) {
        player.name = args.name;
      }
      if (args.ethAddress !== undefined) {
        player.ethAddress = args.ethAddress;
      }
      
      // Update player description information - use passed playerId instead of player.id
      const playerDesc = game.playerDescriptions.get(playerId);
      if (playerDesc) {
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
          character: playerDesc?.character,
          description: playerDesc?.description,
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
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
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
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);
      
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
      isDirectChat: v.optional(v.boolean()), // add this parameter to bypass distance check
    },
    handler: (game, now, args) => {
      const player = game.world.players.get(parseGameId('players', args.playerId));
      if (!player) {
        return { success: false, error: 'Player not found' };
      }
      
      let conversationId = args.conversationId;
      if (!conversationId || conversationId === '') {
        const agent = game.world.agents.get(parseGameId('agents', args.agentId));
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
      const agent = game.world.agents.get(parseGameId('agents', args.agentId));
      if (agent) {
        agent.startOperation(game, now, 'agentGenerateMessage', 'agent', {
          worldId: args.worldId,
          playerId: agent.playerId,
          agentId: args.agentId,
          conversationId: args.conversationId,
          otherPlayerId: args.playerId,
          messageUuid: crypto.randomUUID(),
          type: 'leave',
        });
      }
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
      // const desc = Descriptions[descriptionIndex];
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
        // Don't pass customPlayerId, let game engine generate it
      );
      
      // ensure Player object has isWorking property
      const player = game.world.players.get(parseGameId('players', playerId));
      if (player && player.isWorking === undefined) {
        player.isWorking = false;
      }
      
      // ensure PlayerDescription object has isWorking property
      const playerDesc = game.playerDescriptions.get(parseGameId('players', playerId));
      if (playerDesc && playerDesc.isWorking === undefined) {
        playerDesc.isWorking = false;
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
          createdAt: now, // This `now` is the game engine's `now`
          updatedAt: now, // This `now` is the game engine's `now`
        }
      };
    },
  }),
};

export type PlayerInputs = typeof playerInputs;