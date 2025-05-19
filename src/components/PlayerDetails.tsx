import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import closeImg from '../../assets/ui/close-btn.svg';
import { SelectElement } from './Player';
import { Messages } from './Messages';
import { toastOnError } from '../toasts';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

// 在组件顶部添加样式
const inputStyle = {
  color: 'white',
  '&::placeholder': {
    color: 'rgba(255, 255, 255, 0.7)'
  }
};

type PlayerDetailsProps = {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerId?: GameId<'players'>;
  setSelectedElement: SelectElement;
  scrollViewRef: React.RefObject<HTMLDivElement>;
  userData?: any | null; // 添加用户数据属性
  userAddress?: string | null; // 修改类型允许null值
};

export default function PlayerDetails({
  worldId,
  engineId,
  game,
  playerId,
  setSelectedElement,
  scrollViewRef,
  userData,
  userAddress,
}: PlayerDetailsProps) {
  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId });
  const [isDirectChatOpen, setIsDirectChatOpen] = useState(false);
  const [directChatInput, setDirectChatInput] = useState('');
  const [directChatMessages, setDirectChatMessages] = useState<Array<{role: string, content: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [workTimeLeft, setWorkTimeLeft] = useState<string | null>(null);
  const workEndTimeRef = useRef<number | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [playerIsWorking, setPlayerIsWorking] = useState(false);
  const [isStoppingWork, setIsStoppingWork] = useState(false);
  const [isPreparingWork, setIsPreparingWork] = useState(false);
  const [headMessage, setHeadMessage] = useState('');

  const players = [...game.world.players.values()];
  const humanPlayer = players.find((p) => p.human === humanTokenIdentifier);
  const humanConversation = humanPlayer ? game.world.playerConversation(humanPlayer) : undefined;
  
  // 保存用户最后选择的角色ID，避免覆盖
  const userSelectedPlayerId = useRef<GameId<'players'> | undefined>(playerId);
  
  // 更新用户选择的角色ID
  useEffect(() => {
    if (playerId) {
      userSelectedPlayerId.current = playerId;
    }
  }, [playerId]);
  
  // 关键改进：只在没有传入playerId时，才考虑对话中的角色
  // 这确保了手动选择的角色不会被对话覆盖
  let effectivePlayerId = playerId;

  // 只有当没有设置任何playerId时才使用对话角色
  if (!effectivePlayerId && !userSelectedPlayerId.current && humanPlayer && humanConversation) {
    const otherPlayerIds = [...humanConversation.participants.keys()].filter(
      (p) => p !== humanPlayer.id,
    );
    effectivePlayerId = otherPlayerIds[0];
  } else if (!effectivePlayerId && userSelectedPlayerId.current) {
    // 如果没有当前playerId但有保存的选择，使用保存的
    effectivePlayerId = userSelectedPlayerId.current;
  }

  // 添加调试日志
  useEffect(() => {
    console.log('Player selection info:', {
      passedPlayerId: playerId,
      savedUserId: userSelectedPlayerId.current,
      effectiveId: effectivePlayerId
    });
  }, [playerId, effectivePlayerId]);

  const player = effectivePlayerId && game.world.players.get(effectivePlayerId);
  const playerConversation = player && game.world.playerConversation(player);

  const previousConversation = useQuery(
    api.world.previousConversation,
    effectivePlayerId ? { worldId, playerId: effectivePlayerId } : 'skip',
  );

  const playerDescription = effectivePlayerId && game.playerDescriptions.get(effectivePlayerId);

  const startConversation = useSendInput(engineId, 'startConversation');
  const acceptInvite = useSendInput(engineId, 'acceptInvite');
  const rejectInvite = useSendInput(engineId, 'rejectInvite');
  const leaveConversation = useSendInput(engineId, 'leaveConversation');
  const startWork = useSendInput(engineId, 'startWorking');
  const stopWork = useSendInput(engineId, 'stopWorking');
  const sendHeadMessage = useSendInput(engineId, 'sendHeadMessage');

  // 添加新的API调用方法
  const sendInput = useMutation(api.world.sendWorldInput);
  const directUpdateWorkingStatus = useMutation(api.world.directUpdateWorkingStatus);

  // Handle ESC key to close the chat modal
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDirectChatOpen) {
        setIsDirectChatOpen(false);
        setDirectChatMessages([]);
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [isDirectChatOpen]);

  // 计算工作剩余时间
  useEffect(() => {
    console.log("工作状态检查 - player:", player);
    console.log("工作状态:", player?.isWorking, "活动描述:", player?.activity?.description);
    console.log("工作开始时间:", player?.workStartTime, "记录的结束时间:", workEndTimeRef.current);
    
    // 记录上次更新时间的引用
    const lastUpdateRef = { current: Date.now() };
    
    // 当玩家处于工作状态时，设置结束时间
    if (player && (player.isWorking || player.activity?.description === "Working")) {
      // 工作持续时间：8小时
      const workDuration = 8 * 60 * 60 * 1000; // 8小时
      
      // 检查是否已经设置了结束时间
      if (workEndTimeRef.current === null) {
        // 检查是否有保存的工作开始时间
        const savedStartTime = player.workStartTime || playerDescription?.workStartTime;
        
        if (savedStartTime) {
          // 从保存的开始时间计算结束时间
          console.log("使用保存的工作开始时间:", new Date(savedStartTime).toLocaleString());
          workEndTimeRef.current = savedStartTime + workDuration;
          // 立即设置工作状态
          setPlayerIsWorking(true);
          
          // 立即计算一次剩余时间
          const now = Date.now();
          const remaining = Math.max(0, workEndTimeRef.current - now);
          
          if (remaining > 0) {
            // 格式化剩余时间
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            
            console.log(`立即更新倒计时: ${hours}h ${minutes}m ${seconds}s`);
            setWorkTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
          }
        } else {
          // 如果没有保存的开始时间，使用当前时间并触发一次数据库更新
          console.log("没有找到保存的工作开始时间，使用当前时间");
          const currentTime = Date.now();
          workEndTimeRef.current = currentTime + workDuration;
          setPlayerIsWorking(true);
          
          // 设置初始倒计时为8小时
          setWorkTimeLeft(`8h 0m 0s`);
          
          // 如果是登录用户，尝试更新数据库中的工作开始时间
          if ((isUrlLoggedInUser && player) || humanPlayer) {
            const currentPlayerId = isUrlLoggedInUser ? player.id : (humanPlayer ? humanPlayer.id : null);
            if (currentPlayerId) {
              console.log("尝试更新工作开始时间到数据库:", new Date(currentTime).toLocaleString());
              directUpdateWorkingStatus({
                playerId: currentPlayerId,
                isWorking: true,
                workStartTime: currentTime
              }).catch(err => console.error("更新工作开始时间失败:", err));
            }
          }
        }
      }
      
      // 设置计时器每秒更新一次剩余时间
      const timer = setInterval(() => {
        if (workEndTimeRef.current === null) {
          console.log("结束时间未设置，但计时器仍在运行");
          return;
        }
        
        const now = Date.now();
        const remaining = Math.max(0, workEndTimeRef.current - now);
        
        if (remaining <= 0) {
          console.log("工作时间结束，处理工作完成");
          
          // 立即更新UI状态
          setWorkTimeLeft(null);
          setPlayerIsWorking(false);
          
          // 清除计时器
          clearInterval(timer);
          workEndTimeRef.current = null; // 重置结束时间
          
          // 检查是否有登录用户，未登录用户不显示通知也不尝试更新
          const hasLoggedInUser = (isUrlLoggedInUser && player) || humanPlayer;
          if (!hasLoggedInUser) {
            console.log("No logged in user, skipping work completion process");
            return;
          }
          
          // 显示通知
          toast.info("Work time ended, updating status...");
          
          // 创建处理工作完成的函数，使用相同的直接API调用方法
          const handleWorkCompletion = async () => {
            try {
              // 获取正确的玩家ID
              let currentPlayerId: string | null = null;
              if (isUrlLoggedInUser && player) {
                currentPlayerId = player.id;
              } else if (humanPlayer) {
                currentPlayerId = humanPlayer.id;
              }
              
              if (!currentPlayerId) {
                console.log("Unable to determine player ID");
                return;
              }
              
              console.log("Attempting to automatically stop working, player ID:", currentPlayerId);
              
              // 先尝试使用游戏引擎API停止工作
              try {
                const result = await sendInput({
                  engineId,
                  name: "stopWorking",
                  args: {
                    playerId: currentPlayerId
                  }
                });
                console.log("Automatic stop working API call result:", result);
              } catch (error) {
                console.warn("Game engine API call failed, trying direct database update:", error);
              }
              
              // 无论游戏引擎API是否成功，都直接更新数据库
              try {
                const dbResult = await directUpdateWorkingStatus({
                  playerId: currentPlayerId,
                  isWorking: false
                });
                console.log("Direct database update result:", dbResult);
              } catch (dbError: any) {
                console.error("Failed to update database:", dbError);
                toast.error(`Database update failed, please try again later: ${dbError.message || 'Unknown error'}`);
              }
              
              // 显示成功消息
              toast.success("Work completed! You've earned AIB tokens.");
              
              // 重置状态而不是刷新页面
              setPlayerIsWorking(false);
              workEndTimeRef.current = null;
            } catch (error: any) {
              console.error("Failed to stop working automatically:", error);
              toast.error(`Failed to stop working: ${error.message || 'Unknown error'}`);
              
              // 无论如何都重置状态而不是刷新页面
              setPlayerIsWorking(false);
              workEndTimeRef.current = null;
            }
          };
          
          // 执行处理函数
          handleWorkCompletion();
        } else {
          // 格式化剩余时间
          const hours = Math.floor(remaining / (60 * 60 * 1000));
          const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
          const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
          
          const formattedTime = `${hours}h ${minutes}m ${seconds}s`;
          console.log(`更新倒计时: ${formattedTime}`);
          setWorkTimeLeft(formattedTime);
          
          // 更新最后一次成功更新时间
          lastUpdateRef.current = Date.now();
        }
      }, 1000);
      
      // 添加自动检测计时器是否正常工作的逻辑
      const checkTimerWorking = setInterval(() => {
        const now = Date.now();
        // 如果超过5秒没有更新倒计时，尝试重新初始化
        if (now - lastUpdateRef.current > 5000 && workEndTimeRef.current !== null) {
          console.log("检测到倒计时长时间未更新，尝试重新初始化...");
          
          // 检查工作开始时间是否存在
          if (player.workStartTime) {
            const workDuration = 8 * 60 * 60 * 1000;
            workEndTimeRef.current = player.workStartTime + workDuration;
            
            // 立即计算一次剩余时间
            const remaining = Math.max(0, workEndTimeRef.current - now);
            
            if (remaining > 0) {
              // 格式化剩余时间
              const hours = Math.floor(remaining / (60 * 60 * 1000));
              const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
              const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
              
              console.log(`自动重试更新倒计时: ${hours}h ${minutes}m ${seconds}s`);
              setWorkTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
              
              // 更新最后更新时间
              lastUpdateRef.current = now;
            }
          }
        }
      }, 5000); // 每5秒检查一次
      
      // 清理计时器
      if (clearTimerRef.current) {
        clearInterval(clearTimerRef.current);
      }
      clearTimerRef.current = timer;
      
      return () => {
        if (timer) {
          clearInterval(timer);
        }
        clearInterval(checkTimerWorking);
      };
    } else {
      // 当不再工作时，重置结束时间
      console.log("玩家不在工作状态，重置倒计时");
      workEndTimeRef.current = null;
      setWorkTimeLeft(null);
      
      // 清理现有计时器
      if (clearTimerRef.current) {
        clearInterval(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    }
  }, [player?.isWorking, player?.activity?.description, player?.workStartTime, playerDescription?.workStartTime, directUpdateWorkingStatus]);

  // 初始化工作状态
  useEffect(() => {
    if (player) {
      // 根据实际角色状态设置工作状态
      setPlayerIsWorking(player.isWorking || Boolean(playerDescription?.isWorking));
    }
  }, [player?.isWorking, playerDescription?.isWorking, player]);

  if (!effectivePlayerId) {
    return (
      <div className="h-full text-base flex text-center items-center p-4 text-white font-system">
        Click on the character to view details.
      </div>
    );
  }
  if (!player) {
    return null;
  }
  // 使用两种方式定义isMe:
  // 1. 标准方式：通过humanPlayer和player.id
  // 2. URL参数方式：通过userAddress和player.ethAddress
  const isUrlLoggedInUser = userAddress && player.ethAddress === userAddress;
  const isMe = (humanPlayer && player.id === humanPlayer.id) || isUrlLoggedInUser;
  const canInvite = !isMe && !playerConversation && humanPlayer && !humanConversation;
  const sameConversation =
    !isMe &&
    humanPlayer &&
    humanConversation &&
    playerConversation &&
    humanConversation.id === playerConversation.id;

  const humanStatus =
    humanPlayer && humanConversation && humanConversation.participants.get(humanPlayer.id)?.status;
  const playerStatus = playerConversation && playerConversation.participants.get(effectivePlayerId)?.status;

  const haveInvite = sameConversation && humanStatus?.kind === 'invited';
  const waitingForAccept =
    sameConversation && playerConversation.participants.get(effectivePlayerId)?.status.kind === 'invited';
  const waitingForNearby =
    sameConversation && playerStatus?.kind === 'walkingOver' && humanStatus?.kind === 'walkingOver';

  const inConversationWithMe =
    sameConversation &&
    playerStatus?.kind === 'participating' &&
    humanStatus?.kind === 'participating';

  const onStartConversation = async () => {
    if (!humanPlayer || !effectivePlayerId) {
      return;
    }
    console.log(`Starting conversation`);
    await toastOnError(startConversation({ 
      playerId: humanPlayer.id, 
      invitee: effectivePlayerId as GameId<'players'>
    }));
  };
  
  const onAcceptInvite = async () => {
    if (!humanPlayer || !humanConversation || !effectivePlayerId) {
      return;
    }
    await toastOnError(
      acceptInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onRejectInvite = async () => {
    if (!humanPlayer || !humanConversation) {
      return;
    }
    await toastOnError(
      rejectInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onLeaveConversation = async () => {
    if (!humanPlayer || !inConversationWithMe || !humanConversation) {
      return;
    }
    await toastOnError(
      leaveConversation({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  // const pendingSuffix = (inputName: string) =>
  //   [...inflightInputs.values()].find((i) => i.name === inputName) ? ' opacity-50' : '';

  const pendingSuffix = (s: string) => '';

  // Function to handle direct chat with AI
  const handleSendDirectMessage = async () => {
    if (!directChatInput.trim() || isLoading || !playerDescription) return;
    
    console.log("开始发送消息...");
    
    // Check if API key is available
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    console.log("API Key状态:", apiKey ? "存在" : "不存在");
    
    if (!apiKey) {
      console.error("OpenAI API Key不存在");
      // 显示错误消息到聊天窗口
      const errorMessage = { 
        role: 'assistant', 
        content: "Error: OpenAI API key is not configured. The app needs an API key to function." 
      };
      setDirectChatMessages(prev => [...prev, errorMessage]);
      return;
    }
    
    setIsLoading(true);
    
    // Add user message to the chat
    const userMessage = { role: 'user', content: directChatInput };
    setDirectChatMessages(prev => [...prev, userMessage]);
    setDirectChatInput('');
    
    try {
      // Prepare context for AI
      const systemMessage = {
        role: 'system', 
        content: `You are ${playerDescription.name}, a character with the following description: ${playerDescription.description}. 
        Reply as this character would, keeping responses concise (under 100 words) and staying in character.`
      };
      
      console.log("准备发送请求到OpenAI API...");
      
      // Prepare the API request
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo", // 使用更常见的模型，gpt-4o-mini可能不是所有账户都能访问
          messages: [systemMessage, ...directChatMessages, userMessage],
          max_tokens: 150
        })
      });
      
      console.log("API响应状态:", response.status);
      
      const data = await response.json();
      console.log("API响应数据:", data);
      
      if (data.choices && data.choices[0]?.message) {
        // Add AI response to the chat
        setDirectChatMessages(prev => [...prev, data.choices[0].message]);
      } else {
        console.error("API响应没有返回预期的消息格式", data);
        throw new Error(data.error?.message || 'Invalid response from API');
      }
    } catch (error: any) {
      console.error('Error in direct chat:', error);
      // Add error message to chat
      setDirectChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error.message || "Couldn't connect to the API. Please check your internet connection."}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 工作按钮处理
  const handleWorkButtonClick = async () => {
    // 立即设置准备状态并禁用按钮
    setIsPreparingWork(true);
    
    // 创建工作开始时间 - 所有途径共享同一个开始时间
    const workStartTime = Date.now();
    
    // 立即设置倒计时结束时间 - 提高UI响应速度
    const workDuration = 8 * 60 * 60 * 1000; // 8小时
    workEndTimeRef.current = workStartTime + workDuration;
    
    // 立即更新UI状态，无需等待API响应
    setPlayerIsWorking(true);
    
    // 减少超时时间到2秒
    const timeout = setTimeout(() => {
      console.log("Work start request timed out, trying direct method");
      tryDirectMethod(workStartTime);
    }, 2000); // 2秒超时
    
    // 使用引用存储计时器ID，使其可以在任何地方被清除
    const timeoutRef = { current: timeout };
    
    // 移除页面刷新的最终超时，改为重试逻辑
    const finalTimeoutRef = { current: null };
    
    // 尝试直接更新数据库的备用方法
    const tryDirectMethod = async (startTimeMs: number) => {
      try {
        // 获取正确的玩家ID
        let currentPlayerId: string | null = null;
        if (isUrlLoggedInUser && player) {
          currentPlayerId = player.id;
        } else if (humanPlayer) {
          currentPlayerId = humanPlayer.id;
        }
        
        if (!currentPlayerId) {
          console.error("Unable to determine player ID");
          toast.error("Failed to start working - player ID not found");
          setIsPreparingWork(false);
          setPlayerIsWorking(false);
          return;
        }
        
        console.log("尝试直接更新数据库开始工作，开始时间:", new Date(startTimeMs).toLocaleString());
        
        // 并行执行两种方法，任何一个成功即可
        const promises = [];
        
        // 1. 尝试游戏引擎API
        promises.push(
          sendInput({
            engineId,
            name: "startWorking",
            args: {
              playerId: currentPlayerId,
              workStartTime: startTimeMs
            }
          }).catch(error => {
            console.warn("Game engine API failed", error);
            return null; // 返回null表示此方法失败
          })
        );
        
        // 2. 直接更新数据库
        promises.push(
          directUpdateWorkingStatus({
            playerId: currentPlayerId,
            isWorking: true,
            workStartTime: startTimeMs
          }).catch(error => {
            console.error("Database update failed", error);
            return null; // 返回null表示此方法失败
          })
        );
        
        // 设置3秒超时，以防请求卡住
        const timeoutPromise = new Promise<{timedOut: boolean}>((resolve) => {
          setTimeout(() => resolve({ timedOut: true }), 3000);
        });
        
        // 等待任意一个方法成功或超时
        const result = await Promise.race<{timedOut?: boolean, success?: boolean}>([
          Promise.allSettled(promises).then(results => {
            // 检查是否至少有一个方法成功
            const anySuccess = results.some(r => 
              r.status === 'fulfilled' && r.value !== null
            );
            return { success: anySuccess };
          }),
          timeoutPromise
        ]);
        
        // 判断结果类型
        if ('timedOut' in result) {
          console.log("Work start request timed out, assume visual success");
          toast.info("Work started visually. Server update may take a moment.");
          
          // 更新倒计时结束时间
          workEndTimeRef.current = startTimeMs + workDuration;
          
          // 只更新UI状态
          setIsPreparingWork(false);
        } else if (result.success) {
          // 更新倒计时结束时间（确保UI和数据保持一致）
          workEndTimeRef.current = startTimeMs + workDuration;
          
          toast.success("Work started successfully! You'll earn AIB tokens over 8 hours.");
          
          // 更新状态
          setIsPreparingWork(false);
        } else {
          // 两种方法都失败
          toast.error("Failed to start working. Please try again.");
          setIsPreparingWork(false);
          setPlayerIsWorking(false);
          workEndTimeRef.current = null;
        }
      } catch (error: any) {
        console.error("Failed to start working:", error);
        toast.error(`Failed to start working: ${error.message || 'Unknown error'}`);
        setIsPreparingWork(false);
        setPlayerIsWorking(false); // 重置工作状态
        workEndTimeRef.current = null; // 重置倒计时
      }
    };
    
    // 首先尝试常规方法
    try {
      // 如果是通过URL登录的用户，直接使用当前角色
      if (isUrlLoggedInUser && player) {
        try {
          await toastOnError(
            startWork({
              playerId: player.id,
              workStartTime: workStartTime // 使用统一的开始时间
            })
          );
          // 清除超时
          clearTimeout(timeoutRef.current);
          if (finalTimeoutRef.current) clearTimeout(finalTimeoutRef.current);
          
          toast.success("You started working! You'll earn AIB tokens over 8 hours.");
          
          // 更新状态
          setIsPreparingWork(false);
        } catch (error) {
          console.error("Failed to start work with normal method:", error);
          // 不显示错误，让超时处理继续尝试
        }
      } 
      // 否则使用humanPlayer（常规登录）
      else if (humanPlayer) {
        try {
          await toastOnError(
            startWork({
              playerId: humanPlayer.id,
              workStartTime: workStartTime // 使用统一的开始时间
            })
          );
          // 清除超时
          clearTimeout(timeoutRef.current);
          if (finalTimeoutRef.current) clearTimeout(finalTimeoutRef.current);
          
          toast.success("You started working! You'll earn AIB tokens over 8 hours.");
          
          // 更新状态
          setIsPreparingWork(false);
        } catch (error) {
          console.error("Failed to start work with normal method:", error);
          // 不显示错误，让超时处理继续尝试
        }
      } else {
        // 如果都没有，尝试直接方法
        clearTimeout(timeoutRef.current);
        tryDirectMethod(workStartTime);
      }
    } catch (error) {
      console.error("General error in start working:", error);
      // 不重置准备状态，让超时处理继续尝试
    }
  };

  // 处理发送头顶消息
  const handleSendHeadMessage = async () => {
    if (!headMessage.trim()) return;
    
    const msgToSend = headMessage.trim();
    console.log("Sending head message:", msgToSend);
    
    // Clear input field immediately before API call
    setHeadMessage('');
    
    try {
      let playerIdToUse;
      if (isUrlLoggedInUser) {
        playerIdToUse = player.id;
      } else if (humanPlayer) {
        playerIdToUse = humanPlayer.id;
      } else {
        console.error("Unable to determine player ID");
        toast.error("Unable to send message: Cannot determine player ID");
        return;
      }

      await toastOnError(
        sendHeadMessage({
          playerId: playerIdToUse,
          message: msgToSend
        })
      );
      
      toast.success("Message sent!");
    } catch (error: any) {
      console.error("Failed to send head message:", error);
      toast.error(`Failed to send message: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <>
      <div className="flex flex-col space-y-4 p-3 bg-slate-900 text-white font-system h-full relative">
        <div className="flex justify-between items-center mb-2 pb-3 border-b border-gray-700">
          <div>
            <h2 className={`text-xl font-bold font-body ${userAddress && userData && player.ethAddress === userAddress ? 'bg-amber-500 text-black px-2 py-1 rounded' : ''}`} style={{ imageRendering: 'pixelated' }}>
              {playerDescription?.name}
              {userAddress && userData && player.ethAddress === userAddress && ' (Me)'}
            </h2>
            {/* 隐藏以太坊地址显示 */}
            <div className="hidden">
            {player.ethAddress && (
              <p className="text-sm text-gray-300 font-body mt-2 tracking-wide">
                {`${player.ethAddress.substring(0, 6)}......${player.ethAddress.substring(player.ethAddress.length - 6)}`}
              </p>
            )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              console.log("关闭按钮被点击了，正在清除选择...");
              // 直接导航回主页面
              setSelectedElement(undefined);
              console.log("选择已清除");
              
              // 如果需要，可以在这里添加额外的清理操作
              // 比如重置当前状态等
            }}
            className="hidden w-10 h-10 flex items-center justify-center bg-red-600 hover:bg-red-700 transition-colors rounded-md text-white font-bold text-xl shadow-md"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 dialog-scrollbar">
          <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
            <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
              CHARACTER INFO
            </h3>
            <div className="p-3 max-h-48 overflow-y-auto scrollbar">
              <p className="text-sm text-gray-300 font-system">
                {playerDescription?.description}
                {isMe && (
                  <>
                    <br />
                    <br />
                    <i>This is you!</i>
                  </>
                )}
                {!isMe && inConversationWithMe && (
                  <>
                    <br />
                    <br />(<i>You're talking to me!</i>)
                  </>
                )}
              </p>
            </div>
          </div>
          
          {/* 隐藏AIB TOKENS部分 */}
          <div className="hidden">
          <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
            <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
              AIB TOKENS
            </h3>
            <div className="p-3">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-300 font-system">Balance:</p>
                <p className="text-sm text-yellow-400 font-bold font-system">
                  {(player.aibtoken !== undefined 
                    ? player.aibtoken 
                    : playerDescription?.aibtoken || 0).toFixed(4)} AIB
                </p>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <p className="text-sm text-gray-300 font-system">Status:</p>
                {(player.isWorking || playerDescription?.isWorking) ? (
                  <p className="text-sm text-green-400 font-system">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                    Working
                  </p>
                ) : (
                  <p className="text-sm text-red-400 font-system">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1"></span>
                    Idle
                  </p>
                )}
              </div>
                    </div>
            </div>
          </div>
          
          {canInvite && (
            <button
              className={
                'w-full py-2 rounded bg-blue-600 hover:bg-blue-500 transition-colors duration-200 text-white text-center font-system mb-4' +
                pendingSuffix('startConversation')
              }
              onClick={onStartConversation}
            >
              Start conversation
            </button>
          )}
          {waitingForAccept && (
            <div className="w-full py-2 rounded bg-gray-600 text-white text-center opacity-75 font-system mb-4">
              Waiting for accept...
            </div>
          )}
          {waitingForNearby && (
            <div className="w-full py-2 rounded bg-gray-600 text-white text-center opacity-75 font-system mb-4">
              Walking over...
            </div>
          )}
          {inConversationWithMe && (
            <button
              className={
                'w-full py-2 rounded bg-red-600 hover:bg-red-500 transition-colors duration-200 text-white text-center font-system mb-4' +
                pendingSuffix('leaveConversation')
              }
              onClick={onLeaveConversation}
            >
              Leave conversation
            </button>
          )}
          {haveInvite && (
            <div className="flex space-x-2 mb-4">
              <button
                className={
                  'flex-1 py-2 rounded bg-green-600 hover:bg-green-500 transition-colors duration-200 text-white text-center font-system' +
                  pendingSuffix('acceptInvite')
                }
                onClick={onAcceptInvite}
              >
                Accept
              </button>
              <button
                className={
                  'flex-1 py-2 rounded bg-red-600 hover:bg-red-500 transition-colors duration-200 text-white text-center font-system' +
                  pendingSuffix('rejectInvite')
                }
                onClick={onRejectInvite}
              >
                Reject
              </button>
            </div>
          )}
          
          {!playerConversation && player.activity && player.activity.until > Date.now() && (
            <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
              <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
                ACTIVITY
              </h3>
              <div className="p-3">
                <p className="text-sm text-gray-300 font-system">{player.activity.description}</p>
              </div>
            </div>
          )}
          
          {!inConversationWithMe && !haveInvite && !waitingForNearby && !isDirectChatOpen && (
            <button
              className="w-full py-2 rounded bg-amber-500 hover:bg-amber-400 transition-colors duration-200 text-black text-center font-system mb-4"
              onClick={() => setIsDirectChatOpen(true)}
            >
              Start a conversation
            </button>
          )}
          
          {!isMe && playerConversation && playerStatus?.kind === 'participating' && (
            <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
              <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
                CURRENT CONVERSATION
              </h3>
              <div className="p-3">
                <Messages
                  worldId={worldId}
                  engineId={engineId}
                  inConversationWithMe={inConversationWithMe ?? false}
                  conversation={{ kind: 'active', doc: playerConversation }}
                  humanPlayer={humanPlayer}
                  scrollViewRef={scrollViewRef}
                />
              </div>
            </div>
          )}
          
          {!playerConversation && previousConversation && (
            <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
              <h3 className="bg-slate-700 py-2 px-3 text-sm font-medium text-center uppercase font-system">
                PREVIOUS CONVERSATION
              </h3>
              <div className="p-3">
                <Messages
                  worldId={worldId}
                  engineId={engineId}
                  inConversationWithMe={false}
                  conversation={{ kind: 'archived', doc: previousConversation }}
                  humanPlayer={humanPlayer}
                  scrollViewRef={scrollViewRef}
                />
              </div>
            </div>
          )}
        </div>
        
        {isMe && (
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-gray-700 p-3">
            <div className="text-sm font-medium mb-2">Send Head Message</div>
            <div className="flex">
              <input
                type="text"
                value={headMessage}
                onChange={(e) => setHeadMessage(e.target.value)}
                placeholder="Enter message to display above head..."
                className="flex-1 rounded-l border border-gray-300 px-3 py-2 text-sm text-black"
                maxLength={50}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSendHeadMessage();
                  }
                }}
              />
              <button
                onClick={handleSendHeadMessage}
                className="bg-blue-500 hover:bg-blue-600 text-white rounded-r px-3 py-2 text-sm"
              >
                Send
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Message will appear above character for 10 seconds
            </div>
          </div>
        )}
      </div>
      
      {isDirectChatOpen && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50"
          onClick={() => {
            setIsDirectChatOpen(false);
            setDirectChatMessages([]);
          }}
        >
          <div 
            className="bg-slate-900 rounded-lg w-96 max-w-[90%] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="bg-slate-700 py-3 px-4 text-sm font-medium text-center uppercase font-system flex justify-between items-center">
              <span className="text-white">DIRECT CONVERSATION</span>
              <button 
                onClick={() => {
                  setIsDirectChatOpen(false);
                  setDirectChatMessages([]);
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </h3>
            <div className="p-4">
              <div className="flex items-center mb-4">
                <div className="bg-slate-800 w-10 h-10 rounded-full flex items-center justify-center text-xl">
                  {playerDescription?.name.charAt(0)}
                </div>
                <p className="ml-3 text-md font-semibold text-white">
                  {playerDescription?.name}
                </p>
              </div>
              
              <div className="h-80 max-h-[40vh] overflow-y-auto mb-3 dialog-scrollbar border border-slate-700 rounded-lg p-3 bg-slate-800">
                {directChatMessages.length === 0 ? (
                  <p className="text-sm text-white italic text-center font-system py-4">
                    Start chatting with {playerDescription?.name}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {directChatMessages.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`p-3 rounded max-w-[85%] ${
                          msg.role === 'user' 
                            ? 'bg-blue-600 ml-auto' 
                            : 'bg-slate-700'
                        }`}
                      >
                        <p className="text-sm text-white font-system">{msg.content}</p>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="p-3 rounded bg-slate-700 max-w-[85%]">
                        <p className="text-sm text-white font-system">Typing...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex mt-2">
                <input
                  type="text"
                  value={directChatInput}
                  onChange={(e) => setDirectChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendDirectMessage()}
                  placeholder={`Message ${playerDescription?.name}...`}
                  className="flex-1 p-3 rounded-l bg-slate-600 text-white text-sm font-system focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                  style={inputStyle}
                />
                <button
                  onClick={handleSendDirectMessage}
                  disabled={isLoading || !directChatInput.trim()}
                  className={`px-4 py-3 rounded-r bg-amber-500 text-black font-system ${
                    isLoading || !directChatInput.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-400'
                  }`}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
