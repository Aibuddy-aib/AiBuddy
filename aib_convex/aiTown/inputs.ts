import { ObjectType } from 'convex/values';
import { playerInputs } from './player';
import { conversationInputs } from './conversation';
import { agentInputs } from './agentInputs';
import { v } from 'convex/values';
import { GameId, parseGameId } from './ids';
import { inputHandler } from './inputHandler';
import { Agent } from './agent';
import { Descriptions, characters } from '../../data/characters';
import { PlayerDescription } from './playerDescription';
import { AgentDescription } from './agentDescription';
import { Player } from './player';

// It's easy to hit circular dependencies with these imports,
// so assert at module scope so we hit errors when analyzing.
if (playerInputs === undefined || conversationInputs === undefined || agentInputs === undefined) {
  throw new Error("Input map is undefined, check if there's a circular import.");
}

// 自定义输入：创建带有以太坊地址的角色
export const customInputs = {
  createAgentWithEthAddress: inputHandler({
    args: {
      descriptionIndex: v.number(),
      name: v.string(),
      identity: v.string(),
      plan: v.string(),
      ethAddress: v.string(),
    },
    handler: (game, now, args) => {
      const description = Descriptions[args.descriptionIndex];
      if (!description) {
        throw new Error(`Invalid description index: ${args.descriptionIndex}`);
      }
      
      // 检查地址格式，支持ETH和Solana
      const isEthAddress = args.ethAddress.startsWith('0x') && args.ethAddress.length === 42;
      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(args.ethAddress); // Solana地址是base58编码，通常32-44字符
      
      if (!isEthAddress && !isSolanaAddress) {
        throw new Error(`Invalid address format. Must be ETH (0x...) or Solana address: ${args.ethAddress}`);
      }
      
      // 检查是否已存在具有相同地址的玩家
      for (const player of game.world.players.values()) {
        if (player.ethAddress === args.ethAddress) {
          throw new Error(`Player with address ${args.ethAddress} already exists`);
        }
      }
      
      // 创建玩家
      const player = Player.join(
        game,
        now,
        args.name,
        description.character,
        args.identity, // 使用用户提供的identity作为描述，而不是固定描述
        undefined, // tokenIdentifier为undefined，表示非人类玩家
        args.ethAddress // 传入以太坊地址
      );
      
      // 创建代理
      const agent = new Agent({
        id: game.allocId('agents'),
        playerId: player,
        identity: args.identity,
        plan: args.plan,
        textureUrl: characters.find(c => c.name === description.character)?.textureUrl,
        spritesheetData: characters.find(c => c.name === description.character)?.spritesheetData,
        speed: characters.find(c => c.name === description.character)?.speed,
        name: args.name,
        ethAddress: args.ethAddress,
      });
      game.world.agents.set(agent.id, agent);
      
      // 创建代理描述
      const agentDescription = new AgentDescription({
        agentId: agent.id,
        identity: args.identity,
        plan: args.plan,
        ethAddress: args.ethAddress,
      });
      game.agentDescriptions.set(agent.id, agentDescription);
      game.descriptionsModified = true;
      
      console.log(`Created agent ${agent.id} for player ${player} with Ethereum address ${args.ethAddress}`);
      return agent.id;
    },
  }),
};

export const inputs = {
  ...playerInputs,
  // Inputs for the messaging layer.
  ...conversationInputs,
  // Inputs for the agent layer.
  ...agentInputs,
  // Custom inputs for user management
  ...customInputs,
};
export type Inputs = typeof inputs;
export type InputNames = keyof Inputs;
export type InputArgs<Name extends InputNames> = ObjectType<Inputs[Name]['args']>;
export type InputReturnValue<Name extends InputNames> = ReturnType<
  Inputs[Name]['handler']
> extends Promise<infer T>
  ? T
  : never;
