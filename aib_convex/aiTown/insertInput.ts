import { MutationCtx } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { engineInsertInput } from '../engine/abstractGame';
import { InputNames, InputArgs } from './inputs';

export const insertInput = async <Name extends InputNames>(
  ctx: MutationCtx,
  worldId: Id<'worlds'>,
  name: Name,
  args: InputArgs<Name> & {
    descriptionIndex?: number;
    name?: string;
    identity?: string;
    plan?: string;
  },
): Promise<Id<'inputs'>> => {
  const worldStatus = await ctx.db
    .query('worldStatus')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .unique();
  if (!worldStatus) {
    throw new Error(`World for engine ${worldId} not found`);
  }
  return await engineInsertInput(ctx, worldStatus.engineId, name, args);
};
