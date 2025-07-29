import { FieldConfig } from '../engine/historicalObject';
import { Player } from './player';
import { WorldMap } from './worldMap';
import { Point } from '../util/types';

export type Location = {
  // Unpacked player position.
  x: number;
  y: number;

  // Normalized facing vector.
  dx: number;
  dy: number;

  speed: number;
};

export const locationFields: FieldConfig = [
  { name: 'x', precision: 8 },
  { name: 'y', precision: 8 },
  { name: 'dx', precision: 8 },
  { name: 'dy', precision: 8 },
  { name: 'speed', precision: 16 },
];

export function playerLocation(player: Player): Location {
  return {
    x: player.position.x,
    y: player.position.y,
    dx: player.facing.dx,
    dy: player.facing.dy,
    speed: player.speed,
  };
}

// enhanced random destination selector, greatly promote character dispersion
export function getRandomDestination(worldMap: WorldMap, id: string): Point {
  // parse agent ID as number, used as random seed
  const IdNum = parseInt(id.split("_")[1] || "0", 10) || 0;
  
  // random decision on behavior type - increase the weight of dispersion behavior
  const behaviorRoll = Math.random();
  
  // increase the chance of strong dispersion behavior to 85%
  if (behaviorRoll < 0.85) {
    // strong dispersion strategy
    const distanceStrategy = Math.random();
    
    // select map corner position (35% probability)
    if (distanceStrategy < 0.35) {
      // to ensure maximum dispersion effect, select map corners
      const farCorners = [
        { x: 2 + Math.floor(Math.random() * 3), y: 2 + Math.floor(Math.random() * 3) },
        { x: 2 + Math.floor(Math.random() * 3), y: worldMap.height - 5 + Math.floor(Math.random() * 3) },
        { x: worldMap.width - 5 + Math.floor(Math.random() * 3), y: 2 + Math.floor(Math.random() * 3) },
        { x: worldMap.width - 5 + Math.floor(Math.random() * 3), y: worldMap.height - 5 + Math.floor(Math.random() * 3) }
      ];
      
      // use agent ID to determine the preferred corner
      // this ensures that the same character always tends to go to the same corner, while different characters go to different corners
      const preferredCornerIndex = IdNum % 4;
      // but there is still a 30% chance to go to other corners, increase randomness
      const cornerIndex = Math.random() < 0.7 ? preferredCornerIndex : Math.floor(Math.random() * 4);
      
      // randomly select a position near the selected corner, increase random offset
      const corner = farCorners[cornerIndex];
      const offsetX = Math.floor(Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1);
      const offsetY = Math.floor(Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1);
      
      const x = Math.max(1, Math.min(worldMap.width - 2, corner.x + offsetX));
      const y = Math.max(1, Math.min(worldMap.height - 2, corner.y + offsetY));
      
      return { x, y };
    }
    
    // select map edge (30% probability)
    else if (distanceStrategy < 0.65) {
      // use agent ID to determine the preferred edge
      const preferredSide = IdNum % 4;
      // but there is still a 20% chance to go to other edges
      const chooseSide = Math.random() < 0.8 ? preferredSide : Math.floor(Math.random() * 4);
      
      let x, y;
      
      if (chooseSide === 0) {
        // top edge - distance from edge 1-3 tiles, avoid completely touching the edge
        x = 3 + Math.floor(Math.random() * (worldMap.width - 6));
        y = 2 + Math.floor(Math.random() * 3);
      } else if (chooseSide === 1) {
        // right edge
        x = worldMap.width - 5 + Math.floor(Math.random() * 3);
        y = 3 + Math.floor(Math.random() * (worldMap.height - 6));
      } else if (chooseSide === 2) {
        // bottom edge
        x = 3 + Math.floor(Math.random() * (worldMap.width - 6));
        y = worldMap.height - 5 + Math.floor(Math.random() * 3);
      } else {
        // left edge
        x = 2 + Math.floor(Math.random() * 3);
        y = 3 + Math.floor(Math.random() * (worldMap.height - 6));
      }
      
      // increase random offset, avoid characters all staying on the same line
      const offsetX = Math.floor(Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1);
      const offsetY = Math.floor(Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1);
      
      x = Math.max(1, Math.min(worldMap.width - 2, x + offsetX));
      y = Math.max(1, Math.min(worldMap.height - 2, y + offsetY));
      
      return { x, y };
    }
    
    // select exclusive area (35% probability) - this is the strongest dispersion strategy
    else {
      // divide the map into more and more fine areas, increase dispersion
      const gridSize = 15; // increase to 15x15 grid
      
      // use agent ID to determine a fixed unique area
      // use prime number 17 as multiplier to increase pseudo-randomness
      const uniqueAreaIndex = (IdNum * 17) % (gridSize * gridSize);
      const areaX = uniqueAreaIndex % gridSize;
      const areaY = Math.floor(uniqueAreaIndex / gridSize);
      
      // calculate the boundaries of the area
      const cellWidth = Math.floor(worldMap.width / gridSize);
      const cellHeight = Math.floor(worldMap.height / gridSize);
      
      // calculate the boundaries of the area, more precise than the previous version
      const minX = Math.max(1, areaX * cellWidth);
      const maxX = Math.min(worldMap.width - 2, (areaX + 1) * cellWidth - 1);
      const minY = Math.max(1, areaY * cellHeight);
      const maxY = Math.min(worldMap.height - 2, (areaY + 1) * cellHeight - 1);
      
      // to avoid characters gathering in the center of the area, use uniform random distribution
      const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
      const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
      
      return { x, y };
    }
  }
  
  // occasionally wander (10% probability)
  else if (behaviorRoll < 0.95) {
    // avoid selecting the center of the map (usually where people gather)
    // instead, select a random position at a medium distance
    
    // determine the four quadrants of the map
    const quadrants = [
      { minX: 1, maxX: worldMap.width / 2 - 1, minY: 1, maxY: worldMap.height / 2 - 1 },
      { minX: worldMap.width / 2, maxX: worldMap.width - 2, minY: 1, maxY: worldMap.height / 2 - 1 },
      { minX: 1, maxX: worldMap.width / 2 - 1, minY: worldMap.height / 2, maxY: worldMap.height - 2 },
      { minX: worldMap.width / 2, maxX: worldMap.width - 2, minY: worldMap.height / 2, maxY: worldMap.height - 2 }
    ];
    
    // select a quadrant, use agent ID to increase preference
    const quadrantIndex = (IdNum + Math.floor(Math.random() * 2)) % 4;
    const quadrant = quadrants[quadrantIndex];
    
    // randomly select a position in the quadrant
    const x = Math.floor(quadrant.minX + Math.random() * (quadrant.maxX - quadrant.minX));
    const y = Math.floor(quadrant.minY + Math.random() * (quadrant.maxY - quadrant.minY));
    
    return { x, y };
  }
  
  // rarely return to their "home" area (5% probability)
  else {
    // each agent has a fixed "home" area
    // use agent ID to determine a fixed area
    const homeX = (IdNum * 7) % 5; // divide the map into 5 horizontal areas
    const homeY = (IdNum * 11) % 5; // divide the map into 5 vertical areas
    
    // calculate the boundaries of the home area
    const homeWidth = Math.floor(worldMap.width / 5);
    const homeHeight = Math.floor(worldMap.height / 5);
    
    const minX = Math.max(1, homeX * homeWidth + 2);
    const maxX = Math.min(worldMap.width - 2, (homeX + 1) * homeWidth - 2);
    const minY = Math.max(1, homeY * homeHeight + 2);
    const maxY = Math.min(worldMap.height - 2, (homeY + 1) * homeHeight - 2);
    
    // randomly select a position in the home area
    const x = Math.floor(minX + Math.random() * (maxX - minX));
    const y = Math.floor(minY + Math.random() * (maxY - minY));
    
    return { x, y };
  }
}