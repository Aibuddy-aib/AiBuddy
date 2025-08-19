import { v } from "convex/values";
import { inputHandler } from './inputHandler';
import { parseGameId } from "./ids";
import { Player } from "./player";
import { point } from "../util/types";
import { movePlayer, stopPlayer } from "./movement";
import { RANDOM_EVENT_COUNT, RANDOM_EVENTS, RANDOM_EVENT_INTERVAL } from "../constants";
import { Conversation } from "./conversation";
import { characters } from '../../data/characters';
import { WORK_DURATION, WORK_REWARD_INTERVAL } from "../constants";
import { conversationInputs } from './conversation';
import { Agent } from "./agent";
import { AgentDescription } from "./agentDescription";

export const playerInputs = {
  join: inputHandler({
    args: {
      name: v.string(),
      character: v.string(),
      ethAddress: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      Player.join(game, now, args.name, args.character, args.ethAddress);
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
      workStartTime: v.number(), // Add work start time parameter
      workRecordId: v.optional(v.id('workCompleteRecords'))
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) throw new Error(`Invalid player ID ${playerId}`);

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
      const playerDesc = game.playerDescriptions.get(player.id);
      if (playerDesc) {
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
        game.descriptionsModified = true;
      }
      
      // Mark for database sync - use passed playerId
      game.pendingPlayerEdit = {
        playerId: playerId,
        name: args.name,
        character: args.character,
        ethAddress: args.ethAddress,
        timestamp: now
      };
      
      return { 
        success: true, 
        updatedPlayer: {
          id: playerId,
          name: player.name,
          character: playerDesc?.character,
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
      // Comprehensive parameter validation
      if (!args.worldId || !args.agentId || !args.playerId || !args.text || !args.messageUuid) {
        throw new Error('Missing required parameters for sendMessageToAgent');
      }

      if (typeof args.text !== 'string' || args.text.trim().length === 0) {
        throw new Error('Message text must be a non-empty string');
      }

      if (args.text.length > 1000) {
        throw new Error('Message text too long (max 1000 characters)');
      }

      if (typeof args.messageUuid !== 'string' || args.messageUuid.length === 0) {
        throw new Error('Invalid message UUID');
      }

      const player = game.world.players.get(parseGameId('players', args.playerId));
      if (!player) {
        throw new Error(`Player not found: ${args.playerId}`);
      }

      const agent = game.world.agents.get(parseGameId('agents', args.agentId));
      if (!agent) {
        throw new Error(`Agent not found: ${args.agentId}`);
      }

      const agentPlayer = game.world.players.get(agent.playerId);
      if (!agentPlayer) {
        throw new Error(`Agent's player not found: ${agent.playerId}`);
      }

      // Check if player is already in a conversation (prevent multiple simultaneous conversations)
      const existingConversation = [...game.world.conversations.values()]
        .find(c => c.participants.has(player.id));
      
      let conversationId = args.conversationId;
      if (!conversationId || conversationId === '') {
        // Validate that player is not already in another conversation for direct chat
        if (args.isDirectChat && existingConversation) {
          throw new Error('Player is already in another conversation');
        }
        
        // Create conversation: direct chat bypasses distance check, normal interaction requires proximity
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
          console.log(`Created new direct chat conversation ${conversationId} (bypassing distance check)`);
        } else {
          // For normal game interaction, use Conversation.start method (requires proximity check)
          const result = Conversation.start(game, now, player, agentPlayer);
          if (result.error) {
            throw new Error(`Failed to start conversation: ${result.error}`);
          }
          if (!result.conversationId) {
            throw new Error('Conversation creation failed: no conversation ID returned');
          }
          conversationId = result.conversationId;
          console.log(`Created new proximity-based conversation ${conversationId}`);
        }
      } else {
        // Validate existing conversation
        const conversation = game.world.conversations.get(parseGameId('conversations', conversationId));
        if (!conversation) {
          throw new Error(`Conversation not found: ${conversationId}`);
        }
        
        // Verify both player and agent are participants
        if (!conversation.participants.has(player.id) || !conversation.participants.has(agentPlayer.id)) {
          throw new Error('Player or agent is not a participant in this conversation');
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
      
      return { success: true, conversationId: conversationId };
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
      // Parameter validation
      if (!args.worldId || !args.agentId || !args.playerId || !args.conversationId) {
        throw new Error('Missing required parameters for leaveDirectChat');
      }

      if (typeof args.conversationId !== 'string' || args.conversationId.trim().length === 0) {
        throw new Error('Invalid conversation ID');
      }

      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      
      if (!conversation) {
        console.warn(`[leaveDirectChat] Conversation ${args.conversationId} not found`);
        return { success: false, error: 'Conversation not found' };
      }

      // Verify the requesting player is actually a participant
      const playerId = parseGameId('players', args.playerId);
      if (!conversation.participants.has(playerId)) {
        throw new Error('Player is not a participant in this conversation');
      }

      // Clean up all participants' states
      const participantIds = Array.from(conversation.participants.keys());
      let cleanedAgents = 0;
      
      for (const participantId of participantIds) {
        // Clean up agent state
        const agent = [...game.world.agents.values()].find((a) => a.playerId === participantId);
        if (agent) {
          agent.inProgressOperation = undefined;
          agent.lastConversation = now;
          agent.toRemember = undefined;
          cleanedAgents++;
        }
      }
      
      // Delete the conversation
      const deleted = game.world.conversations.delete(conversationId);
      
      if (!deleted) {
        console.error(`[leaveDirectChat] Failed to delete conversation ${args.conversationId}`);
        return { success: false, error: 'Failed to delete conversation' };
      }
      
      console.log(`[leaveDirectChat] Successfully deleted conversation ${args.conversationId}, cleaned ${cleanedAgents} agents`);
      
      return { 
        success: true, 
        deleted, 
        cleanedAgents,
        conversationId: args.conversationId 
      };
    },
  }),
  forceAgentConversation: inputHandler({
    args: {
      worldId: v.id('worlds'),
      agent1Id: v.string(),
      agent2Id: v.string(),
      initialMessage: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      // Find the first agent
      const agent1 = game.world.agents.get(parseGameId('agents', args.agent1Id));
      if (!agent1) {
        throw new Error(`Agent 1 not found: ${args.agent1Id}`);
      }
      
      // Find the second agent
      const agent2 = game.world.agents.get(parseGameId('agents', args.agent2Id));
      if (!agent2) {
        throw new Error(`Agent 2 not found: ${args.agent2Id}`);
      }
      
      // Get the players associated with these agents
      const player1 = game.world.players.get(agent1.playerId);
      if (!player1) {
        throw new Error(`Player 1 not found for agent: ${args.agent1Id}`);
      }
      
      const player2 = game.world.players.get(agent2.playerId);
      if (!player2) {
        throw new Error(`Player 2 not found for agent: ${args.agent2Id}`);
      }
      
      // Check if either agent is already in a conversation
      if ([...game.world.conversations.values()].find((c) => c.participants.has(player1.id))) {
        throw new Error(`Agent 1 (${player1.name}) is already in a conversation`);
      }
      if ([...game.world.conversations.values()].find((c) => c.participants.has(player2.id))) {
        throw new Error(`Agent 2 (${player2.name}) is already in a conversation`);
      }
      
      // Create a new conversation between the two agents
      const conversationId = game.allocId('conversations');
      const conversation = new Conversation({
        id: conversationId,
        created: now,
        creator: player1.id,
        numMessages: 0,
        participants: [
          { playerId: player1.id, invited: now, status: { kind: 'participating', started: now } },
          { playerId: player2.id, invited: now, status: { kind: 'participating', started: now } },
        ],
        isDirectChat: true, // Force conversation, bypass distance check
      });
      
      game.world.conversations.set(conversationId, conversation);
      
      // If an initial message is provided, send it from agent1
      if (args.initialMessage && args.initialMessage.trim()) {
        const messageUuid = crypto.randomUUID();
        conversation.setIsTyping(now, player1, messageUuid);
        
        // Start the operation to generate and send the message
        player1.startOperation(game, now, 'sendMessageToAgent', 'player', {
          worldId: args.worldId,
          agentId: args.agent1Id,
          playerId: player1.id,
          conversationId: conversationId,
          text: args.initialMessage.trim(),
          messageUuid: messageUuid,
          operationId: game.allocId('operations'),
        });
      } else {
        // Trigger agent1 to start the conversation naturally
        const messageUuid = crypto.randomUUID();
        conversation.setIsTyping(now, player1, messageUuid);
        
        agent1.startOperation(game, now, 'agentGenerateMessage', 'agent', {
          worldId: args.worldId,
          playerId: player1.id,
          agentId: args.agent1Id,
          conversationId: conversationId,
          otherPlayerId: player2.id,
          messageUuid: messageUuid,
          type: 'start',
        });
      }
      
      return { conversationId, success: true };
    },
  }),
  forceEndConversation: inputHandler({
    args: {
      worldId: v.id('worlds'),
      conversationId: v.string(),
      reason: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      
      if (!conversation) {
        throw new Error(`Conversation ${args.conversationId} not found`);
      }

      // Clean up all participants' state
      const participantIds = Array.from(conversation.participants.keys());
      let cleanedAgents = 0;
      
      for (const participantId of participantIds) {
        const agent = [...game.world.agents.values()].find((a) => a.playerId === participantId);
        if (agent) {
          // Clean up agent state
          delete agent.inProgressOperation;
          agent.lastConversation = now;
          cleanedAgents++;
        }
      }
      
      // If no related agent found, clean up creator as fallback
      if (cleanedAgents === 0) {
        const creatorAgent = [...game.world.agents.values()].find((a) => a.playerId === conversation.creator);
        if (creatorAgent) {
          delete creatorAgent.inProgressOperation;
          creatorAgent.lastConversation = now;
          cleanedAgents = 1;
        }
      }
      
      // Delete the conversation from the world
      const deleted = game.world.conversations.delete(conversationId);
      
      console.log(`Force ended conversation ${args.conversationId}, cleaned ${cleanedAgents} agents, reason: ${args.reason || 'No reason provided'}`);
      
      return { 
        success: true, 
        deleted, 
        cleanedAgents,
        conversationId: args.conversationId 
      };
    },
  }),
  sendMessageToPlayer: inputHandler({
    args: {
      worldId: v.id('worlds'),
      fromPlayerId: v.string(),
      toPlayerId: v.string(),
      conversationId: v.string(),
      text: v.string(),
      messageUuid: v.string(),
      isDirectChat: v.optional(v.boolean()),
    },
    handler: (game, now, args) => {
      // Comprehensive parameter validation
      if (!args.worldId || !args.fromPlayerId || !args.toPlayerId || !args.text || !args.messageUuid) {
        throw new Error('Missing required parameters for sendMessageToPlayer');
      }

      if (typeof args.text !== 'string' || args.text.trim().length === 0) {
        throw new Error('Message text must be a non-empty string');
      }

      if (args.text.length > 1000) {
        throw new Error('Message text too long (max 1000 characters)');
      }

      if (typeof args.messageUuid !== 'string' || args.messageUuid.length === 0) {
        throw new Error('Invalid message UUID');
      }

      const fromPlayer = game.world.players.get(parseGameId('players', args.fromPlayerId));
      if (!fromPlayer) {
        throw new Error(`From player not found: ${args.fromPlayerId}`);
      }

      const toPlayer = game.world.players.get(parseGameId('players', args.toPlayerId));
      if (!toPlayer) {
        throw new Error(`To player not found: ${args.toPlayerId}`);
      }

      // Check if from player is already in a conversation
      const existingConversation = [...game.world.conversations.values()]
        .find(c => c.participants.has(fromPlayer.id));
      
      let conversationId = args.conversationId;
      if (!conversationId || conversationId === '') {
        // Validate that from player is not already in another conversation for direct chat
        if (args.isDirectChat && existingConversation) {
          throw new Error('From player is already in another conversation');
        }
        
        // Create conversation: direct chat bypasses distance check
        if (args.isDirectChat) {
          const newConversationId = game.allocId('conversations');
          const conversation = new Conversation({
            id: newConversationId,
            created: now,
            creator: fromPlayer.id,
            numMessages: 0,
            participants: [
              { playerId: fromPlayer.id, invited: now, status: { kind: 'participating', started: now } },
              { playerId: toPlayer.id, invited: now, status: { kind: 'participating', started: now } },
            ],
            isDirectChat: true,
          });
          
          game.world.conversations.set(newConversationId, conversation);
          conversationId = newConversationId;
          console.log(`Created new direct chat conversation ${conversationId} between players`);
        } else {
          // For normal game interaction, use Conversation.start method (requires proximity check)
          const result = Conversation.start(game, now, fromPlayer, toPlayer);
          if (result.error) {
            throw new Error(`Failed to start conversation: ${result.error}`);
          }
          if (!result.conversationId) {
            throw new Error('Conversation creation failed: no conversation ID returned');
          }
          conversationId = result.conversationId;
          console.log(`Created new proximity-based conversation ${conversationId} between players`);
        }
      } else {
        // Validate existing conversation
        const conversation = game.world.conversations.get(parseGameId('conversations', conversationId));
        if (!conversation) {
          throw new Error(`Conversation not found: ${conversationId}`);
        }
        
        // Verify both players are participants
        if (!conversation.participants.has(fromPlayer.id)) {
          throw new Error(`From player is not a participant in conversation: ${conversationId}`);
        }
        if (!conversation.participants.has(toPlayer.id)) {
          throw new Error(`To player is not a participant in conversation: ${conversationId}`);
        }
      }

      // Send the message
      const conversation = game.world.conversations.get(parseGameId('conversations', conversationId));
      if (!conversation) {
        throw new Error(`Conversation not found after creation: ${conversationId}`);
      }

      // Add the message to the conversation using the correct method
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: fromPlayer.id,
        conversationId: conversationId,
        timestamp: now,
      });
      
      console.log(`Message sent from ${fromPlayer.name} to ${toPlayer.name} in conversation ${conversationId}`);
      
      return { conversationId, success: true };
    },
  }),
  updateAgentDescription: inputHandler({
    args: {
      worldId: v.id('worlds'),
      playerId: v.string(),
      identity: v.optional(v.string()),
      plan: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Player not found: ${args.playerId}`);
      }

      // Find the agent for this player
      const agent = [...game.world.agents.values()].find(a => a.playerId === playerId);
      if (!agent) {
        throw new Error(`Agent not found for player: ${args.playerId}`);
      }

      // Get the agent description
      const agentDesc = game.agentDescriptions.get(agent.id);
      if (!agentDesc) {
        throw new Error(`Agent description not found for agent: ${agent.id}`);
      }

      // Update the agent description
      if (args.identity !== undefined) {
        agentDesc.identity = args.identity;
      }
      if (args.plan !== undefined) {
        agentDesc.plan = args.plan;
      }

      // Mark descriptions as modified for database sync
      game.descriptionsModified = true;

      console.log(`Updated agent description for player ${playerId}:`, {
        identity: agentDesc.identity,
        plan: agentDesc.plan
      });

      return { 
        success: true, 
        updatedAgentDescription: {
          identity: agentDesc.identity,
          plan: agentDesc.plan
        }
      };
    },
  }),
};

export type PlayerInputs = typeof playerInputs;