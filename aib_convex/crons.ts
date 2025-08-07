import { cronJobs } from 'convex/server';
import { DELETE_BATCH_SIZE, VACUUM_MAX_AGE } from './constants';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { TableNames } from './_generated/dataModel';
import { v } from 'convex/values';


const crons = cronJobs();

// Disabled inactive world check to keep worlds always running
// crons.interval(
//   'stop inactive worlds',
//   { seconds: IDLE_WORLD_TIMEOUT / 1000 },
//   internal.world.stopInactiveWorlds,
// );

crons.interval('restart dead worlds', { seconds: 60 }, internal.world.restartDeadWorlds);

// check world status is not needed
// crons.interval('check world status', { minutes: 5 }, internal.worldManager.checkWorldStatus);

crons.daily('vacuum old entries', { hourUTC: 4, minuteUTC: 20 }, internal.crons.vacuumOldEntries);

export default crons;

const TablesToVacuum: TableNames[] = [
  // Un-comment this to also clean out old conversations.
  // 'conversationMembers', 'conversations', 'messages',

  // Inputs aren't useful unless you're trying to replay history.
  // If you want to support that, you should add a snapshot table, so you can
  // replay from a certain time period. Or stop vacuuming inputs and replay from
  // the beginning of time
  'inputs',

  // We can keep memories without their embeddings for inspection, but we won't
  // retrieve them when searching memories via vector search.
  'memories',
  // We can vacuum fewer tables without serious consequences, but the only
  // one that will cause issues over time is having >>100k vectors.
  'memoryEmbeddings',
];

export const vacuumOldEntries = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    const before = Date.now() - VACUUM_MAX_AGE;
    for (const tableName of TablesToVacuum) {
      console.log(`Checking ${tableName}...`);
      const exists = await ctx.db
        .query(tableName)
        .withIndex('by_creation_time', (q) => q.lt('_creationTime', before))
        .first();
      if (exists) {
        console.log(`Vacuuming ${tableName}...`);
        await ctx.scheduler.runAfter(0, internal.crons.vacuumTable, {
          tableName,
          before,
          cursor: null,
          soFar: 0,
        });
      }
    }
  },
});

export const vacuumTable = internalMutation({
  args: {
    tableName: v.string(),
    before: v.number(),
    cursor: v.union(v.string(), v.null()),
    soFar: v.number(),
  },
  handler: async (ctx, { tableName, before, cursor, soFar }) => {
    const results = await ctx.db
      .query(tableName as TableNames)
      .withIndex('by_creation_time', (q) => q.lt('_creationTime', before))
      .paginate({ cursor, numItems: DELETE_BATCH_SIZE });
    for (const row of results.page) {
      await ctx.db.delete(row._id);
    }
    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.crons.vacuumTable, {
        tableName,
        before,
        soFar: results.page.length + soFar,
        cursor: results.continueCursor,
      });
    } else {
      console.log(`Vacuumed ${soFar + results.page.length} entries from ${tableName}`);
    }
  },
});

// delete old inputs by timestamp
export const cleanupInputsByTimestamp = internalMutation({
  args: {
    cutoffTimestamp: v.number(),
    batchSize: v.number(),
    deleted: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { cutoffTimestamp, batchSize, deleted, cursor }) => {
    console.log(`Querying records older than ${new Date(cutoffTimestamp).toISOString()}, batch size: ${batchSize}`);
    
    try {
      // query a batch of records older than the cutoff timestamp
      const results = await ctx.db
        .query("inputs")
        .withIndex('by_creation_time', q => q.lt('_creationTime', cutoffTimestamp))
        .paginate({ cursor, numItems: batchSize });
      
      console.log(`Got ${results.page.length} records to delete in this batch`);
      
      // delete each record
      let deletedThisBatch = 0;
      for (const row of results.page) {
        try {
          await ctx.db.delete(row._id);
          deletedThisBatch++;
        } catch (error: any) {
          console.log(`Delete record ${row._id.toString().substring(0, 8)}... failed, skip this record`);
        }
      }
      
      const newDeleted = deleted + deletedThisBatch;
      console.log(`Successfully deleted ${newDeleted} records`);
      
      // if there are more records, continue to process the next batch
      if (!results.isDone) {
        await ctx.scheduler.runAfter(0, internal.crons.cleanupInputsByTimestamp, {
          cutoffTimestamp,
          batchSize,
          deleted: newDeleted,
          cursor: results.continueCursor,
        });
      }
      
      return { 
        deleted: newDeleted,
        done: results.isDone
      };
    } catch (error: any) {
      console.error("Failed to clean up inputs records:", error);
      return { deleted, error: String(error) };
    }
  },
});

// keep only the most recent inputs, delete old records
export const cleanupInputsKeepRecent = internalMutation({
  args: {},
  handler: async (ctx) => {
    // keep the number of recent records
    const keepRecentCount = 20;
    const batchSize = 50;
    
    try {
      // count total number of records
      const allRecords = await ctx.db.query("inputs").collect();
      const totalCount = allRecords.length;
    
      console.log(`There are ${totalCount} records in the inputs table, will keep the latest ${keepRecentCount} records`);
    
      if (totalCount <= keepRecentCount) {
        console.log("Record count does not exceed the retention limit, no need to clean up");
        return { deleted: 0 };
    }
    
      // get records in descending order of creation time, skip the number of records to keep
      const recordsToKeep = await ctx.db
      .query("inputs")
        .order("desc")
        .take(keepRecentCount);
    
      // if there are no records to keep, return immediately
      if (recordsToKeep.length === 0) {
        console.log("No records to keep, stop cleanup");
        return { deleted: 0 };
    }
    
      // get the timestamp of the oldest record to keep
      const oldestToKeep = recordsToKeep[recordsToKeep.length - 1]._creationTime;
    
      // start the batch deletion process
      console.log(`Will delete records created before ${new Date(oldestToKeep).toISOString()}`);
    await ctx.scheduler.runAfter(0, internal.crons.cleanupInputsByTimestamp, {
        cutoffTimestamp: oldestToKeep,
        batchSize,
      deleted: 0,
        cursor: null,
    });
      
      return { started: true };
    } catch (error: any) {
      console.error("Failed to start cleanup process:", error);
      return { error: String(error) };
    }
  }
});