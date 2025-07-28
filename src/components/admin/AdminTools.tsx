import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from "../../../convex/_generated/api";
import { toast } from 'react-hot-toast';
import { Id } from '../../../convex/_generated/dataModel';
import PlayerManager from './PlayerManager';

export default function AdminTools() {
  // Only show admin tools in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const [isOpen, setIsOpen] = useState(false);
  
  // New states for admin tools
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [selectedWorlds, setSelectedWorlds] = useState<Set<string>>(new Set());
    
  // New mutations for admin tools
  const createWorldMutation = useMutation(api.worldManager.createNewWorld);
  const registerPlayerMutation = useMutation(api.newplayer.registerPlayer);
  
  // World statistics queries
  const worlds = useQuery(api.worldManager.getWorldList);
  const allWorldsStats = useQuery(api.worldManager.getAllWorldsStats);
  
  // Add fake player
  const handleAddFakePlayer = async () => {
    if (isAddingPlayer) return;
    
    // Check if any worlds are selected
    if (selectedWorlds.size === 0) {
      toast.error("Please select at least one active world first");
      return;
    }
    
    setIsAddingPlayer(true);
    try {
      toast.loading(`Adding fake player to ${selectedWorlds.size} world(s)...`);
      
      // Generate fake player data
      const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
      const descriptions = [
        'A friendly explorer who loves to discover new places and meet interesting people.',
        'A creative artist who finds inspiration in every corner of the world.',
        'A wise mentor who enjoys sharing knowledge and helping others grow.',
        'A cheerful optimist who always sees the bright side of life.',
        'A curious scientist who loves to experiment and learn new things.',
        'A passionate musician who finds rhythm in the world around them.',
        'A caring friend who always puts others first and spreads kindness.',
        'A brave adventurer who faces challenges with courage and determination.',
        'A thoughtful philosopher who contemplates the deeper meaning of life.',
        'A skilled craftsman who creates beautiful things with their hands.'
      ];

      // Add player to all selected worlds
      for (const worldId of selectedWorlds) {
        const randomName = names[Math.floor(Math.random() * names.length)];
        const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
        const fakeEthAddress = `0x${Math.random().toString(16).substring(2, 42).padEnd(40, '0')}`;
        await registerPlayerMutation({
          worldId: worldId as Id<'worlds'>,
          name: randomName,
          ethAddress: fakeEthAddress,
          description: randomDescription,
        });
        toast.success(`Fake player "${randomName}" added to ${selectedWorlds.size} world(s)!`);
      }
      setSelectedWorlds(new Set()); // Clear selection
    } catch (error) {
      console.error("Error adding fake player:", error);
      toast.error("Failed to add fake player: " + String(error).substring(0, 50));
    } finally {
      setIsAddingPlayer(false);
    }
  };

  // Create new world
  const handleCreateWorld = async () => {
    if (isCreatingWorld) return;
    
    setIsCreatingWorld(true);
    try {
      toast.loading("Creating new world...");
      const result = await createWorldMutation();
      
      if (result.success) {
        toast.success("World created successfully!");
      } else {
        toast.error("Failed to create world");
      }
    } catch (error) {
      console.error("Error creating world:", error);
      toast.error("Failed to create world: " + String(error).substring(0, 50));
    } finally {
      setIsCreatingWorld(false);
    }
  };
  
  return (
    <>
      {/* Admin Button - Fixed in top-left corner */}
      <div className="fixed top-0 left-0 z-20">
        <button 
          className="bg-slate-800 text-white p-2 self-start h-10 flex items-center justify-center w-32"
          onClick={() => setIsOpen(true)}
        >
          <span className="mr-2">⚙️</span>
          <span className="font-medium">Admin</span>
        </button>
      </div>

      {/* Admin Drawer - Slides in from left */}
      <div className={`fixed left-0 top-0 h-screen z-30 flex flex-col transition-all duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } w-96`}>
        <div className="flex flex-col h-full bg-gray-900 shadow-lg overflow-hidden">
          {/* Header with title and close button */}
          <div className="bg-gray-700 py-3 px-4 text-white font-medium border-b border-gray-600 flex justify-between items-center">
            <span>Admin Tools</span>
            <button 
              className="text-white hover:text-gray-300 flex items-center justify-center transition-colors"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>
          
          {/* Admin tools content */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* World Statistics */}
              <div className="bg-gray-800 p-4 rounded-md">
                <h3 className="text-lg font-medium mb-2 text-white">World Statistics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">Total Worlds:</span>
                    <span className="text-blue-400 font-medium">
                      {worlds && worlds.length > 0 ? `${worlds.length} Worlds` : 'Loading...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">All Worlds:</span>
                    <span className="text-green-400 font-medium">
                      {allWorldsStats ? `${allWorldsStats.totalAgentCount} Bots, ${allWorldsStats.totalPlayerCount} Players` : 'Loading...'}
                    </span>
                  </div>
                  
                  {/* Individual World Details */}
                  <div className="mt-4">
                    <div className="text-gray-300 mb-2 font-medium">Individual Worlds:</div>
                    <div className={`grid grid-cols-1 gap-3 ${
                      worlds && worlds.length > 2 ? 'max-h-64 overflow-y-auto custom-scrollbar' : ''
                    }`}>
                      {worlds && worlds.map((world, index) => (
                        <div 
                          key={world.worldId} 
                          className={`p-4 rounded-lg border-2 transition-all duration-200 relative ${
                            world.status === 'running' 
                              ? selectedWorlds.has(world.worldId) 
                                ? 'border-blue-500 bg-blue-900/20 cursor-pointer' 
                                : 'border-green-500 bg-gray-800 hover:border-green-400 cursor-pointer'
                              : world.status === 'stoppedByDeveloper' 
                                ? 'border-red-500 bg-gray-800' 
                                : 'border-yellow-500 bg-gray-800'
                          }`}
                          onClick={() => {
                            if (world.status === 'running') {
                              const newSelected = new Set(selectedWorlds);
                              if (newSelected.has(world.worldId)) {
                                newSelected.delete(world.worldId);
                              } else {
                                newSelected.add(world.worldId);
                              }
                              setSelectedWorlds(newSelected);
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400 text-sm">#{index + 1}</span>
                              <div>
                                <div className="text-white font-medium">
                                  {world.worldId.substring(0, 8)}...
                                </div>
                                <div className="text-gray-400 text-xs">
                                  World ID
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-center">
                                <div className="text-green-400 font-semibold text-lg">
                                  {world.playerCount || 0}
                                </div>
                                <div className="text-gray-400 text-xs">
                                  Players
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-300 font-semibold">
                                  {world.maxPlayers}
                                </div>
                                <div className="text-gray-400 text-xs">
                                  Max
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Create World Button Card */}
                      <div 
                        className="p-4 rounded-lg border-2 border-dashed border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-700 cursor-pointer transition-all duration-200"
                        onClick={handleCreateWorld}
                      >
                        <div className="flex justify-center items-center">
                          <div className="text-center">
                            <div className="text-gray-400 text-2xl mb-2">+</div>
                            <div className="text-white font-medium">
                              Create New World
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Add Fake Player */}
              <div className="bg-gray-800 p-4 rounded-md">
                <h3 className="text-lg font-medium mb-2 text-white">Add Fake Player</h3>
                <p className="text-gray-400 mb-4 text-sm">
                  Select active worlds above, then generate a fake player with random name, description, and avatar (f1-f8)
                </p>
                
                <div className="mb-3">
                  <div className="text-sm text-gray-300">
                    Selected: {selectedWorlds.size} world(s)
                  </div>
                </div>
                
                <button
                  onClick={handleAddFakePlayer}
                  disabled={isAddingPlayer || selectedWorlds.size === 0}
                  className={`w-full py-2 px-4 rounded-md ${
                    isAddingPlayer || selectedWorlds.size === 0
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  } text-white font-medium transition-colors`}
                >
                  {isAddingPlayer ? "Adding..." : selectedWorlds.size === 0 ? "Select Worlds First" : "Add Fake Player"}
                </button>
              </div>

              {/* Manage Players */}
              <div className="bg-gray-800 p-4 rounded-md">
                <h3 className="text-lg font-medium mb-2 text-white">Manage Players</h3>
                <p className="text-gray-400 mb-4 text-sm">
                  View and control fake players (rename, change avatar, work, skills, blind box)
                </p>
                
                <button
                  onClick={() => setShowPlayerManager(true)}
                  className="w-full py-2 px-4 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                >
                  Open Player Manager
                </button>
              </div>              
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop overlay - only show when admin panel is open */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Player Manager Modal */}
      <PlayerManager isOpen={showPlayerManager} onClose={() => setShowPlayerManager(false)} />
    </>
  );
}