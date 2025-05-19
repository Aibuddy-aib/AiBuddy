import { v } from 'convex/values';
import { agentId, conversationId, parseGameId } from './ids';
import { Player, activity } from './player';
import { Conversation, conversationInputs } from './conversation';
import { movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { point } from '../util/types';
import { Path } from '../util/types';
import { Descriptions, characters } from '../../data/characters';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';
import { AIBTokenService } from '../services/aibTokenService';

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
  createAgent: inputHandler({
    args: {
      descriptionIndex: v.number(),
      name: v.optional(v.string()),
      identity: v.optional(v.string()),
      plan: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      const { descriptionIndex, name: customName, identity, plan } = args;
      const desc = Descriptions[descriptionIndex];
      const char = characters.find(c => c.name === desc.character);
      if (!char) throw new Error(`Character ${desc.character} not found`);

      // 生成以太坊地址和代币数量
      const ethAddress = Player.generateRandomEthAddress();
      const aibtoken = parseFloat((Math.random() * 20000).toFixed(4));

      const playerId = Player.join(
        game,
        now,
        customName ?? desc.name,
        desc.character,
        identity ?? desc.identity,
        undefined,
        ethAddress
      );
      
      // 确保Player对象已设置isWorking属性
      const player = game.world.players.get(parseGameId('players', playerId));
      if (player && player.isWorking === undefined) {
        player.isWorking = false;
      }
      
      // 确保PlayerDescription对象已设置isWorking属性
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
          name: customName ?? desc.name,
          textureUrl: char.textureUrl,
          spritesheetData: char.spritesheetData,
          speed: char.speed,
          state: 'idle',
          identity: identity ?? desc.identity,
          plan: plan ?? desc.plan,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
          ethAddress,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: identity ?? desc.identity,
          plan: plan ?? desc.plan,
          ethAddress,
        }),
      );
      
      // 使用AIBTokenService同步代币数据
      // 从Player对象到PlayerDescription对象
      if (player) {
        // 旧代码: AIBTokenService.syncTokenData(game, playerId);
        // 现在Player和PlayerDescription已经独立，不需要同步
        // PlayerDescription不再存储aibtoken字段
      }
      
      game.descriptionsModified = true; // 标记描述已修改，确保保存
      console.log(`Created agent ${agentId}: ${customName ?? desc.name}`);
      return { agentId };
    },
  }),
};

export type AgentInputs = typeof agentInputs;