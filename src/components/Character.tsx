import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatedSprite, Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

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
  aibtoken,
  onClick,
  activity,
  isCurrentUser = false,
  ethAddress = '',
  viewportInfo,
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
  // 角色最近的消息
  lastMessage?: string;
  // 角色名称
  characterName?: string;
  // AIB代币数量
  aibtoken?: number;
  // 活动信息
  activity?: { description: string; emoji?: string; until: number; style?: { background?: string; color?: string } };
  // 是否是当前登录用户的角色
  isCurrentUser?: boolean;
  // 以太坊地址
  ethAddress?: string;
  onClick: () => void;
  viewportInfo: any;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  const lastRenderTime = useRef(0);
  
  useEffect(() => {
    const parseSheet = async () => {
      const sheet = new Spritesheet(
        BaseTexture.from(textureUrl, {
          scaleMode: PIXI.SCALE_MODES.NEAREST,
        }),
        spritesheetData,
      );
      await sheet.parse();
      setSpriteSheet(sheet);
    };
    void parseSheet();
  }, []);

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

  // 处理消息显示
  const displayMessage = lastMessage || '';
  // 截断消息，限制长度
  const truncateMessage = (message: string): string => {
    const maxLength = 120; // 增加最大长度以适应更大的对话气泡
    if (message.length <= maxLength) {
      return message;
    }
    return message.substring(0, maxLength) + '...';
  };
  const shortenedMessage = truncateMessage(displayMessage);

  // 使用计算的 isInViewport
  const isInViewport = viewportInfo && typeof viewportInfo.isInViewport === 'function' 
    ? viewportInfo.isInViewport(x, y) 
    : true; // 如果没有提供viewportInfo或方法，默认为可见

  // 计算角色名称显示所需的宽度
  const calculateNameWidth = (name: string, isMe: boolean): number => {
    // 考虑中文字符和英文字符的不同宽度
    let width = 0;
    for (let i = 0; i < name.length; i++) {
      // 中文字符通常比英文字符宽
      const char = name.charAt(i);
      if (/[\u4e00-\u9fa5]/.test(char)) {
        width += 12; // 中文字符宽度
      } else {
        width += 7; // 英文字符宽度
      }
    }
    
    // 如果是当前用户，需要考虑"(Me)"文本的宽度
    const padding = 20; // 左右边距
    const meTextWidth = isMe ? 30 : 0; // (Me)文本的宽度
    
    return width + padding + meTextWidth;
  };

  return (
    <Container 
      x={x} 
      y={y} 
      interactive={true} 
      pointerdown={(e) => {
        console.log("Character被点击:", characterName);
        // 确保事件不会冒泡
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
              // 检查角色名称与当前用户名称是否匹配（忽略大小写）
              const currentUserName = localStorage.getItem('currentUserName');
              const isNameMatch = isCurrentUser || (currentUserName !== null && 
                characterName.toLowerCase() === currentUserName.toLowerCase());
              
              // 如果名称匹配，使用黄色背景
              g.beginFill(isNameMatch ? 0xFFA500 : 0x000000, isNameMatch ? 1.0 : 0.7);
              
              // 计算名称显示所需的宽度
              const displayName = isNameMatch ? `${characterName} (Me)` : characterName;
              const width = calculateNameWidth(characterName, isNameMatch);
              const height = 22; // 增加高度使文本更加突出
              
              g.drawRoundedRect(-width/2, -height/2, width, height, 5);
              g.endFill();
              
              // 添加边框使其更加突出
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
              return isNameMatch ? `${characterName} (Me)` : characterName;
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
              // 固定大小的气泡，适合三行文字
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
          {/* 钱袋子图标 */}
          {emoji === '💰' && activity?.description ? (
            // 如果是获得AIB代币的活动，同时显示钱袋子和代币数量
            <Container>
              {/* 显示钱袋子 */}
              <Text 
                text={emoji} 
                anchor={{ x: 0.5, y: 0.5 }}
                scale={{ x: 0.7, y: 0.7 }}
              />
              
              {/* 在钱袋子上方显示获取的代币数量 */}
              <Container y={-10}>
                {/* 添加半透明黑色背景 */}
                <Graphics
                  draw={(g) => {
                    g.clear();
                    g.beginFill(0x000000, 0.5);
                    const width = activity.description.length * 5 + 15; // 根据文本长度计算宽度
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
            // 其他emoji正常显示
            <Text 
              text={emoji} 
              anchor={{ x: 0.5, y: 0.5 }}
              scale={{ x: 0.7, y: 0.7 }}
            />
          )}
        </Container>
      )}
      
      {/* 显示活动对话框，当角色正在执行活动时，无论是否在说话 */}
      {activity && activity.until > Date.now() && (
        <Container y={isSpeaking ? -100 : -60}>
          <Graphics
            draw={(g) => {
              g.clear();
              // 使用自定义背景色或默认白色
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
              // 使用自定义文本颜色或默认黑色
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
