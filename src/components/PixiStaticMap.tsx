import { PixiComponent, applyDefaultProps } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { AnimatedSprite, WorldMap } from '../../convex/aiTown/worldMap';
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';

const animations = {
  'campfire.json': { spritesheet: campfire, url: '/assets/spritesheets/campfire.png' },
  'gentlesparkle.json': {
    spritesheet: gentlesparkle,
    url: '/assets/spritesheets/gentlesparkle32.png',
  },
  'gentlewaterfall.json': {
    spritesheet: gentlewaterfall,
    url: '/assets/spritesheets/gentlewaterfall32.png',
  },
  'windmill.json': { spritesheet: windmill, url: '/assets/spritesheets/windmill.png' },
  'gentlesplash.json': { spritesheet: gentlesplash,
    url: '/assets/spritesheets/gentlewaterfall32.png',},
};

export const PixiStaticMap = PixiComponent('StaticMap', {
  create: (props: { map: WorldMap; [k: string]: any }) => {
    const map = props.map;
    const numxtiles = Math.floor(map.tileSetDimX / map.tileDim);
    const numytiles = Math.floor(map.tileSetDimY / map.tileDim);
    const bt = PIXI.BaseTexture.from(map.tileSetUrl, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });

    const tiles = [];
    for (let x = 0; x < numxtiles; x++) {
      for (let y = 0; y < numytiles; y++) {
        tiles[x + y * numxtiles] = new PIXI.Texture(
          bt,
          new PIXI.Rectangle(x * map.tileDim, y * map.tileDim, map.tileDim, map.tileDim),
        );
      }
    }
    const screenxtiles = map.bgTiles[0].length;
    const screenytiles = map.bgTiles[0][0].length;

    const container = new PIXI.Container();
    const allLayers = [...map.bgTiles, ...map.objectTiles];

    // blit bg & object layers of map onto canvas
    for (let i = 0; i < screenxtiles * screenytiles; i++) {
      const x = i % screenxtiles;
      const y = Math.floor(i / screenxtiles);
      const xPx = x * map.tileDim;
      const yPx = y * map.tileDim;

      // Add all layers of backgrounds.
      for (const layer of allLayers) {
        const tileIndex = layer[x][y];
        // Some layers may not have tiles at this location.
        if (tileIndex === -1) continue;
        
        // tiled uses special encoding to store rotation and flip information
        // 32nd bit (highest bit): horizontal flip flag
        // 31st bit: vertical flip flag
        // 30th bit: diagonal flip flag
        // 1-29th bits: actual tile ID
        const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
        const FLIPPED_VERTICALLY_FLAG   = 0x40000000;
        const FLIPPED_DIAGONALLY_FLAG   = 0x20000000;
        
        let actualTileIndex = tileIndex;
        
        // extract actual tile ID (remove rotation/flip flags)
        const flippedHorizontally = (tileIndex & FLIPPED_HORIZONTALLY_FLAG) !== 0;
        const flippedVertically = (tileIndex & FLIPPED_VERTICALLY_FLAG) !== 0;
        const flippedDiagonally = (tileIndex & FLIPPED_DIAGONALLY_FLAG) !== 0;
        
        // remove rotation/flip flags, get actual tile ID
        actualTileIndex = tileIndex & ~(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG);
        
        // ensure tile ID is within valid range
        if (actualTileIndex >= tiles.length) {
          console.warn(`tile index out of range: ${actualTileIndex}, original value: ${tileIndex}`);
          continue;
        }
        
        const ctile = new PIXI.Sprite(tiles[actualTileIndex]);
        ctile.x = xPx;
        ctile.y = yPx;
        
        // return to the simplest and most direct method
        // based on the rotation and flip flags in the Tiled official documentation
        
        // print debug information to help understand specific rotation combinations
        if (flippedHorizontally || flippedVertically || flippedDiagonally) {
          console.log(`tile ID: ${actualTileIndex}, H:${flippedHorizontally}, V:${flippedVertically}, D:${flippedDiagonally}`);
        }
        
        // implement the rotation behavior of the Tiled tile editor
        // first handle diagonal flip (equivalent to 90 degree rotation and possible flip)
        if (flippedDiagonally) {
          if (flippedHorizontally && flippedVertically) {
            // D+H+V: diagonal + horizontal + vertical
            ctile.anchor.set(0, 0);
            ctile.rotation = -Math.PI / 2; // change to -90 degrees
            ctile.scale.x = -1;
            ctile.scale.y = -1;
            ctile.x = xPx;
            ctile.y = yPx + map.tileDim;
          } else if (flippedHorizontally) {
            // D+H: diagonal + horizontal
            ctile.anchor.set(0, 0);
            ctile.rotation = Math.PI / 2; // change to 90 degrees
            ctile.x = xPx + map.tileDim;
            ctile.y = yPx;
          } else if (flippedVertically) {
            // D+V: diagonal + vertical
            ctile.anchor.set(0, 0);
            ctile.rotation = -Math.PI / 2; // change to -90 degrees
            ctile.x = xPx;
            ctile.y = yPx + map.tileDim;
          } else {
            // only D: diagonal flip
            ctile.anchor.set(0, 0);
            ctile.rotation = -Math.PI / 2; // change to -90 degrees
            ctile.x = xPx;
            ctile.y = yPx + map.tileDim;
          }
        } else {
          // no diagonal flip, only handle simple horizontal/vertical flip
          if (flippedHorizontally && flippedVertically) {
            // H+V: horizontal + vertical (180 degree rotation)
            ctile.anchor.set(0, 0);
            ctile.scale.x = -1;
            ctile.scale.y = -1;
            ctile.x = xPx + map.tileDim;
            ctile.y = yPx + map.tileDim;
          } else if (flippedHorizontally) {
            // only H: horizontal flip
            ctile.anchor.set(0, 0);
            ctile.scale.x = -1;
            ctile.x = xPx + map.tileDim;
          } else if (flippedVertically) {
            // only V: vertical flip
            ctile.anchor.set(0, 0);
            ctile.scale.y = -1;
            ctile.y = yPx + map.tileDim;
          }
        }
        
        container.addChild(ctile);
      }
    }

    // TODO: Add layers.
    const spritesBySheet = new Map<string, AnimatedSprite[]>();
    for (const sprite of map.animatedSprites) {
      const sheet = sprite.sheet;
      if (!spritesBySheet.has(sheet)) {
        spritesBySheet.set(sheet, []);
      }
      spritesBySheet.get(sheet)!.push(sprite);
    }
    for (const [sheet, sprites] of spritesBySheet.entries()) {
      const animation = (animations as any)[sheet];
      if (!animation) {
        console.error('Could not find animation', sheet);
        continue;
      }
      const { spritesheet, url } = animation;
      const texture = PIXI.BaseTexture.from(url, {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      const spriteSheet = new PIXI.Spritesheet(texture, spritesheet);
      spriteSheet.parse().then(() => {
        for (const sprite of sprites) {
          const pixiAnimation = spriteSheet.animations[sprite.animation];
          if (!pixiAnimation) {
            console.error('Failed to load animation', sprite);
            continue;
          }
          const pixiSprite = new PIXI.AnimatedSprite(pixiAnimation);
          pixiSprite.animationSpeed = 0.1;
          pixiSprite.autoUpdate = true;
          pixiSprite.x = sprite.x;
          pixiSprite.y = sprite.y;
          pixiSprite.width = sprite.w;
          pixiSprite.height = sprite.h;
          container.addChild(pixiSprite);
          pixiSprite.play();
        }
      });
    }

    container.x = 0;
    container.y = 0;

    // Set the hit area manually to ensure `pointerdown` events are delivered to this container.
    container.interactive = true;
    container.hitArea = new PIXI.Rectangle(
      0,
      0,
      screenxtiles * map.tileDim,
      screenytiles * map.tileDim,
    );

    return container;
  },

  applyProps: (instance, oldProps, newProps) => {
    applyDefaultProps(instance, oldProps, newProps);
  },
});
