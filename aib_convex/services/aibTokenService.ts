import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { Player } from "../aiTown/player";

/**
 * AIBTokenService - 统一管理AIB代币的服务
 * 所有关于AIB代币的操作都应该通过此服务处理，确保数据一致性
 */
export class AIBTokenService {
  /**
   * 获取玩家的AIB代币余额
   */
  static getBalance(player: Player): number {
    return player.aibtoken ?? 0;
  }

  /**
   * 设置玩家的AIB代币余额
   */
  static async setBalance(
    ctx: MutationCtx,
    worldId: Id<"worlds">,
    playerId: string,
    amount: number
  ): Promise<void> {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error(`World ${worldId} not found`);

    const updatedPlayers = world.players.map(player => {
      if (player.id === playerId) {
        return { ...player, aibtoken: amount };
      }
      return player;
    });

    await ctx.db.patch(worldId, { players: updatedPlayers });
  }

  /**
   * 增加玩家的AIB代币
   */
  static async addTokens(
    ctx: MutationCtx,
    worldId: Id<"worlds">,
    playerId: string,
    amount: number
  ): Promise<void> {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error(`World ${worldId} not found`);

    const player = world.players.find(p => p.id === playerId);
    if (!player) throw new Error(`Player ${playerId} not found in world ${worldId}`);

    const currentBalance = player.aibtoken ?? 0;
    await this.setBalance(ctx, worldId, playerId, currentBalance + amount);
  }

  /**
   * 减少玩家的AIB代币
   */
  static async subtractTokens(
    ctx: MutationCtx,
    worldId: Id<"worlds">,
    playerId: string,
    amount: number
  ): Promise<void> {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error(`World ${worldId} not found`);

    const player = world.players.find(p => p.id === playerId);
    if (!player) throw new Error(`Player ${playerId} not found in world ${worldId}`);

    const currentBalance = player.aibtoken ?? 0;
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance: ${currentBalance} < ${amount}`);
    }

    await this.setBalance(ctx, worldId, playerId, currentBalance - amount);
  }

  /**
   * 检查玩家是否有足够的代币
   */
  static async hasEnoughTokens(
    ctx: QueryCtx,
    worldId: Id<"worlds">,
    playerId: string,
    amount: number
  ): Promise<boolean> {
    const world = await ctx.db.get(worldId);
    if (!world) return false;

    const player = world.players.find(p => p.id === playerId);
    if (!player) return false;

    return (player.aibtoken ?? 0) >= amount;
  }

  /**
   * 在两个玩家之间转移代币
   */
  static async transferTokens(
    ctx: MutationCtx,
    worldId: Id<"worlds">,
    fromPlayerId: string,
    toPlayerId: string,
    amount: number
  ): Promise<void> {
    await this.subtractTokens(ctx, worldId, fromPlayerId, amount);
    await this.addTokens(ctx, worldId, toPlayerId, amount);
  }
} 