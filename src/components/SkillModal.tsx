import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { SKILL_MAP } from '../../convex/constants';

interface SkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerId: string | null;
}

const SkillModal: React.FC<SkillModalProps> = ({
  isOpen,
  onClose,
  playerId,
}) => {
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Internal mode state for switching between manage and synthesis
  const [internalMode, setInternalMode] = useState<'manage' | 'synthesis'>('manage');
  
  // Synthesis states
  const [synthesisCards, setSynthesisCards] = useState<string[]>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<{
    success: boolean;
    cardId?: string;
    cardName?: string;
    cardLevel?: string;
    upgraded?: boolean;
  } | null>(null);

  // Get user's skills data
  const userSkills = useQuery(
    api.newplayer.getPlayerSkills,
    playerId ? { playerId } : 'skip'
  );

  // Get user's used skills data
  const userUsedSkills = useQuery(
    api.newplayer.getPlayerUsedSkills,
    playerId ? { playerId } : 'skip'
  );

  // Update used skills mutation
  const updateUsedSkills = useMutation(api.newplayer.updatePlayerUsedSkills);
  
  // Synthesis mutation
  const synthesizeCards = useMutation(api.newplayer.synthesizeCards);

  // Count skills for display
  const getSkillCount = (skillId: string) => {
    if (!userSkills) return 0;
    return userSkills.filter((skill: string) => skill === skillId).length;
  };

  // Check if user owns a skill
  const hasSkill = (skillId: string) => {
    return getSkillCount(skillId) > 0;
  };

  // Check if skill is currently used
  const isSkillUsed = (skillId: string) => {
    if (!userUsedSkills) return false;
    return userUsedSkills.includes(skillId);
  };

  // Check if skill is selected
  const isSkillSelected = (skillId: string) => {
    return selectedSkills.includes(skillId);
  };

  // Get available count for synthesis (excluding used and synthesis cards)
  const getAvailableCount = (skillId: string) => {
    if (!userSkills) return 0;
    const totalCount = userSkills.filter((skill: string) => skill === skillId).length;
    const usedCount = userUsedSkills?.filter((skill: string) => skill === skillId).length || 0;
    const synthesisCount = synthesisCards.filter((skill: string) => skill === skillId).length;
    return Math.max(0, totalCount - usedCount - synthesisCount);
  };

  // Check if card can be used for synthesis (has at least 2 available after excluding used)
  const canUseForSynthesis = (skillId: string) => {
    if (!userSkills) return false;
    const totalCount = userSkills.filter((skill: string) => skill === skillId).length;
    const usedCount = userUsedSkills?.filter((skill: string) => skill === skillId).length || 0;
    // Can use if there are any cards available after excluding used ones
    return (totalCount - usedCount) >= 1;
  };

  // Check if card is disabled in synthesis mode (only 1 available after excluding used)
  const isDisabledInSynthesis = (skillId: string) => {
    if (!userSkills) return true;
    const totalCount = userSkills.filter((skill: string) => skill === skillId).length;
    const usedCount = userUsedSkills?.filter((skill: string) => skill === skillId).length || 0;
    // Disabled if no cards available after excluding used ones
    return (totalCount - usedCount) <= 0;
  };

  // Handle skill selection
  const handleSkillClick = (skillId: string) => {
    if (!hasSkill(skillId)) return;
    
    // In synthesis mode, add card to synthesis instead of selecting
    if (internalMode === 'synthesis') {
      // Check if card is disabled in synthesis mode
      if (isDisabledInSynthesis(skillId)) {
        return; // Don't allow clicking disabled cards
      }
      
      if (synthesisCards.length >= 2) {
        alert('You can only add up to 2 cards for synthesis!');
        return;
      }
      if (getAvailableCount(skillId) <= 0) {
        alert('No available cards for synthesis!');
        return;
      }
      // Check if the second card is the same level as the first card
      if (synthesisCards.length === 1) {
        const firstLevel = SKILL_MAP[synthesisCards[0] as keyof typeof SKILL_MAP].level;
        const thisLevel = SKILL_MAP[skillId as keyof typeof SKILL_MAP].level;
        if (firstLevel !== thisLevel) {
          alert('Only cards of the same level can be synthesized!');
          return;
        }
      }
      handleCardToSynthesis(skillId);
      return;
    }
    
    // Normal skill selection mode
    setSelectedSkills(prev => {
      if (prev.includes(skillId)) {
        return prev.filter(id => id !== skillId);
      } else {
        return [...prev, skillId];
      }
    });
  };

  // Handle card movement to synthesis panel
  const handleCardToSynthesis = (skillId: string) => {
    if (getAvailableCount(skillId) <= 0) return;
    setSynthesisCards(prev => [...prev, skillId]);
    
    // Add hint based on synthesis cards
    const currentCards = [...synthesisCards, skillId];
    if (currentCards.length === 1) {
      const firstCard = SKILL_MAP[skillId as keyof typeof SKILL_MAP];
      // setSynthesisHint(`Selected ${firstCard.name} (${firstCard.level}). Choose another ${firstCard.level} card to synthesize.`);
    } else if (currentCards.length === 2) {
      const firstCard = SKILL_MAP[currentCards[0] as keyof typeof SKILL_MAP];
      const secondCard = SKILL_MAP[skillId as keyof typeof SKILL_MAP];
      if (firstCard.level === secondCard.level) {
        // setSynthesisHint(`Ready to synthesize! ${firstCard.name} + ${secondCard.name} (${firstCard.level} level). Click "Synthesize Cards" to proceed.`);
      } else {
        // setSynthesisHint(`Cards must be the same level! You selected ${firstCard.level} and ${secondCard.level}.`);
      }
    }
  };

  // Handle card removal from synthesis panel
  const handleRemoveFromSynthesis = (index: number) => {
    setSynthesisCards(prev => prev.filter((_, i) => i !== index));
    
    // Update hint after removal
    const remainingCards = synthesisCards.filter((_, i) => i !== index);
    if (remainingCards.length === 0) {
      // setSynthesisHint('Select cards to synthesize. Choose 2 cards of the same level.');
    } else if (remainingCards.length === 1) {
      const firstCard = SKILL_MAP[remainingCards[0] as keyof typeof SKILL_MAP];
      // setSynthesisHint(`Selected ${firstCard.name} (${firstCard.level}). Choose another ${firstCard.level} card to synthesize.`);
    }
  };

  // Handle synthesis
  const handleSynthesize = async () => {
    if (synthesisCards.length !== 2 || !playerId) return;
    setIsSynthesizing(true);
    try {
      const result = await synthesizeCards({
        playerId,
        cardIds: synthesisCards
      });
      setSynthesisResult(result);
      setSynthesisCards([]);
      // setSynthesisHint(''); // Clear hint after synthesis
    } catch (error) {
      console.error('Synthesis failed:', error);
      setSynthesisResult({ success: false });
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Handle save used skills
  const handleSaveUsedSkills = async () => {
    if (!playerId) return;
    setIsSaving(true);
    try {
      await updateUsedSkills({
        playerId,
        usedSkills: selectedSkills
      });
      onClose();
    } catch (error) {
      console.error('Failed to save used skills:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Initialize selected skills when modal opens
  React.useEffect(() => {
    if (isOpen && userUsedSkills) {
      setSelectedSkills(userUsedSkills);
      setInternalMode('manage');
      // Clear synthesis result when modal opens
      setSynthesisResult(null);
        }
  }, [isOpen, userUsedSkills]);

  // Generate skill lists by level from SKILL_MAP
  const getSkillsByLevel = (level: string) => {
    return Object.entries(SKILL_MAP)
      .filter(([_, skill]) => skill.level === level)
      .map(([skillId, skill]) => ({
        name: skill.name,
        image: skill.image,
        skillId: skillId
      }));
  };

  // Get synthesis cards info
  const getSynthesisCardsInfo = () => {
    return synthesisCards.map(skillId => {
      const skill = SKILL_MAP[skillId as keyof typeof SKILL_MAP];
      return {
        skillId,
        name: skill.name,
        image: skill.image,
        level: skill.level
      };
      });
  };

  // Check if synthesis is valid (same level, 2 cards)
  const canSynthesize = () => {
    if (synthesisCards.length !== 2) return false;
    const cardsInfo = getSynthesisCardsInfo();
    return cardsInfo[0]?.level === cardsInfo[1]?.level;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div className={`bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 p-4 flex flex-col max-h-[85vh] transition-all duration-300 ${
        internalMode === 'synthesis' ? 'max-w-7xl' : 'max-w-4xl'
      }`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
          <h2 className="text-white text-xl font-semibold">
              {internalMode === 'synthesis' ? 'Card Synthesis' : 'Your Skill Collection'}
          </h2>
            {internalMode !== 'synthesis' && (
              <div className="relative group">
                <div className="w-4 h-4 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center cursor-help transition-colors">
                  <span className="text-xs text-white font-bold">!</span>
                </div>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-4 py-3 bg-blue-900/90 text-blue-100 text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64 border border-blue-600/50">
                  <div className="text-left leading-relaxed">
                    <div className="font-semibold mb-2">How to use:</div>
                    <div className="text-xs space-y-1">
                      <div>• Click on owned skills to select/deselect them</div>
                      <div>• Yellow ✓ = Currently used</div>
                      <div>• Green ✓ = Selected for use</div>
                      <div>• Click "Save Used Skills" to apply changes</div>
                      <div>• Click + to move cards to synthesis panel</div>
                      <div>• Synthesize 2 same-level cards for a chance to upgrade</div>
                    </div>
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-blue-900/90"></div>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex gap-4 flex-1 overflow-hidden">
          {/* Left Panel - Skill Collection (always shown) */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            {/* Introduction section */}
            <div className="mb-2 p-2 bg-gray-800 rounded-md text-sm text-gray-300 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
              <h3 className="text-center font-bold text-white mb-1">Profession System</h3>
              <p className="mb-1">In Ai Buddy World, Ai Buddy can increase their salary by choosing a profession through skill learning, which is divided into three levels: Common, Rare, and Epic.</p>
              <p className="mb-1">Learning skills costs ETH and prices vary by level.</p>
              <div className="mt-1 space-y-0.5">
                <p className="text-blue-400">Common skills: Waiter, Chef, Staff (100 tokens bonus per work completion)</p>
                <p className="text-purple-400">Rare skills: Firefighter, Singer, Doctor (300 tokens bonus per work completion)</p>
                <p className="text-amber-400">Epic skills: Astronaut (1000 tokens bonus per work completion)</p>
                <p className="text-red-400">Hidden skills: Tax Officer (Participate in the distribution of fee pool)</p>
                <p className="text-gray-400">Multiple skills can be stacked for increased rewards.</p>
              </div>
            </div>
            <div className="space-y-3 my-2 overflow-y-auto flex-grow pr-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
              {/* Common */}
              <div>
                <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Common</h3>
                <div className="grid grid-cols-3 gap-3">
                  {getSkillsByLevel('Common').map((profession) => {
                    const availableCount = getAvailableCount(profession.skillId);
                    const owned = hasSkill(profession.skillId);
                    const used = isSkillUsed(profession.skillId);
                    const selected = isSkillSelected(profession.skillId);
                    const canSynthesize = canUseForSynthesis(profession.skillId);
                    const isDisabled = isDisabledInSynthesis(profession.skillId);
                    const isInSynthesis = synthesisCards.includes(profession.skillId);
                    return (
                      <div key={profession.name} className="relative">
                        <div
                          className={`bg-gray-800 p-2 rounded-md flex flex-col items-center transition-all ${
                            owned 
                              ? internalMode === 'synthesis'
                                ? isDisabled
                                  ? 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                  : isInSynthesis
                                    ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer'
                                    : canSynthesize
                                      ? 'border-2 border-blue-400 cursor-pointer'
                                      : 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                : selected 
                                  ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer' 
                                  : used 
                                    ? 'border-2 border-yellow-400 bg-yellow-900/20 cursor-pointer'
                                    : 'border-2 border-blue-400 cursor-pointer' 
                              : 'border border-gray-600'
                          }`}
                          onClick={() => handleSkillClick(profession.skillId)}
                        >
                          <img 
                            src={profession.image} 
                            alt={profession.name} 
                            className={`w-20 h-20 object-cover mb-1 ${
                              owned && !(internalMode === 'synthesis' && isDisabled) ? '' : 'grayscale opacity-50'
                            }`}
                          />
                          <span className={`text-sm text-center ${
                            owned && !(internalMode === 'synthesis' && isDisabled) ? 'text-white' : 'text-gray-500'
                          }`}>
                            {profession.name}
                          </span>
                          {availableCount > 1 && (
                            <div className={`absolute bottom-1 right-1 ${
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Common' ? 'bg-blue-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Rare' ? 'bg-purple-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Epic' ? 'bg-amber-500' :
                              'bg-red-500'
                            } text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold`}>
                              {availableCount}
                            </div>
                          )}
                          {used && !selected && (
                            <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                          {internalMode !== 'synthesis' && selected && (
                            <div className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Rare */}
              <div>
                <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Rare</h3>
                <div className="grid grid-cols-3 gap-3">
                  {getSkillsByLevel('Rare').map((profession) => {
                    const availableCount = getAvailableCount(profession.skillId);
                    const owned = hasSkill(profession.skillId);
                    const used = isSkillUsed(profession.skillId);
                    const selected = isSkillSelected(profession.skillId);
                    const canSynthesize = canUseForSynthesis(profession.skillId);
                    const isDisabled = isDisabledInSynthesis(profession.skillId);
                    const isInSynthesis = synthesisCards.includes(profession.skillId);
                    return (
                      <div key={profession.name} className="relative">
                        <div
                          className={`bg-gray-800 p-2 rounded-md flex flex-col items-center transition-all ${
                            owned 
                              ? internalMode === 'synthesis'
                                ? isDisabled
                                  ? 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                  : isInSynthesis
                                    ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer'
                                    : canSynthesize
                                      ? 'border-2 border-purple-400 cursor-pointer'
                                      : 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                : selected 
                                  ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer' 
                                  : used 
                                    ? 'border-2 border-yellow-400 bg-yellow-900/20 cursor-pointer'
                                    : 'border-2 border-purple-400 cursor-pointer' 
                              : 'border border-gray-600'
                          }`}
                          onClick={() => handleSkillClick(profession.skillId)}
                        >
                          <img 
                            src={profession.image} 
                            alt={profession.name} 
                            className={`w-20 h-20 object-cover mb-1 ${
                              owned && !(internalMode === 'synthesis' && isDisabled) ? '' : 'grayscale opacity-50'
                            }`}
                          />
                          <span className={`text-sm text-center ${
                            owned && !(internalMode === 'synthesis' && isDisabled) ? 'text-white' : 'text-gray-500'
                          }`}>
                            {profession.name}
                          </span>
                          {availableCount > 1 && (
                            <div className={`absolute bottom-1 right-1 ${
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Common' ? 'bg-blue-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Rare' ? 'bg-purple-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Epic' ? 'bg-amber-500' :
                              'bg-red-500'
                            } text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold`}>
                              {availableCount}
                            </div>
                          )}
                          {used && !selected && (
                            <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                          {internalMode !== 'synthesis' && selected && (
                            <div className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Epic */}
              <div>
                <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Epic</h3>
                <div className="grid grid-cols-3 gap-3">
                  {getSkillsByLevel('Epic').map((profession) => {
                    const availableCount = getAvailableCount(profession.skillId);
                    const owned = hasSkill(profession.skillId);
                    const used = isSkillUsed(profession.skillId);
                    const selected = isSkillSelected(profession.skillId);
                    const canSynthesize = canUseForSynthesis(profession.skillId);
                    const isDisabled = isDisabledInSynthesis(profession.skillId);
                    const isInSynthesis = synthesisCards.includes(profession.skillId);
                    return (
                      <div key={profession.name} className="relative">
                        <div
                          className={`bg-gray-800 p-2 rounded-md flex flex-col items-center transition-all ${
                            owned 
                              ? internalMode === 'synthesis'
                                ? isDisabled
                                  ? 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                  : isInSynthesis
                                    ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer'
                                    : canSynthesize
                                      ? 'border-2 border-amber-400 cursor-pointer'
                                      : 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                : selected 
                                  ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer' 
                                  : used 
                                    ? 'border-2 border-yellow-400 bg-yellow-900/20 cursor-pointer'
                                    : 'border-2 border-amber-400 cursor-pointer' 
                              : 'border border-gray-600'
                          }`}
                          onClick={() => handleSkillClick(profession.skillId)}
                        >
                          <img 
                            src={profession.image} 
                            alt={profession.name} 
                            className={`w-20 h-20 object-cover mb-1 ${
                              owned && !(internalMode === 'synthesis' && isDisabled) ? '' : 'grayscale opacity-50'
                            }`}
                          />
                          <span className={`text-sm text-center ${
                            owned && !(internalMode === 'synthesis' && isDisabled) ? 'text-white' : 'text-gray-500'
                          }`}>
                            {profession.name}
                          </span>
                          {availableCount > 1 && (
                            <div className={`absolute bottom-1 right-1 ${
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Common' ? 'bg-blue-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Rare' ? 'bg-purple-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Epic' ? 'bg-amber-500' :
                              'bg-red-500'
                            } text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold`}>
                              {availableCount}
                            </div>
                          )}
                          {used && !selected && (
                            <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                          {internalMode !== 'synthesis' && selected && (
                            <div className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Hidden */}
              <div>
                <h3 className="text-lg font-medium text-gray-200 mb-1 sticky top-0 bg-gray-900 py-0.5 z-10">Hidden</h3>
                <div className="grid grid-cols-3 gap-3">
                  {getSkillsByLevel('Hidden').map((profession) => {
                    const availableCount = getAvailableCount(profession.skillId);
                    const owned = hasSkill(profession.skillId);
                    const used = isSkillUsed(profession.skillId);
                    const selected = isSkillSelected(profession.skillId);
                    const canSynthesize = canUseForSynthesis(profession.skillId);
                    const isDisabled = isDisabledInSynthesis(profession.skillId);
                    const isInSynthesis = synthesisCards.includes(profession.skillId);
                    return (
                      <div key={profession.name} className="relative">
                        <div className={`bg-gray-800 p-2 rounded-md flex flex-col items-center transition-all ${
                            owned 
                              ? internalMode === 'synthesis'
                                ? isDisabled
                                  ? 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                  : isInSynthesis
                                    ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer'
                                    : canSynthesize
                                      ? 'border-2 border-red-400 cursor-pointer'
                                      : 'border-2 border-gray-500 opacity-50 cursor-not-allowed'
                                : selected 
                                  ? 'border-2 border-green-400 bg-green-900/20 cursor-pointer' 
                                  : used 
                                    ? 'border-2 border-yellow-400 bg-yellow-900/20 cursor-pointer'
                                    : 'border-2 border-red-400 cursor-pointer' 
                              : 'border border-gray-600'
                          }`}
                          onClick={() => handleSkillClick(profession.skillId)}
                        >
                          <img 
                            src={profession.image} 
                            alt={profession.name} 
                            className={`w-20 h-20 object-cover mb-1 ${
                              owned && !(internalMode === 'synthesis' && isDisabled) ? '' : 'grayscale opacity-50'
                            }`}
                          />
                          <span className={`text-sm text-center ${
                            owned && !(internalMode === 'synthesis' && isDisabled) ? 'text-white' : 'text-gray-500'
                          }`}>
                            {profession.name}
                          </span>
                          {availableCount > 1 && (
                            <div className={`absolute bottom-1 right-1 ${
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Common' ? 'bg-blue-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Rare' ? 'bg-purple-500' :
                              SKILL_MAP[profession.skillId as keyof typeof SKILL_MAP].level === 'Epic' ? 'bg-amber-500' :
                              'bg-red-500'
                            } text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold`}>
                              {availableCount}
                            </div>
                          )}
                          {used && !selected && (
                            <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                          {internalMode !== 'synthesis' && selected && (
                            <div className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              ✓
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>

          {/* Synthesis Panel (only shown in synthesis mode) */}
          {internalMode === 'synthesis' && (
            <div className="w-80 bg-gray-800 rounded-lg p-4 flex flex-col">
              <h3 className="text-white text-lg font-semibold mb-4 text-center">Card Synthesis</h3>
              {/* Synthesis Info */}
              <div className="mb-4 p-3 bg-gray-700 rounded-md text-sm text-gray-300">
                <div className="font-semibold mb-2">Synthesis Rules:</div>
                <div className="space-y-1 text-xs">
                  <div>• Need 2 cards of the same level</div>
                  <div>• 20% chance to upgrade to next level</div>
                  <div>• Click cards to add them to synthesis</div>
                  <div>• Only cards with quantity ≥ 2 can be used</div>
                </div>
              </div>
              {/* Synthesis Hint */}
              {/* {synthesisHint && (
                <div className="mb-4 p-3 bg-blue-900/50 border border-blue-500 rounded-md text-sm text-blue-200">
                  <div className="font-semibold mb-1">💡 Hint:</div>
                  <div className="text-xs">{synthesisHint}</div>
                </div>
              )} */}
              {/* Synthesis Slots */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1].map((index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-3 min-h-32 flex flex-col items-center justify-center">
                      {synthesisCards[index] ? (
                        <div className="relative">
                          <button
                            onClick={() => handleRemoveFromSynthesis(index)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold hover:bg-red-600"
                          > × </button>
                          <img 
                            src={SKILL_MAP[synthesisCards[index] as keyof typeof SKILL_MAP]?.image} 
                            alt={SKILL_MAP[synthesisCards[index] as keyof typeof SKILL_MAP]?.name} 
                            className="w-16 h-16 object-cover mb-2"
                          />
                          <span className="text-xs text-white text-center">
                            {SKILL_MAP[synthesisCards[index] as keyof typeof SKILL_MAP]?.name}
                          </span>
                        </div>
                      ) : (
                        <div className="text-gray-500 text-sm text-center">
                          Empty Slot
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Synthesis Button */}
                <button 
                  onClick={handleSynthesize}
                  disabled={!canSynthesize() || isSynthesizing}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-md font-medium transition-all duration-300 disabled:cursor-not-allowed"
                >
                  {isSynthesizing ? 'Synthesizing...' : 'Synthesize Cards'}
                </button>
                {/* Synthesis Result */}
                {synthesisResult && (
                  <div className={`p-3 rounded-md text-center ${
                    synthesisResult.success ? 'bg-green-900/50 border border-green-500' : 'bg-red-900/50 border border-red-500'
                  }`}>
                    {synthesisResult.success ? (
                      <div>
                        <div className={`font-semibold mb-2 ${synthesisResult.upgraded ? 'text-green-400' : 'text-blue-400'}`}>
                          {synthesisResult.upgraded ? '🎉 UPGRADED!' : 'Synthesis Successful!'}
                        </div>
                        <div className="text-white text-sm">
                          You got: {synthesisResult.cardName}
                        </div>
                        <div className="text-gray-300 text-xs">
                          Level: {synthesisResult.cardLevel}
                        </div>
                      </div>
                    ) : (
                      <div className="text-red-400 font-semibold">
                        Synthesis Failed
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
            
        {/* Bottom Buttons */}
        {internalMode !== 'synthesis' && (
          <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-gray-700">
            <button
              onClick={handleSaveUsedSkills}
              disabled={isSaving}
              className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Used Skills'}
            </button>
            <button
              onClick={() => {
                setInternalMode('synthesis');
                // setSynthesisHint('Select cards to synthesize. Choose 2 cards of the same level.');
              }}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-sm font-medium transition-colors"
            >
              Synthesis
            </button>
            <button
              onClick={() => {
                onClose();
                setSynthesisResult(null);
              }}
              className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm font-medium"
            >
              Close
            </button>
          </div>
        )}
        {internalMode === 'synthesis' && (
          <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-gray-700">
            <button
              onClick={() => {
                setInternalMode('manage');
                setSynthesisResult(null); // Clear synthesis result when switching back
                // setSynthesisHint(''); // Clear hint when switching back
              }}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
            >
              Back to Skills
            </button>
            <button
            onClick={() => {
              onClose();
              setSynthesisResult(null);
            }}
            className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm font-medium"
            >
              Close
            </button>
          </div>
        )}
        </div>
    </div>
  );
};

export default SkillModal; 