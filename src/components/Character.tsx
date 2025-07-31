import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatedSprite, Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

// Cache loaded spritesheets
const spritesheetCache = new Map<string, Spritesheet>();

export const Character = ({
  textureUrl,
  spritesheetData,
  x,
  y,
  orientation,
  isMoving = false,
  isThinking = false,
  isSpeaking = false,
  emoji = '',
  isViewer = false,
  speed = 0.1,
  lastMessage,
  characterName = '',
  // aibtoken,
  onClick,
  activity,
  isCurrentUser = false,
  // ethAddress = '',
  viewportInfo,
  isWorking,
}: {
  // Path to the texture packed image.
  textureUrl: string;
  // The data for the spritesheet.
  spritesheetData: ISpritesheetData;
  // The pose of the NPC.
  x: number;
  y: number;
  orientation: number;
  isMoving?: boolean;
  // Shows a thought bubble if true.
  isThinking?: boolean;
  // Shows a speech bubble if true.
  isSpeaking?: boolean;
  emoji?: string;
  // Highlights the player.
  isViewer?: boolean;
  // The speed of the animation. Can be tuned depending on the side and speed of the NPC.
  speed?: number;
  lastMessage?: string;
  characterName?: string;
  aibtoken?: number;
  activity?: { description: string; emoji?: string; until: number; style?: { background?: string; color?: string } };
  isCurrentUser?: boolean;
  ethAddress?: string;
  onClick: () => void;
  viewportInfo: any;
  isWorking?: boolean;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  // const lastRenderTime = useRef(0);
  
  useEffect(() => {
    const parseSheet = async () => {
      // Create cache key
      const cacheKey = `${textureUrl}_${JSON.stringify(spritesheetData)}`;
      
      // Check cache
      if (spritesheetCache.has(cacheKey)) {
        setSpriteSheet(spritesheetCache.get(cacheKey)!);
        return;
      }
      
      // Create new spritesheet
      const sheet = new Spritesheet(
        BaseTexture.from(textureUrl, {
          scaleMode: PIXI.SCALE_MODES.NEAREST,
        }),
        spritesheetData,
      );
      await sheet.parse();
      
      // Cache result
      spritesheetCache.set(cacheKey, sheet);
      setSpriteSheet(sheet);
    };
    void parseSheet();
  }, [textureUrl, spritesheetData]);

  // The first "left" is "right" but reflected.
  const roundedOrientation = Math.floor(orientation / 90);
  const direction = ['right', 'down', 'left', 'up'][roundedOrientation];

  // Prevents the animation from stopping when the texture changes
  // (see https://github.com/pixijs/pixi-react/issues/359)
  const ref = useRef<PIXI.AnimatedSprite | null>(null);
  useEffect(() => {
    if (isMoving) {
      ref.current?.play();
    }
  }, [direction, isMoving]);

  if (!spriteSheet) return null;

  let blockOffset = { x: 0, y: 0 };
  switch (roundedOrientation) {
    case 2:
      blockOffset = { x: -20, y: 0 };
      break;
    case 0:
      blockOffset = { x: 20, y: 0 };
      break;
    case 3:
      blockOffset = { x: 0, y: -20 };
      break;
    case 1:
      blockOffset = { x: 0, y: 20 };
      break;
  }

  // handle message display
  const displayMessage = lastMessage || '';
  // truncate message, limit length
  const truncateMessage = (message: string): string => {
    const maxLength = 120; // increase max length to fit larger dialog bubble
    if (message.length <= maxLength) {
      return message;
    }
    return message.substring(0, maxLength) + '...';
  };
  const shortenedMessage = truncateMessage(displayMessage);

  // use calculated isInViewport
  const isInViewport = viewportInfo && typeof viewportInfo.isInViewport === 'function' 
    ? viewportInfo.isInViewport(x, y) 
    : true; // if no viewportInfo or method is provided, default to visible

  // calculate width required for character name display
  const calculateNameWidth = (name: string, isMe: boolean): number => {
    // consider different widths for Chinese and English characters
    let width = 0;
    for (let i = 0; i < name.length; i++) {
      // Chinese characters are usually wider than English characters
      const char = name.charAt(i);
      if (/[\u4e00-\u9fa5]/.test(char)) {
        width += 12; // Chinese character width
      } else {
        width += 7; // English character width
      }
    }
    
    // if current user, need to consider width of "(Me)" text
    const padding = 20; // left and right margins
    const meTextWidth = isMe ? 30 : 0; // width of "(Me)" text
    
    return width + padding + meTextWidth;
  };

  return (
    <Container 
      x={x} 
      y={y} 
      interactive={true} 
      pointerdown={(e) => {
        console.log("Character clicked:", characterName);
        // ensure event does not bubble
        e.stopPropagation();
        onClick();
      }} 
      cursor="pointer"
    >
      {characterName && (isInViewport || isViewer) && (
        <Container y={-40}>
          <Graphics
            draw={(g) => {
              g.clear();
              // check if character name matches current user name (ignore case)
              const currentUserName = localStorage.getItem('currentUserName');
              const isNameMatch = isCurrentUser || (currentUserName !== null && 
                characterName.toLowerCase() === currentUserName.toLowerCase());
              
              // if name matches, use yellow background
              g.beginFill(isNameMatch ? 0xFFA500 : 0x000000, isNameMatch ? 1.0 : 0.7);
              
              // calculate width required for name display
              // const displayName = isNameMatch ? `${characterName} (Me)` : characterName;
              const width = calculateNameWidth(characterName, isNameMatch);
              const height = 22; // increase height to make text more prominent
              
              g.drawRoundedRect(-width/2, -height/2, width, height, 5);
              g.endFill();
              
              // add border to make it more prominent
              if (isNameMatch) {
                g.lineStyle(1.5, 0xFFFFFF, 0.8);
                g.drawRoundedRect(-width/2, -height/2, width, height, 5);
              }
            }}
          />
          <Text 
            text={(()=>{
              const currentUserName = localStorage.getItem('currentUserName');
              const isNameMatch = isCurrentUser || (currentUserName !== null && 
                characterName.toLowerCase() === currentUserName.toLowerCase());
              const name = isNameMatch ? `${characterName} (Own)` : characterName;
              return isWorking ? `👷 ${name}` : name;
            })()} 
            anchor={0.5}
            style={new PIXI.TextStyle({
              fontFamily: 'Arial, sans-serif',
              fontSize: 12,
              fill: (()=>{
                const currentUserName = localStorage.getItem('currentUserName');
                const isNameMatch = isCurrentUser || (currentUserName !== null && 
                  characterName.toLowerCase() === currentUserName.toLowerCase());
                return isNameMatch ? 0x000000 : 0xFFFFFF;
              })(),
              align: 'center',
              fontWeight: 'bold',
              letterSpacing: 0
            })}
          />
        </Container>
      )}
      {isThinking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={-20} y={-24} scale={{ x: -0.8, y: 0.8 }} text={'💭'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSpeaking && displayMessage && (
        <Container y={-70}>
          <Graphics
            draw={(g) => {
              g.clear();
              g.beginFill(0xFFFFFF, 0.9);
              g.lineStyle(1, 0x000000, 0.5);
              // fixed size bubble, suitable for three lines of text
              const width = 240;
              const height = 70;
              g.drawRoundedRect(-width/2, -height/2, width, height, 5);
              g.endFill();
            }}
          />
          <Text 
            text={shortenedMessage} 
            anchor={0.5}
            style={new PIXI.TextStyle({
              fontFamily: 'Arial',
              fontSize: 12,
              fill: 0x000000,
              align: 'center',
              wordWrap: true,
              wordWrapWidth: 220,
              breakWords: true,
              leading: 2
            })}
          />
        </Container>
      )}
      {isViewer && <ViewerIndicator />}
      {emoji && (
        <Container x={15} y={-20}>
          {/* money bag icon */}
          {emoji === '💰' && activity?.description ? (
            // if activity is about getting AIB tokens, show both money bag and token amount
            <Container>
              {/* show money bag */}
              <Text 
                text={emoji} 
                anchor={{ x: 0.5, y: 0.5 }}
                scale={{ x: 0.7, y: 0.7 }}
              />
              
              {/* show token amount above money bag */}
              <Container y={-10}>
                {/* add semi-transparent black background */}
                <Graphics
                  draw={(g) => {
                    g.clear();
                    g.beginFill(0x000000, 0.5);
                    const width = activity.description.length * 5 + 15; // calculate width based on text length
                    const height = 14;
                    g.drawRoundedRect(-width/2, -height/2, width, height, 3);
                    g.endFill();
                  }}
                />
                <Text 
                  text={`+${activity.description}`}
                  anchor={{ x: 0.5, y: 0.5 }}
                  style={new PIXI.TextStyle({
                    fontFamily: 'Arial',
                    fontSize: 9,
                    fill: 0xFFFFFF,
                    align: 'center',
                    fontWeight: 'normal',
                    stroke: 0x000000,
                    strokeThickness: 1.5,
                    dropShadow: false,
                    letterSpacing: 0.5
                  })}
                />
              </Container>
            </Container>
          ) : (
            // other emojis display normally
            <Text 
              text={emoji} 
              anchor={{ x: 0.5, y: 0.5 }}
              scale={{ x: 0.7, y: 0.7 }}
            />
          )}
        </Container>
      )}
      
      {/* show activity dialog, when character is performing activity, regardless of whether they are speaking */}
      {activity && activity.until > Date.now() && (
        <Container y={isSpeaking ? -100 : -60}>
          <Graphics
            draw={(g) => {
              g.clear();
              const backgroundColor = activity.style?.background ? 
                PIXI.utils.string2hex(activity.style.background) : 0xFFFFFF;
              g.beginFill(backgroundColor, 0.9);
              g.lineStyle(1, 0x000000, 0.5);
              const width = 180;
              const height = 40;
              g.drawRoundedRect(-width/2, -height/2, width, height, 5);
              g.endFill();
            }}
          />
          <Text 
            text={`${activity.description}...`}
            anchor={0.5}
            style={new PIXI.TextStyle({
              fontFamily: 'Arial',
              fontSize: 12,
              fill: activity.style?.color ? 
                PIXI.utils.string2hex(activity.style.color) : 0x000000,
              align: 'center',
              fontWeight: 'normal',
              fontStyle: 'italic'
            })}
          />
        </Container>
      )}
      <AnimatedSprite
        ref={ref}
        textures={spriteSheet.animations[direction]}
        isPlaying={isMoving}
        animationSpeed={speed}
        anchor={{ x: 0.5, y: 0.5 }}
        scale={{ x: 0.5, y: 0.5 }}
      />
    </Container>
  );
};

function ViewerIndicator() {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0xffff0b, 0.5);
    g.drawRoundedRect(-10, 10, 20, 10, 100);
    g.endFill();
  }, []);

  return <Graphics draw={draw} />;
}
