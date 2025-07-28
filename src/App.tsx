import Game from './components/Game.tsx';
import SolanaWalletProvider from './components/SolanaWalletProvider.tsx';
import WorldSelector from './components/WorldSelector.tsx';
import AdminTools from './components/admin/AdminTools.tsx';

import { ToastContainer } from 'react-toastify';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
// import { useConvex } from 'convex/react';

export default function Home() {
  const [error, setError] = useState<string | null>(null);
  const [selectedWorldId, setSelectedWorldId] = useState<Id<'worlds'> | null>(null);

  const worlds = useQuery(api.worldManager.getWorldList);
  const heartbeatWorld = useMutation(api.world.heartbeatWorld);

  // when world list is loaded and no world is selected, automatically select the first world
  useEffect(() => {
    if (worlds && worlds.length > 0 && !selectedWorldId) {
      setSelectedWorldId(worlds[0].worldId);
    }
  }, [worlds, selectedWorldId]);

  // handle world switch, including automatic restart of inactive worlds
  const handleWorldChange = async (worldId: Id<'worlds'>) => {
    // find target world
    const targetWorld = worlds?.find(w => w.worldId === worldId);
    
    if (targetWorld?.status === 'inactive') {
      // if world is inactive, try to restart it
      try {
        await heartbeatWorld({ worldId });
        console.log(`Restarting inactive world ${worldId}...`);
      } catch (error) {
        console.error(`Failed to restart world ${worldId}:`, error);
      }
    }
    
    setSelectedWorldId(worldId);
  };

  // const convex = useConvex();

  return (
    <SolanaWalletProvider>
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">

      <div className="w-full lg:h-screen min-h-screen relative isolate overflow-hidden lg:p-8 shadow-2xl flex flex-col justify-start">
          <h1 className="sm:mx-auto text-2xl p-2 pr-4 sm:text-5xl lg:text-6xl font-bold font-display leading-none tracking-wide game-title w-full text-right sm:text-center sm:w-auto">
          AI Buddy World
        </h1>

        <div className="max-w-xs md:max-w-xl lg:max-w-none mx-auto my-4 text-center lg:text-xl text-white leading-tight shadow-solid">
          <p className="text-sm sm:text-base lg:text-xl max-h-12 sm:max-h-none overflow-hidden font-medium">
            Develop your exclusive AI robot and earn AIB Tokens.
          </p>
        </div>

        {error ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-white text-lg">{error}</div>
          </div>
        ) : (
          <div>
            {/* Admin Tools - only visible in development */}
            <AdminTools />
            
            {/* world selector */}
            <div className="flex justify-start mb-0">
              <WorldSelector
                currentWorldId={selectedWorldId}
                onWorldChange={handleWorldChange}
                ethAddress=""
                isLoggedIn={false}
              />
            </div>
            <Game selectedWorldId={selectedWorldId} onWorldChange={setSelectedWorldId} />
          </div>
        )}

        <footer className="justify-end bottom-0 left-0 w-full flex items-center mt-4 gap-3 p-6 flex-wrap pointer-events-none">
          <div className="flex gap-4 flex-grow pointer-events-none">
          </div>
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