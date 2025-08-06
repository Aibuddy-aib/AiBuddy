import * as PIXI from 'pixi.js';
import { useApp } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
import { useEffect, useRef, useState } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { DebugPath } from './DebugPath.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';
import { TokenDisplay } from './TokenDisplay.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';

type PixiGameProps = {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  setSelectedElement: SelectElement;
  userAddress?: string | null;
};

export const PixiGame = (props: PixiGameProps) => {
  const pixiApp = useApp();
  // PIXI setup.
  const viewportRef = useRef<Viewport | undefined>();

  // Add viewport info state
  const [viewportInfo, setViewportInfo] = useState({
    center: { x: 0, y: 0 },
    width: props.width,
    height: props.height,
    scale: 1,
    isInViewport: (x: number, y: number): boolean => true // 改为返回boolean类型
  });

  // Update when viewport moves or zooms
  useEffect(() => {
    const updateViewportInfo = () => {
      if (viewportRef.current) {
        // Get viewport center position and zoom
        const center = {
          x: viewportRef.current.center.x / props.game.worldMap.tileDim,
          y: viewportRef.current.center.y / props.game.worldMap.tileDim,
        };
        const scale = viewportRef.current.scale.x;
        
        // Create function to determine if an element is in the viewport
        const isInViewport = (x: number, y: number): boolean => {
          const buffer = 300 / scale; // Buffer area adjusts with zoom
          const halfWidth = (props.width / 2) / scale;
          const halfHeight = (props.height / 2) / scale;
          
          // Check if within the visible area
          return (
            Math.abs(x - center.x) < halfWidth + buffer &&
            Math.abs(y - center.y) < halfHeight + buffer
          );
        };
        
        setViewportInfo({
          center,
          width: props.width,
          height: props.height,
          scale,
          isInViewport
        });
      }
    };

    // Initial update
    updateViewportInfo();
    
    // Update when viewport moves or zooms
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.on('moved', updateViewportInfo);
      viewport.on('zoomed', updateViewportInfo);
    }
    
    return () => {
      if (viewport) {
        viewport.off('moved', updateViewportInfo);
        viewport.off('zoomed', updateViewportInfo);
      }
    };
  }, [props.width, props.height, viewportRef.current]);

  // Save the ID and token data of the currently selected character
  const [selectedPlayerData, setSelectedPlayerData] = useState<{
    id: GameId<'players'>;
    name: string;
    aibtoken?: number;
    isWorking?: boolean;
  } | null>(null);

  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId: props.worldId }) ?? null;
  const humanPlayerId = [...props.game.world.players.values()].find(
    (p) => p.human === humanTokenIdentifier,
  )?.id;
  
  // Get AIB token data for the human player
  const playerTokens = useQuery(api.world.getPlayerTokens, { worldId: props.worldId });

  // Custom handler for character click events
  const handlePlayerClick = (element?: { kind: 'player'; id: GameId<'players'> }) => {
    console.log("PixiGame: handlePlayerClick called with parameter:", element);
    
    // Pass the click event to the original setSelectedElement
    props.setSelectedElement(element);
    console.log("PixiGame: props.setSelectedElement has been called");
    
    // If a character was clicked, get and set the token data for that character
    if (element?.kind === 'player') {
      const player = props.game.world.players.get(element.id);
      if (player) {
        const playerName = props.game.playerDescriptions.get(element.id)?.name || 'Unknown';
        setSelectedPlayerData({
          id: element.id,
          name: playerName,
          aibtoken: player.aibtoken,
          isWorking: player.isWorking
        });
        console.log("PixiGame: selectedPlayerData has been set:", playerName);
      }
    } else {
      // If no element was passed or the element is not a player, clear the selection
      setSelectedPlayerData(null);
      console.log("PixiGame: selectedPlayerData has been cleared");
    }
  };

  // Interaction for clicking on the world to navigate.
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
    // https://pixijs.download/dev/docs/PIXI.FederatedPointerEvent.html
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
  };

  const { width, height, tileDim } = props.game.worldMap;
  const players = [...props.game.world.players.values()];

  // Zoom on the user's avatar when it is created
  useEffect(() => {
    if (!viewportRef.current || humanPlayerId === undefined) return;

    const humanPlayer = props.game.world.players.get(humanPlayerId)!;
    viewportRef.current.animate({
      position: new PIXI.Point(humanPlayer.position.x * tileDim, humanPlayer.position.y * tileDim),
      scale: 3.0, // Set initial zoom level to a 3.0
      time: 1000, // Add smooth transition animation time
    });
  }, [humanPlayerId]);

  // Decide which token data to display: if a character is selected, show theirs; otherwise show current player's
  const displayTokenData = selectedPlayerData 
    ? {
        name: selectedPlayerData.name,
        aibtoken: selectedPlayerData.aibtoken,
        isWorking: selectedPlayerData.isWorking
      }
    : playerTokens;

  return (
    <>
      {/* AIB token display - absolutely positioned in the top left corner of the viewport */}
      <TokenDisplay 
        tokenData={displayTokenData} 
        x={20} 
        y={20}
      />
      
      <PixiViewport
        app={pixiApp}
        screenWidth={props.width}
        screenHeight={props.height}
        worldWidth={width * tileDim}
        worldHeight={height * tileDim}
        viewportRef={viewportRef}
      >
        <PixiStaticMap
          map={props.game.worldMap}
          onpointerup={onMapPointerUp}
          onpointerdown={onMapPointerDown}
        />
        {players.map(
          (p) =>
            // Only show the path for the human player in non-debug mode.
            (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
              <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
            ),
        )}
        {players.map((p) => (
          <Player
            key={`player-${p.id}`}
            game={props.game}
            player={p}
            isViewer={p.id === humanPlayerId}
            onClick={handlePlayerClick}
            historicalTime={props.historicalTime}
            userAddress={props.userAddress}
            viewportInfo={viewportInfo}
          />
        ))}
      </PixiViewport>
    </>
  );
};
export default PixiGame;
