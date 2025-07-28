import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from "../../../convex/_generated/api";
import { toast } from 'react-hot-toast';
import { Id } from '../../../convex/_generated/dataModel';

interface WorldManagerProps {
  onClose: () => void;
}

export default function WorldManager({ onClose }: WorldManagerProps) {
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [selectedWorlds, setSelectedWorlds] = useState<Set<string>>(new Set());
  
  // Mutations
  const createWorldMutation = useMutation(api.worldManager.createNewWorld);
  const registerPlayerMutation = useMutation(api.newplayer.registerPlayer);
  
  // World statistics queries
  const worlds = useQuery(api.worldManager.getWorldList);
  const allWorldsStats = useQuery(api.worldManager.getAllWorldsStats);
  
  const handleToggleWorldSelection = (worldId: string) => {
    setSelectedWorlds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(worldId)) {
        newSet.delete(worldId);
      } else {
        newSet.add(worldId);
      }
      return newSet;
    });
  };
  
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
      
      const randomName = names[Math.floor(Math.random() * names.length)];
      const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
      const fakeEthAddress = `0x${Math.random().toString(16).substring(2, 42).padEnd(40, '0')}`;
      
      // Add player to all selected worlds
      for (const worldId of selectedWorlds) {
        await registerPlayerMutation({
          worldId: worldId as Id<'worlds'>,
          name: randomName,
          ethAddress: fakeEthAddress,
          description: randomDescription,
        });
      }
      
      toast.success(`Fake player "${randomName}" added to ${selectedWorlds.size} world(s)!`);
      setSelectedWorlds(new Set()); // Clear selection
    } catch (error) {
      console.error("Error adding fake player:", error);
      toast.error("Failed to add fake player: " + String(error).substring(0, 50));
    } finally {
      setIsAddingPlayer(false);
    }
  };
  
  if (!worlds || !allWorldsStats) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Loading worlds...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-white text-lg font-semibold">World Manager</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* World Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Total Worlds</div>
          <div className="text-white text-2xl font-bold">{worlds.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Active Worlds</div>
          <div className="text-white text-2xl font-bold">
            {worlds.filter((world: any) => world.isRunning).length}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Total Players</div>
          <div className="text-white text-2xl font-bold">
            {allWorldsStats.totalPlayerCount || 0}
          </div>
        </div>
      </div>
      
      {/* Individual Worlds */}
      <div>
        <h4 className="text-white text-md font-medium mb-4">Individual Worlds:</h4>
        
        {/* World List */}
        <div className={`grid gap-3 ${worlds.length > 2 ? 'max-h-64 overflow-y-auto' : ''}`}>
          {worlds.map((world: any) => (
            <div
              key={world._id}
              onClick={() => handleToggleWorldSelection(world._id)}
              className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                selectedWorlds.has(world._id)
                  ? 'border-blue-500 bg-blue-900/20'
                  : world.isRunning
                    ? 'border-green-500 bg-green-900/20'
                    : 'border-gray-600 bg-gray-800'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-white font-medium">{world.name}</div>
                  <div className="text-gray-400 text-sm">
                    Players: {world.playerCount || 0} | 
                    Status: {world.isRunning ? 'Running' : 'Stopped'}
                  </div>
                </div>
                {selectedWorlds.has(world._id) && (
                  <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Create New World Button */}
        <div className="mt-4">
          <button
            onClick={handleCreateWorld}
            disabled={isCreatingWorld}
            className="w-full p-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg border-2 border-dashed border-gray-600 hover:border-gray-500 transition-all duration-200 flex items-center justify-center"
          >
            {isCreatingWorld ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                Creating World...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create New World
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Add Fake Player Section */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h4 className="text-white text-md font-medium mb-3">Add Fake Player</h4>
        <div className="space-y-3">
          <p className="text-gray-400 text-sm">
            Select active worlds above, then click to add a fake player to all selected worlds.
          </p>
          <button
            onClick={handleAddFakePlayer}
            disabled={isAddingPlayer || selectedWorlds.size === 0}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {isAddingPlayer ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2 inline"></div>
                Adding Player...
              </>
            ) : (
              `Add Fake Player to ${selectedWorlds.size} World(s)`
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 