import Game from './components/Game.tsx';
import SolanaWalletProvider from './components/SolanaWalletProvider.tsx';

import { ToastContainer, toast } from 'react-toastify';
import a16zImg from '../assets/a16z.png';
import convexImg from '../assets/convex.svg';
// import starImg from '../assets/star.svg';
// import helpImg from '../assets/help.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState, useEffect, useCallback } from 'react';
import ReactModal from 'react-modal';
// import MusicButton from './components/buttons/MusicButton.tsx';
// import Button from './components/buttons/Button.tsx';
// import InteractButton from './components/buttons/InteractButton.tsx';
// import FreezeButton from './components/FreezeButton.tsx';
import { MAX_HUMAN_PLAYERS } from '../convex/constants.ts';
// import PoweredByConvex from './components/PoweredByConvex.tsx';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useConvex } from 'convex/react';

export default function Home() {
  // const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastShown, setToastShown] = useState(false);
  const [initComplete, setInitComplete] = useState(false);
  // 添加调试状态
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // 添加初始化用户数据的mutation
  const createOrUpdatePlayerMutation = useMutation(api.newplayer.createOrUpdatePlayer);
  // 添加简化版用户创建mutation
  const createPlayerSimpleMutation = useMutation(api.newplayer.createPlayerSimple);
  // 添加调试查询
  const debugStatus = useQuery(api.newplayer.debugDatabaseStatus);
  const allPlayers = useQuery(api.newplayer.getAllPlayers);

  const convex = useConvex();

  // 从URL获取用户地址
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const addrParam = queryParams.get('addr');
    
    if (addrParam) {
      setUserAddress(addrParam);
    }
    
    setLoading(false);
  }, []);

  // 使用Convex useQuery直接获取用户数据
  const userData = useQuery(
    api.user.getUserByEthAddress,
    userAddress ? { ethAddress: userAddress } : "skip"
  );

  // 将初始化用户数据的函数提取出来便于调试，使用useCallback确保引用稳定
  const initializePlayerData = useCallback(async () => {
    if (!userAddress) {
      console.log("无法初始化用户，缺少钱包地址");
      return;
    }
    
    console.log("尝试初始化用户数据...", { userAddress, userData });
    
    // 首先检查是否已存在数据库记录 - 使用单独的查询避免重置数据
    try {
      const existingPlayer = await convex.query(api.newplayer.getPlayerByEthAddress, { 
        ethAddress: userAddress 
      });
      
      if (existingPlayer) {
        console.log("数据库中已存在用户数据，不进行初始化以避免重置代币:", existingPlayer);
        setInitComplete(true);
        return;
      }
    } catch (checkError) {
      console.error("检查现有用户数据失败:", checkError);
      // 继续执行下面的初始化流程
    }
    
    // 情况1: 有完整userData和playerId
    if (userData && userData.playerId) {
      console.log("情况1: 有完整userData和playerId，初始化用户数据到newplayer表...");
      
      // 检查是否为虚拟用户 - 修改判断逻辑
      // 旧代码: const isVirtualUser = userData.playerId.startsWith('virtual_player_');
      // 新代码: 检查是否以"AiB_"开头
      const isVirtualUser = userData.playerId.startsWith('AiB_');
      console.log("是否为虚拟用户:", isVirtualUser);
      
      try {
        // 创建干净的玩家数据对象，避免传递内部字段如_creationTime
        const playerData: any = {
          playerId: userData.playerId,
          name: userData.name || 'Unnamed User',
          displayName: userData.name || 'Unnamed User',
          ethAddress: userAddress,
          aibtoken: userData.aibtoken || 0,
          isWorking: false,
          workStartTime: undefined
        };

        // 如果存在worldId，则添加到数据中
        if (userData.worldId) {
          playerData.worldId = userData.worldId;
        }

        const result = await createOrUpdatePlayerMutation(playerData);
        
        console.log("用户数据已成功初始化:", result);
        setInitComplete(true);
        toast.success("用户数据已同步到数据库");
        return;
      } catch (error) {
        console.error("标准初始化用户数据失败:", error);
        // 不返回，继续尝试其他方法
      }
    }
    
    // 情况2: 没有完整userData，但有钱包地址，尝试创建虚拟用户
    console.log("情况2: 尝试创建虚拟用户...");
    try {
      // 生成随机名称
      const randomName = `Guest_${Math.floor(Math.random() * 10000)}`;
      
      const result = await createPlayerSimpleMutation({
        name: randomName,
        displayName: randomName,
        ethAddress: userAddress,
        aibtoken: 10, // 给一些初始代币
      });
      
      console.log("虚拟用户创建成功:", result);
      toast.success("已创建默认用户");
      setInitComplete(true);
      return;
    } catch (simpleMutationError) {
      console.error("简化创建用户失败:", simpleMutationError);
    }
    
    // 情况3: 其他方法都失败，尝试最基本的创建方式
    console.log("情况3: 尝试最基本的创建方式...");
    try {
      const now = Date.now();
      const randomName = `Emergency_User_${Math.floor(Math.random() * 10000)}`;
      const emergencyId = `emergency_${now}_${Math.floor(Math.random() * 100000)}`;
      
      // 随机选择一个非Kurt的头像 [1,3,4,5,6,7,8]
      const validAvatarNumbers = [1,3,4,5,6,7,8];
      const randomIndex = Math.floor(Math.random() * validAvatarNumbers.length);
      const avatarNumber = validAvatarNumbers[randomIndex];
      const avatarPath = `/assets/f${avatarNumber}.png`;
      
      // 创建干净的对象
      const emergencyData = {
        playerId: emergencyId,
        name: randomName,
        displayName: randomName,
        ethAddress: userAddress,
        aibtoken: 5,
        isWorking: false,
        workStartTime: undefined,
        avatarPath: avatarPath // 添加随机头像路径
      };
      
      const result = await createOrUpdatePlayerMutation(emergencyData);
      
      console.log("紧急用户创建成功:", result);
      toast.success("已创建应急用户账户");
      setInitComplete(true);
    } catch (emergencyError) {
      console.error("所有创建用户的尝试均失败:", emergencyError);
      toast.error("无法创建用户，请刷新页面重试");
    }
  }, [userAddress, userData, createOrUpdatePlayerMutation, createPlayerSimpleMutation, convex]);

  // 添加：当获取到userData或userAddress后尝试初始化newplayer表
  useEffect(() => {
    if (userAddress && !initComplete) {
      // 添加延迟，确保其他操作已完成
      setTimeout(() => {
        initializePlayerData();
      }, 1000);
    }
  }, [userData, userAddress, initComplete, initializePlayerData]);

  // 新增：尝试创建虚拟用户数据的函数
  const createVirtualUser = useCallback(async () => {
    if (!userAddress) {
      console.error("无法创建虚拟用户，缺少钱包地址");
      toast.error("无法创建虚拟用户，请连接钱包");
      return;
    }
    
    try {
      console.log("尝试创建虚拟用户数据，钱包地址:", userAddress);
      
      // 生成随机名称
      const randomName = `Guest_${Math.floor(Math.random() * 10000)}`;
      
      // 注意：createPlayerSimple函数已被修改，会自动避开Kurt的头像(f2.png)
      // 新用户会随机分配[f1,f3,f4,f5,f6,f7,f8]中的一个头像
      const result = await createPlayerSimpleMutation({
        name: randomName,
        displayName: randomName,
        ethAddress: userAddress,
        aibtoken: 10, // 给一些初始代币
      });
      
      console.log("虚拟用户创建成功:", result);
      toast.success("虚拟用户创建成功");
      
      // 延迟后刷新页面，使新创建的用户数据生效
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
      return true;
    } catch (error) {
      console.error("创建虚拟用户失败:", error);
      toast.error("创建虚拟用户失败");
      
      // 尝试使用更直接的方式创建用户
      try {
        console.log("尝试使用标准API创建虚拟用户...");
        
        const now = Date.now();
        const randomName = `Guest_${Math.floor(Math.random() * 10000)}`;
        // 旧代码: const playerId = `virtual_player_${now}_${Math.floor(Math.random() * 100000)}`;
        // 新代码: 生成"AiB_XXXX"格式的ID，其中XXXX是四位随机数字
        const randomDigits = Math.floor(10000 + Math.random() * 90000); // 生成10000-99999之间的五位数
        const playerId = `AiB_${randomDigits}`;
        
        // 随机选择一个非Kurt的头像 [1,3,4,5,6,7,8]
        const validAvatarNumbers = [1,3,4,5,6,7,8];
        const randomIndex = Math.floor(Math.random() * validAvatarNumbers.length);
        const avatarNumber = validAvatarNumbers[randomIndex];
        const avatarPath = `/assets/f${avatarNumber}.png`;
        
        // 创建干净的对象
        const virtualPlayerData = {
          playerId,
          name: randomName,
          displayName: randomName,
          ethAddress: userAddress,
          aibtoken: 10,
          isWorking: false,
          workStartTime: undefined,
          avatarPath // 使用简写语法避免重复
        };
        
        const result = await createOrUpdatePlayerMutation(virtualPlayerData);
        
        console.log("使用标准API创建虚拟用户成功:", result);
        toast.success("虚拟用户创建成功");
        
        // 延迟后刷新页面，使新创建的用户数据生效
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        
        return true;
      } catch (secondError) {
        console.error("所有创建虚拟用户的尝试均失败:", secondError);
        toast.error("创建虚拟用户失败：" + String(secondError).substring(0, 50));
        return false;
      }
    }
  }, [userAddress, createPlayerSimpleMutation, createOrUpdatePlayerMutation]);

  // 新增：检测到钱包地址时自动创建虚拟用户
  useEffect(() => {
    if (userAddress && !initComplete) {
      console.log("检测到钱包地址，尝试预创建虚拟用户:", userAddress);
      // 在获取userData之前，先尝试创建一个虚拟用户
      // 延迟执行，避免与其他操作冲突
      setTimeout(() => {
        createVirtualUser();
      }, 1500);
    }
  }, [userAddress, initComplete, createVirtualUser]);

  // 处理数据加载状态
  useEffect(() => {
    if (userAddress) {
      if (userData === undefined) {
        setLoading(true);
      } else if (userData === null) {
        setLoading(false);
        setError("User character not found for this address");
        if (!toastShown) {
          toast.error("User character not found for this address");
          setToastShown(true);
          
          // 用户不存在，尝试创建虚拟用户
          setTimeout(() => {
            createVirtualUser();
          }, 2000);
        }
      } else {
        setLoading(false);
        setError(null);
        if (!toastShown) {
          toast.success(`Welcome back, ${userData.name}!`);
          setToastShown(true);
        }
      }
    }
  }, [userData, userAddress, toastShown, createVirtualUser]);

  return (
    <SolanaWalletProvider>
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
      {/* <PoweredByConvex /> */}

      {/* 
      <ReactModal
        isOpen={helpModalOpen}
        onRequestClose={() => setHelpModalOpen(false)}
        style={modalStyles}
        contentLabel="Help modal"
        ariaHideApp={false}
      >
        <div className="font-body">
          <h1 className="text-center text-6xl font-bold font-display game-title">Help</h1>
          <p>
            Welcome to AI town. AI town supports both anonymous <i>spectators</i> and logged in{' '}
            <i>interactivity</i>.
          </p>
          <h2 className="text-4xl mt-4">Spectating</h2>
          <p>
            Click and drag to move around the town, and scroll in and out to zoom. You can click on
            an individual character to view its chat history.
          </p>
          <h2 className="text-4xl mt-4">Interactivity</h2>
          <p>
            If you log in, you can join the simulation and directly talk to different agents! After
            logging in, click the "Interact" button, and your character will appear somewhere on the
            map with a highlighted circle underneath you.
          </p>
          <p className="text-2xl mt-2">Controls:</p>
          <p className="mt-4">Click to navigate around.</p>
          <p className="mt-4">
            To talk to an agent, click on them and then click "Start conversation," which will ask
            them to start walking towards you. Once they're nearby, the conversation will start, and
            you can speak to each other. You can leave at any time by closing the conversation pane
            or moving away. They may propose a conversation to you - you'll see a button to accept
            in the messages panel.
          </p>
          <p className="mt-4">
            AI town only supports {MAX_HUMAN_PLAYERS} humans at a time. If you're idle for five
            minutes, you'll be automatically removed from the simulation.
          </p>
        </div>
      </ReactModal>
      */}

      <div className="w-full lg:h-screen min-h-screen relative isolate overflow-hidden lg:p-8 shadow-2xl flex flex-col justify-start">
          <h1 className="sm:mx-auto text-2xl p-2 pr-4 sm:text-5xl lg:text-6xl font-bold font-display leading-none tracking-wide game-title w-full text-right sm:text-center sm:w-auto">
          AI Buddy World
        </h1>

        <div className="max-w-xs md:max-w-xl lg:max-w-none mx-auto my-4 text-center lg:text-xl text-white leading-tight shadow-solid">
          <p className="text-sm sm:text-base lg:text-xl max-h-12 sm:max-h-none overflow-hidden font-medium">
            Develop your exclusive AI robot and earn AIB Tokens.
          </p>
          {/* <Unauthenticated>
            <div className="my-1.5 sm:my-0" />
            Log in to join the town
            <br className="block sm:hidden" /> and the conversation!
          </Unauthenticated> */}
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-white text-lg">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-white text-lg">{error}</div>
          </div>
        ) : (
          <Game userAddress={userAddress} userData={userData} />
        )}

        <footer className="justify-end bottom-0 left-0 w-full flex items-center mt-4 gap-3 p-6 flex-wrap pointer-events-none">
          <div className="flex gap-4 flex-grow pointer-events-none">
            {/* 注释掉所有按钮
            <FreezeButton />
            <MusicButton />
            <Button href="https://github.com/a16z-infra/ai-buddy" imgUrl={starImg}>
              Star
            </Button>
            <InteractButton />
            <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
              Help
            </Button>
            */}
          </div>
          {/* <a href="https://a16z.com">
            <img className="w-8 h-8 pointer-events-auto" src={a16zImg} alt="a16z" />
          </a>
          <a href="https://convex.dev/c/ai-buddy">
            <img className="w-20 h-8 pointer-events-auto" src={convexImg} alt="Convex" />
          </a> */}
        </footer>
        <ToastContainer 
          position="bottom-right" 
          autoClose={2000} 
          closeOnClick 
          theme="dark"
          limit={3}
          newestOnTop
          pauseOnFocusLoss={false}
        />
      </div>
    </main>
    </SolanaWalletProvider>
  );
}

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '50%',

    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
