import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { Point } from '../util/types';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
    );
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
      },
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    const text = await completionFn(
      ctx,
      args.worldId,
      args.conversationId as GameId<'conversations'>,
      args.playerId as GameId<'players'>,
      args.otherPlayerId as GameId<'players'>,
    );

    await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text,
      messageUuid: args.messageUuid,
      leaveConversation: args.type === 'leave',
      operationId: args.operationId,
    });
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent, otherFreePlayers } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();

    try {
      // 简单延迟，避免所有代理同时行动
      const totalDelay = 500 + Math.random() * 1000;
      console.log(`代理 ${agent.name || agent.id} 等待 ${totalDelay.toFixed(0)}ms 后行动...`);
      await sleep(totalDelay);
      
      // 大幅降低对话概率到10%，让角色更少交流，更多分散
      if (otherFreePlayers.length > 0 && Math.random() < 0.2) {
        // 计算所有其他自由玩家与当前玩家的距离
        const playersWithDistance = otherFreePlayers.map(otherPlayer => {
          const dist = Math.sqrt(
            Math.pow(player.position.x - otherPlayer.position.x, 2) + 
            Math.pow(player.position.y - otherPlayer.position.y, 2)
          );
          return { player: otherPlayer, distance: dist };
        });
        
        // 按距离排序
        playersWithDistance.sort((a, b) => a.distance - b.distance);
        
        // 选择最近的玩家进行对话
        // 如果距离超过20个单位，则有50%概率选择随机玩家而不是最近的
        // 这样可以增加一些随机性，避免角色总是找同一个人对话
        let selectedPlayer;
        if (playersWithDistance[0].distance > 30 && Math.random() < 0.3) {
          const randomIndex = Math.floor(Math.random() * playersWithDistance.length);
          selectedPlayer = playersWithDistance[randomIndex].player;
          console.log(`代理 ${agent.name || agent.id} 距离最近的玩家太远(${playersWithDistance[0].distance.toFixed(2)}单位)，随机选择了玩家 ${selectedPlayer.id}`);
        } else {
          selectedPlayer = playersWithDistance[0].player;
          console.log(`代理 ${agent.name || agent.id} 选择了最近的玩家 ${selectedPlayer.id}，距离: ${playersWithDistance[0].distance.toFixed(2)}单位`);
        }
        
        // 检查距离，如果超过10个单位，先移动靠近对方
        const distance = Math.sqrt(
          Math.pow(player.position.x - selectedPlayer.position.x, 2) + 
          Math.pow(player.position.y - selectedPlayer.position.y, 2)
        );
        
        if (distance > 10) {
          // 如果距离太远，先移动到对方附近
          const midpoint = {
            x: Math.floor((player.position.x + selectedPlayer.position.x) / 2),
            y: Math.floor((player.position.y + selectedPlayer.position.y) / 2)
          };
          
          console.log(`代理 ${agent.name || agent.id} 移动靠近 ${selectedPlayer.id} 后再发起对话，当前距离: ${distance.toFixed(2)}单位`);
          
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: midpoint
            },
          });
          return;
        }
        
        // 距离足够近，可以发起对话
        console.log(`代理 ${agent.name || agent.id} 邀请 ${selectedPlayer.id} 进行对话，当前距离: ${distance.toFixed(2)}单位`);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            invitee: selectedPlayer.id,
          },
        });
        return;
      }
      // 降低活动概率到20%，增加随机移动的可能性
      else if (Math.random() < 0.2) {
        // 选择随机活动
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        console.log(`代理 ${agent.name || agent.id} 开始${activity.description}活动 ${activity.emoji}`);
        
        // 计算活动结束时间
        const duration = activity.duration + Math.floor(Math.random() * 1000);
        const until = Date.now() + duration;
        
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: until, // 使用until字段而不是duration
            },
          },
        });
        return;
      }
      // 增加到70%概率执行随机移动，大幅提高分散可能性
      else {
        // 如果不对话，则随机移动
        const destination = getRandomDestination(map, agent.id);
        console.log(`代理 ${agent.name || agent.id} 移动到位置: (${destination.x}, ${destination.y})`);
        
        try {
          await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              destination: destination,
            },
          });
        } catch (error) {
          console.error(`代理 ${agent.name || agent.id} 发送移动指令时出错:`, error);
          await sleep(500);
          
          // 简化的重试逻辑
          try {
            await ctx.runMutation(api.aiTown.main.sendInput, {
              worldId: args.worldId,
              name: 'finishDoSomething',
              args: {
                operationId: args.operationId,
                agentId: agent.id,
                destination: destination,
              },
            });
          } catch (retryError) {
            console.error(`代理 ${agent.name || agent.id} 重试失败`);
          }
        }
      }
    } catch (error) {
      console.error(`代理 ${agent.name || agent.id} 行动过程中出错:`, error);
    }
  },
});

// 加强版随机目的地选择器，极大促进角色分散
function getRandomDestination(worldMap: WorldMap, agentId: string): Point {
  // 解析代理ID为数字，用作随机种子
  const agentIdNum = parseInt(agentId.split("_")[1] || "0", 10) || 0;
  
  // 随机决定行为类型 - 增加分散行为的权重
  const behaviorRoll = Math.random();
  
  // 增加到85%的概率执行强分散行为
  if (behaviorRoll < 0.85) {
    // 强力分散策略
    const distanceStrategy = Math.random();
    
    // 选择地图角落位置 (35%的概率)
    if (distanceStrategy < 0.35) {
      // 为确保最大分散效果，选择地图四角
      const farCorners = [
        { x: 2 + Math.floor(Math.random() * 3), y: 2 + Math.floor(Math.random() * 3) },
        { x: 2 + Math.floor(Math.random() * 3), y: worldMap.height - 5 + Math.floor(Math.random() * 3) },
        { x: worldMap.width - 5 + Math.floor(Math.random() * 3), y: 2 + Math.floor(Math.random() * 3) },
        { x: worldMap.width - 5 + Math.floor(Math.random() * 3), y: worldMap.height - 5 + Math.floor(Math.random() * 3) }
      ];
      
      // 使用代理ID来确定角色倾向的角落
      // 这确保了同样的角色总是倾向于去同一个角落，而不同角色去不同角落
      const preferredCornerIndex = agentIdNum % 4;
      // 但仍有30%概率去其他角落，增加随机性
      const cornerIndex = Math.random() < 0.7 ? preferredCornerIndex : Math.floor(Math.random() * 4);
      
      // 在选定角落附近随机选择位置，增加随机偏移
      const corner = farCorners[cornerIndex];
      const offsetX = Math.floor(Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1);
      const offsetY = Math.floor(Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1);
      
      const x = Math.max(1, Math.min(worldMap.width - 2, corner.x + offsetX));
      const y = Math.max(1, Math.min(worldMap.height - 2, corner.y + offsetY));
      
      console.log(`代理 ${agentId} 选择了角落位置: (${x}, ${y})`);
      return { x, y };
    }
    
    // 选择地图边缘 (30%的概率)
    else if (distanceStrategy < 0.65) {
      // 使用代理ID选择倾向的边缘
      const preferredSide = agentIdNum % 4;
      // 但仍有20%概率去其他边缘
      const chooseSide = Math.random() < 0.8 ? preferredSide : Math.floor(Math.random() * 4);
      
      let x, y;
      
      if (chooseSide === 0) {
        // 上边缘 - 距离边缘1-3格，避免完全贴边
        x = 3 + Math.floor(Math.random() * (worldMap.width - 6));
        y = 2 + Math.floor(Math.random() * 3);
      } else if (chooseSide === 1) {
        // 右边缘
        x = worldMap.width - 5 + Math.floor(Math.random() * 3);
        y = 3 + Math.floor(Math.random() * (worldMap.height - 6));
      } else if (chooseSide === 2) {
        // 下边缘
        x = 3 + Math.floor(Math.random() * (worldMap.width - 6));
        y = worldMap.height - 5 + Math.floor(Math.random() * 3);
      } else {
        // 左边缘
        x = 2 + Math.floor(Math.random() * 3);
        y = 3 + Math.floor(Math.random() * (worldMap.height - 6));
      }
      
      // 增加随机偏移，使角色不会都停在一条线上
      const offsetX = Math.floor(Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1);
      const offsetY = Math.floor(Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1);
      
      x = Math.max(1, Math.min(worldMap.width - 2, x + offsetX));
      y = Math.max(1, Math.min(worldMap.height - 2, y + offsetY));
      
      console.log(`代理 ${agentId} 选择了边缘位置: (${x}, ${y})`);
      return { x, y };
    }
    
    // 选择专属区域 (35%的概率) - 这是最强的分散策略
    else {
      // 将地图分成更多更细的区域，增加分散程度
      const gridSize = 15; // 增加到15x15的网格
      
      // 使用代理ID来确定一个固定的唯一区域
      // 使用质数17作为乘数增加伪随机性
      const uniqueAreaIndex = (agentIdNum * 17) % (gridSize * gridSize);
      const areaX = uniqueAreaIndex % gridSize;
      const areaY = Math.floor(uniqueAreaIndex / gridSize);
      
      // 计算区域的边界
      const cellWidth = Math.floor(worldMap.width / gridSize);
      const cellHeight = Math.floor(worldMap.height / gridSize);
      
      // 计算该区域边界，比前版本更精确
      const minX = Math.max(1, areaX * cellWidth);
      const maxX = Math.min(worldMap.width - 2, (areaX + 1) * cellWidth - 1);
      const minY = Math.max(1, areaY * cellHeight);
      const maxY = Math.min(worldMap.height - 2, (areaY + 1) * cellHeight - 1);
      
      // 为避免角色聚集在区域中心，使用均匀随机分布
      const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
      const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
      
      console.log(`代理 ${agentId} 选择了专属区域 (${areaX},${areaY}) 中的位置: (${x}, ${y})`);
      return { x, y };
    }
  }
  
  // 偶尔随机漫步 (10%概率)
  else if (behaviorRoll < 0.95) {
    // 避免选择地图中心区域（通常是人群聚集处）
    // 而是选择中等距离随机位置
    
    // 确定四个区域象限
    const quadrants = [
      { minX: 1, maxX: worldMap.width / 2 - 1, minY: 1, maxY: worldMap.height / 2 - 1 },
      { minX: worldMap.width / 2, maxX: worldMap.width - 2, minY: 1, maxY: worldMap.height / 2 - 1 },
      { minX: 1, maxX: worldMap.width / 2 - 1, minY: worldMap.height / 2, maxY: worldMap.height - 2 },
      { minX: worldMap.width / 2, maxX: worldMap.width - 2, minY: worldMap.height / 2, maxY: worldMap.height - 2 }
    ];
    
    // 选择一个象限，使用代理ID增加偏好
    const quadrantIndex = (agentIdNum + Math.floor(Math.random() * 2)) % 4;
    const quadrant = quadrants[quadrantIndex];
    
    // 在象限内随机选择位置
    const x = Math.floor(quadrant.minX + Math.random() * (quadrant.maxX - quadrant.minX));
    const y = Math.floor(quadrant.minY + Math.random() * (quadrant.maxY - quadrant.minY));
    
    console.log(`代理 ${agentId} 选择了象限 ${quadrantIndex} 中的随机位置: (${x}, ${y})`);
    return { x, y };
  }
  
  // 极少情况下回到自己的"家"区域 (5%概率)
  else {
    // 每个代理都有一个固定的"家"区域
    // 使用代理ID确定一个固定的区域
    const homeX = (agentIdNum * 7) % 5; // 将地图水平分为5个区域
    const homeY = (agentIdNum * 11) % 5; // 将地图垂直分为5个区域
    
    // 计算家区域的边界
    const homeWidth = Math.floor(worldMap.width / 5);
    const homeHeight = Math.floor(worldMap.height / 5);
    
    const minX = Math.max(1, homeX * homeWidth + 2);
    const maxX = Math.min(worldMap.width - 2, (homeX + 1) * homeWidth - 2);
    const minY = Math.max(1, homeY * homeHeight + 2);
    const maxY = Math.min(worldMap.height - 2, (homeY + 1) * homeHeight - 2);
    
    // 在家区域内随机选择位置
    const x = Math.floor(minX + Math.random() * (maxX - minX));
    const y = Math.floor(minY + Math.random() * (maxY - minY));
    
    console.log(`代理 ${agentId} 返回了家区域 (${homeX},${homeY}): (${x}, ${y})`);
    return { x, y };
  }
}
