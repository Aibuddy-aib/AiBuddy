import { mutation } from './_generated/server';
import { kickEngine } from './aiTown/main';

const initPositions = mutation({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    
    if (!worldStatus) {
      throw new Error('Default world not found');
    }
    
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) {
      throw new Error(`World not found: ${worldStatus.worldId}`);
    }
    
    const worldMap = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .first();
    if (!worldMap) {
      throw new Error(`World map not found: ${worldStatus.worldId}`);
    }
    
    const mapWidth = worldMap.width;
    const mapHeight = worldMap.height;
    
    const updatedPlayers = [...world.players];
    
    const playerCount = updatedPlayers.length;
    console.log(`Randomly assigning positions for ${playerCount} characters`);
    
    const occupiedPositions = new Set();
    
    const facings = [
      { dx: 1, dy: 0 },  // right
      { dx: -1, dy: 0 }, // left
      { dx: 0, dy: 1 },  // down
      { dx: 0, dy: -1 }  // up
    ];
    
    // randomly assign positions for each character
    for (let i = 0; i < playerCount; i++) {
      let x, y;
      let positionKey;
      let attempts = 0;
      const maxAttempts = 100;
      
      // try to find an unused position
      do {
        x = Math.floor(Math.random() * mapWidth);
        y = Math.floor(Math.random() * mapHeight);
        positionKey = `${x},${y}`;
        attempts++;
        
        // if we've tried too many times and still can't find a position, we'll use an overlapping position
        if (attempts > maxAttempts) {
          console.warn(`Tried ${maxAttempts} times to find an empty position for character ${i}, will use overlapping position`);
          break;
        }
      } while (occupiedPositions.has(positionKey));
      
      // mark this position as occupied
      occupiedPositions.add(positionKey);
      
      // update player position
      updatedPlayers[i].position = { x, y };
      
      // random facing
      updatedPlayers[i].facing = facings[Math.floor(Math.random() * facings.length)];
      
      // reset speed and pathfinding
      updatedPlayers[i].speed = 0;
      updatedPlayers[i].pathfinding = undefined;
      
      console.log(`Character ${i+1}/${playerCount} position set to (${x}, ${y})`);
    }
    
    // update players in the world
    await ctx.db.patch(worldStatus.worldId, {
      players: updatedPlayers
    });
    
    // restart engine to make the position updates take effect
    await kickEngine(ctx, worldStatus.worldId);
    
    return { 
      success: true, 
      message: `Successfully initialized random positions for ${playerCount} characters` 
    };
  },
});

export default initPositions; 