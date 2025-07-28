import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from "../../../convex/_generated/api";
import { toast } from 'react-hot-toast';
import SkillModal from '../SkillModal';
import EditProfileModal from '../EditProfileModal';
import BlindBox from '../BlindBox';
import WorksListModal from '../WorksListModal';
import RandomEventModal from '../RandomEventModal';
import { SKILL_MAP, DEFAULT_SKILL_INFO, WORK_DURATION } from '../../../convex/constants';

interface PlayerManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlayerManager({ isOpen, onClose }: PlayerManagerProps) {
  const [selectedPlayerForSkills, setSelectedPlayerForSkills] = useState<any>(null);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [selectedPlayerForEdit, setSelectedPlayerForEdit] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPlayerForBlindBox, setSelectedPlayerForBlindBox] = useState<any>(null);
  const [showBlindBoxModal, setShowBlindBoxModal] = useState(false);
  const [selectedPlayerForWorksList, setSelectedPlayerForWorksList] = useState<any>(null);
  const [showWorksListModal, setShowWorksListModal] = useState(false);
  const [selectedPlayerForRandomEvent, setSelectedPlayerForRandomEvent] = useState<any>(null);
  const [showRandomEventModal, setShowRandomEventModal] = useState(false);
  const [countdowns, setCountdowns] = useState<{ [playerId: string]: number }>({});
  const [countdownIntervals, setCountdownIntervals] = useState<{ [playerId: string]: NodeJS.Timeout }>({});
  
  // Get all players
  const allPlayers = useQuery(api.newplayer.getAllPlayers);
  
  // start work mutation
  const startWorkMutation = useMutation(api.newplayer.startWork);
  
  const handleOpenSkillsModal = (player: any) => {
    setSelectedPlayerForSkills(player);
    setShowSkillsModal(true);
  };
  
  const handleCloseSkillsModal = () => {
    setShowSkillsModal(false);
    setSelectedPlayerForSkills(null);
  };

  const handleOpenEditModal = (player: any) => {
    setSelectedPlayerForEdit(player);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedPlayerForEdit(null);
  };

  const handleOpenBlindBoxModal = (player: any) => {
    setSelectedPlayerForBlindBox(player);
    setShowBlindBoxModal(true);
  };

  const handleCloseBlindBoxModal = () => {
    setShowBlindBoxModal(false);
    setSelectedPlayerForBlindBox(null);
  };

  const handleOpenWorksListModal = (player: any) => {
    setSelectedPlayerForWorksList(player);
    setShowWorksListModal(true);
  };

  const handleCloseWorksListModal = () => {
    setShowWorksListModal(false);
    setSelectedPlayerForWorksList(null);
  };

  const handleOpenRandomEventModal = (player: any) => {
    setSelectedPlayerForRandomEvent(player);
    setShowRandomEventModal(true);
  };

  const handleCloseRandomEventModal = () => {
    setShowRandomEventModal(false);
    setSelectedPlayerForRandomEvent(null);
  };
  
  // Get skill info function
  const getSkillInfo = (skillId: string) => {
    return SKILL_MAP[skillId as keyof typeof SKILL_MAP] || DEFAULT_SKILL_INFO;
  };

  // Countdown effect for working players - individual timers
  useEffect(() => {
    if (!allPlayers) return;

    // Clear all existing intervals
    Object.values(countdownIntervals).forEach(interval => clearInterval(interval));
    setCountdownIntervals({});

    const workingPlayers = allPlayers.filter(player => player.isWorking);
    if (workingPlayers.length === 0) {
      setCountdowns({});
      return;
    }

    const newIntervals: { [playerId: string]: NodeJS.Timeout } = {};

          workingPlayers.forEach(player => {
        const interval = setInterval(() => {
          const now = Date.now();
          const workStartTime = player.workStartTime || now;
          const elapsed = now - workStartTime;
          const remaining = Math.max(0, WORK_DURATION - elapsed);

        setCountdowns(prev => ({
          ...prev,
          [player.playerId]: remaining > 0 ? remaining : 0
        }));

        // Clear interval when countdown reaches 0
        if (remaining <= 0) {
          clearInterval(interval);
          setCountdownIntervals(prev => {
            const newIntervals = { ...prev };
            delete newIntervals[player.playerId];
            return newIntervals;
          });
        }
      }, 1000);

      newIntervals[player.playerId] = interval;
    });

    setCountdownIntervals(newIntervals);

    // Cleanup function
    return () => {
      Object.values(newIntervals).forEach(interval => clearInterval(interval));
    };
  }, [allPlayers]);

  // Format countdown time
  const formatCountdown = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const handleStartWorking = async (player: any) => {
    if (player.isWorking) {
      console.log("[PlayerManager] user is already working, cannot start again");
      return;
    }
    
    try {
      console.log("[PlayerManager] start working");
      
      const result = await startWorkMutation({
        worldId: player.worldId,
        ethAddress: player.ethAddress
      });
      
      if (result.success) {
        toast.success("Work started!");
        console.log("[PlayerManager] work started successfully");
        
        // Start countdown immediately for this player
        const now = Date.now();
        setCountdowns(prev => ({
          ...prev,
          [player.playerId]: WORK_DURATION
        }));
        
        // Create individual interval for this player
        const interval = setInterval(() => {
          setCountdowns(prev => {
            const current = prev[player.playerId] || 0;
            const newTime = Math.max(0, current - 1000);
            
            if (newTime <= 0) {
              clearInterval(interval);
              setCountdownIntervals(prevIntervals => {
                const newIntervals = { ...prevIntervals };
                delete newIntervals[player.playerId];
                return newIntervals;
              });
            }
            
            return {
              ...prev,
              [player.playerId]: newTime
            };
          });
        }, 1000);
        
        setCountdownIntervals(prev => ({
          ...prev,
          [player.playerId]: interval
        }));
      } else {
        toast.error("Failed to start work");
      }
    } catch (error) {
      console.error("[PlayerManager] start work failed:", error);
      toast.error("Failed to start work, please try again");
    }
  };
  
  if (!isOpen) {
    return null;
  }
  
  if (!allPlayers) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Loading players...</p>
      </div>
    );
  }
  
  if (allPlayers.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 text-4xl mb-4">👥</div>
        <p className="text-gray-400 text-lg">No players found</p>
        <p className="text-gray-500 text-sm mt-2">Create some fake players first</p>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-white text-xl font-semibold">Player Manager</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      
        {/* Player List - Table Format */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Player</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">playerID/worldID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Token</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Events</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Work</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Skills</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Blind Box</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">More</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {allPlayers.map((player: any) => (
                      <tr key={player._id} className="hover:bg-gray-750">
                        <td className="px-4 py-4">
                          <div className="flex items-center">
                            <img 
                              src={player.avatarPath} 
                              alt={player.name}
                              className="w-10 h-10 rounded-full object-cover mr-3"
                            />
                            <div>
                              <div className="text-white font-medium">{player.name}</div>
                              <div className="text-gray-400 text-xs">0x{player.ethAddress.substring(2, 6)}...{player.ethAddress.substring(player.ethAddress.length - 3)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-300 text-sm">
                          <div className="flex flex-col">
                            <div className="text-xs">{player.playerId}</div>
                            <div className="text-xs text-gray-400">{player.worldId.substring(0, 4)}...{player.worldId.substring(player.worldId.length - 4)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-300 text-sm">
                          {/* TODO: Get actual token amount from player data */}
                          {player.aibtoken || 0}
                        </td>
                        <td className="px-4 py-4 text-gray-300 text-sm">
                          {player.randomEventCount}
                        </td>
                        <td className="px-4 py-4">
                          {player.isWorking ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="inline-flex items-center px-3 py-1 text-xs font-medium rounded transition-colors bg-blue-600 text-white">
                                Working
                              </div>
                              {countdowns[player.playerId] && (
                                <div className="text-xs text-blue-400 font-mono">
                                  {formatCountdown(countdowns[player.playerId])}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartWorking(player)}
                              className="px-3 py-1 text-xs rounded transition-colors bg-green-600 hover:bg-green-700 text-white"
                            >
                              Start
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-start gap-2">
                            {/* Display selected skills icons */}
                            <div className="flex flex-wrap gap-1" style={{ width: '80px' }}>
                              {player.usedSkills && player.usedSkills.length > 0 ? (
                                player.usedSkills
                                  .map((skillId: string) => ({ skillId, ...getSkillInfo(skillId) }))
                                  .sort((a: any, b: any) => b.levelOrder - a.levelOrder)
                                  .map((skillInfo: any, index: number) => (
                                    <div
                                      key={index}
                                      className="relative group cursor-pointer"
                                      title={skillInfo.name}
                                    >
                                      <div className="w-4 h-4 flex items-center justify-center transition-all duration-200 hover:scale-110">
                                        <img 
                                          src={skillInfo.image} 
                                          alt={skillInfo.name}
                                          className="w-4 h-4 object-cover rounded"
                                        />
                                      </div>
                                      {/* tooltip */}
                                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                                        {skillInfo.name}
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                                      </div>
                                    </div>
                                  ))
                              ) : (
                                <span className="text-gray-500 text-xs">No skills</span>
                              )}
                            </div>
                            
                            {/* Skills selection button */}
                            <button 
                              onClick={() => handleOpenSkillsModal(player)}
                              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                            >
                              Select
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button 
                            onClick={() => handleOpenBlindBoxModal(player)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors"
                          >
                            Open
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1 text-xs">
                            <button 
                              onClick={() => handleOpenEditModal(player)}
                              className="text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              Edit
                            </button>
                            <span className="text-gray-500">/</span>
                            <button 
                              onClick={() => handleOpenWorksListModal(player)}
                              className="text-orange-400 hover:text-orange-300 transition-colors"
                            >
                              Work
                            </button>
                            <span className="text-gray-500">/</span>
                            <button 
                              onClick={() => handleOpenRandomEventModal(player)}
                              className="text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              Event
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Skills Modal */}
      <SkillModal
        isOpen={showSkillsModal}
        onClose={handleCloseSkillsModal}
        playerId={selectedPlayerForSkills?.playerId || null}
      />
      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        userData={selectedPlayerForEdit}
        worldId={selectedPlayerForEdit?.worldId}
      />
      {/* Blind Box Modal */}
      <BlindBox
        isOpen={showBlindBoxModal}
        onClose={handleCloseBlindBoxModal}
        playerId={selectedPlayerForBlindBox?.playerId || null}
        ethAddress={selectedPlayerForBlindBox?.ethAddress || null}
        worldId={selectedPlayerForBlindBox?.worldId || null}
      />
      {/* Works List Modal */}
      <WorksListModal
        isOpen={showWorksListModal}
        onClose={handleCloseWorksListModal}
        worldId={selectedPlayerForWorksList?.worldId}
        playerId={selectedPlayerForWorksList?.playerId}
      />
      {/* Random Event Modal */}
      <RandomEventModal
        isOpen={showRandomEventModal}
        onClose={handleCloseRandomEventModal}
        worldId={selectedPlayerForRandomEvent?.worldId}
        playerId={selectedPlayerForRandomEvent?.playerId}
      />
    </div>
  );
} 