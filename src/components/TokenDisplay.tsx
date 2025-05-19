import { Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

// TokenDisplay component, used to display AIB token data in the game interface
export const TokenDisplay = ({ 
  tokenData, 
  x, 
  y
}: {
  tokenData: { 
    name?: string;
    aibtoken?: number | undefined; 
    ethAddress?: string | undefined;
    isWorking?: boolean | undefined; 
  } | null | undefined;
  x: number;
  y: number;
}) => {
  // If no data, don't display anything
  if (!tokenData) return null;
  
  const { name, aibtoken, isWorking } = tokenData;
  
  // Format token amount, keep 4 decimal places
  const formattedToken = typeof aibtoken === 'number' 
    ? aibtoken.toFixed(4) 
    : '0.0000';
  
  // Display text - if there's a character name, show the name
  const displayText = name 
    ? `${name}: ${formattedToken} AIB` 
    : `AIB token: ${formattedToken}`;
  
  return (
    <Container x={x} y={y} sortableChildren={true} zIndex={1000}>
      {/* Background */}
      <Graphics
        draw={(g) => {
          g.clear();
          g.beginFill(0x000000, 0.7);
          // Calculate text width to fit background
          const width = displayText.length * 8 + 20;
          const height = 30;
          g.drawRoundedRect(0, 0, width, height, 5);
          g.endFill();
        }}
      />
      
      {/* Token amount text */}
      <Text
        text={displayText}
        x={10}
        y={7}
        style={new PIXI.TextStyle({
          fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontSize: 16,
          fontWeight: 'bold',
          fill: isWorking ? 0x4ADE80 : 0xFFFFFF, // Green when working, otherwise white
          align: 'left'
        })}
      />
      
      {/* If working, display work status indicator */}
      {isWorking && (
        <Graphics
          draw={(g) => {
            g.clear();
            g.beginFill(0x4ADE80); // Green
            g.drawCircle(displayText.length * 7.5 + 15, 15, 5);
            g.endFill();
          }}
        />
      )}
    </Container>
  );
}; 