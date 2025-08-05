import { v } from 'convex/values';
import { agentId, conversationId, parseGameId } from './ids';
import { Player, activity } from './player';
import { Conversation, conversationInputs } from './conversation';
import { movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { point } from '../util/types';
import { characters } from '../../data/characters';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';

export const agentInputs = {
  finishRememberConversation: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} isn't remembering ${args.operationId}`);
      } else {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),
  finishWalk: inputHandler({
    args: {
      operationId: v.string(),
      agentId: v.id('agents'),
      destination: v.optional(point),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      // check if operation matches
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      // clear inProgressOperation
      delete agent.inProgressOperation;

      // move agent to target position
      if (args.destination) {
        const player = game.world.players.get(agent.playerId);
        if (player) {
          movePlayer(game, now, player, args.destination);
        }
      }
      return null;
    },
  }),
  finishDoSomething: inputHandler({
    args: {
      operationId: v.string(),
      agentId: v.id('agents'),
      destination: v.optional(point),
      invitee: v.optional(v.id('players')),
      activity: v.optional(activity),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      if (args.invitee) {
        const inviteeId = parseGameId('players', args.invitee);
        const invitee = game.world.players.get(inviteeId);
        if (!invitee) {
          throw new Error(`Couldn't find player: ${inviteeId}`);
        }
        Conversation.start(game, now, player, invitee);
        agent.lastInviteAttempt = now;
      }
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      }
      if (args.activity) {
        player.activity = args.activity;
      }
      return null;
    },
  }),
  agentFinishSendingMessage: inputHandler({
    args: {
      agentId,
      conversationId,
      timestamp: v.number(),
      operationId: v.string(),
      leaveConversation: v.boolean(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Couldn't find conversation: ${conversationId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} wasn't sending a message ${args.operationId}`);
        return null;
      }
      delete agent.inProgressOperation;
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) {
        conversation.leave(game, now, player);
      }
      return null;
    },
  }),
  agentForceExitConversation: inputHandler({
    args: {
      agentId,
      conversationId,
      playerId: v.string(),
      reason: v.string(),
      operationId: v.string(),
      timestamp: v.number(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      
      console.log(`Agent ${agentId} force exiting conversation ${conversationId} due to: ${args.reason}`);
      
      // clear inProgressOperation
      if (agent.inProgressOperation && agent.inProgressOperation.operationId === args.operationId) {
        delete agent.inProgressOperation;
        console.log(`Cleared inProgressOperation for agent ${agentId}`);
      }
      
      // handle message sending completion
      if (conversation) {
        conversationInputs.finishSendingMessage.handler(game, now, {
          playerId: agent.playerId,
          conversationId: args.conversationId,
          timestamp: args.timestamp,
        });
        
        // delete conversation from world
        const deleted = game.world.conversations.delete(conversationId);
        console.log(`Deleted conversation ${conversationId}: ${deleted}`);
      }
      
      // set agent state
      agent.lastConversation = now;
      // do not set toRemember, avoid subsequent remember operations
      
      console.log(`Agent ${agentId} successfully force exited conversation ${conversationId}`);
      
      return null;
    },
  }),
  createAgent: inputHandler({
    args: {
      character: v.string(),
      name: v.string(),
      identity: v.string(),
      plan: v.string(),
    },
    handler: (game, now, args) => {
      const { character, name: customName, identity, plan } = args;
      const char = characters.find(c => c.name === character);
      if (!char) throw new Error(`Character ${character} not found`);

      const playerId = Player.join(
        game,
        now,
        customName,
        character,
        identity,
        undefined,
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
      
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: identity,
          plan: plan,
        }),
      );
      
      game.descriptionsModified = true; // mark descriptions as modified, ensure saving
      console.log(`Created agent ${agentId}: ${customName}`);
      return { agentId };
    },
  }),
};

export type AgentInputs = typeof agentInputs;