import { mutation } from './_generated/server';
import * as map from '../data/NewMap';

// add update map function
export default mutation({
  handler: async (ctx) => {
    // find default world
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .unique();
    
    if (!worldStatus) {
      throw new Error("Default world not found, please run init");
    }

    // find existing map
    const existingMap = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();
    
    console.log("Map data structure:", map.grass1);
    console.log("Tile path:", map.tilesetpath);
    console.log("Tile size:", map.tilesetpxw, map.tilesetpxh);
    
    // ensure extracting 2D array
    // we know grass1 is [[[...]]] structure, so take the first element
    const grassLayer = map.grass1[0]; 
    const qiangLayer = map.road2[0];
    const roadLayer = map.house3[0];
    const houseLayer = map.house4[0];
    const treeLayer = map.tree5[0];
    const tree6Layer = map.tree6[0];

    // fix path, ensure the referenced image can be loaded correctly
    const tilesetUrl = map.tilesetpath.startsWith("/") ? map.tilesetpath : "/assets/NewMap.png";
    
    if (existingMap) {
      // update existing map
      await ctx.db.patch(existingMap._id, {
        width: map.screenxtiles,
        height: map.screenytiles,
        tileSetUrl: tilesetUrl,
        tileSetDimX: map.tilesetpxw,
        tileSetDimY: map.tilesetpxh > 144 ? map.tilesetpxh : 1440, // ensure height is correct
        tileDim: map.tiledim,
        bgTiles: [grassLayer], // as background layer
        objectTiles: [qiangLayer, roadLayer, houseLayer, treeLayer, tree6Layer], // as object layer
        animatedSprites: [],
      });
      return { success: true, message: "Map updated" };
    } else {
      // if no map is found, create a new map
      await ctx.db.insert('maps', {
        worldId: worldStatus.worldId,
        width: map.screenxtiles,
        height: map.screenytiles,
        tileSetUrl: tilesetUrl,
        tileSetDimX: map.tilesetpxw,
        tileSetDimY: map.tilesetpxh > 144 ? map.tilesetpxh : 1440, // ensure height is correct
        tileDim: map.tiledim,
        bgTiles: [grassLayer], // as background layer
        objectTiles: [qiangLayer, roadLayer, houseLayer, treeLayer], // as object layer
        animatedSprites: [],
      });
      return { success: true, message: "New map created" };
    }
  },
}); 