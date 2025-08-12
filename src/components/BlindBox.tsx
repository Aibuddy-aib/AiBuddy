import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { Id } from '../../convex/_generated/dataModel';

interface BlindBoxProps {
  isOpen: boolean;
  onClose: () => void;
  playerId?: string | null;
  ethAddress?: string | null;
  worldId?: Id<'worlds'> | null;
}

interface Card {
  id: string;
  name: string;
  level: number;
  image: string;
}

const BlindBox: React.FC<BlindBoxProps> = ({ isOpen, onClose, playerId, ethAddress, worldId }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [showTenDrawResult, setShowTenDrawResult] = useState(false);
  
  // Animation states
  const [animationState, setAnimationState] = useState<'idle' | 'shaking' | 'opening' | 'revealing'>('idle');
  const [currentImage, setCurrentImage] = useState('/assets/blindbox/blindbox.png');
  const [tenDrawCardsVisible, setTenDrawCardsVisible] = useState<boolean[]>([]);

  // draw card mutation
  const drawCardTransactionMutation = useMutation(api.newplayer.drawCardTransaction);

  const startShakeAnimation = () => {
    setAnimationState('shaking');
    setCurrentImage('/assets/blindbox/blindbox-only.png');
    
    // Shake animation lasts 2 seconds
    setTimeout(() => {
      setAnimationState('opening');
      
      // Show "Opening..." for 1 second
      setTimeout(() => {
        setAnimationState('revealing');
      }, 1000);
    }, 2000);
  };

  // Refactored draw logic to eliminate duplicate code
  const handleDraw = async (drawType: 'single' | 'ten') => {
    if (isAnimating || !playerId) return;
    
    setIsAnimating(true);
    startShakeAnimation();
    
    try {
      const result = await drawCardTransactionMutation({
        playerId: playerId,
        drawType: drawType,
        ethAddress: ethAddress!,
        worldId: worldId!
      });
      
      if (result.success && result.drawnCards && result.drawnCards.length > 0) {
        // Convert server return card data to frontend format
        const frontendCards: Card[] = result.drawnCards.map(drawnCard => ({
          id: drawnCard.id,
          name: drawnCard.name,
          level: drawnCard.level,
          image: `/assets/blindbox/${drawnCard.id}_card.png`
        }));
        
        if (drawType === 'single') {
          const frontendCard = frontendCards[0];
          
          // Wait for opening animation to complete before showing result
          setTimeout(() => {
            setSelectedCard(frontendCard);
            
            // Show result after card scale-up animation completes
            setTimeout(() => {
              setShowResult(true);
              setAnimationState('idle');
              setCurrentImage('/assets/blindbox/blindbox.png');
            }, 500);
          }, 1000);
          
          const levelNames = ['', 'Common', 'Rare', 'Epic', 'Hidden'];
          if (frontendCard.level === 4) {
            toast.success(`🎉 LEGENDARY! You got the ultra-rare ${frontendCard.name}!`, {
              duration: 5000,
              style: {
                background: 'linear-gradient(90deg, #ef4444, #dc2626, #b91c1c)',
                color: 'white',
                fontWeight: 'bold',
              },
            });
          } else {
            toast.success(`Congratulations! You got a ${levelNames[frontendCard.level]} ${frontendCard.name}!`);
          }
        } else {
          // Ten draw logic
          // Wait for opening animation to complete before showing result
          setTimeout(() => {
            setSelectedCards(frontendCards);
            setShowTenDrawResult(true);
            setAnimationState('idle');
            setCurrentImage('/assets/blindbox/blindbox.png');
            
            // Show cards one by one for smooth presentation effect
            const cardVisibility = new Array(frontendCards.length).fill(false);
            setTenDrawCardsVisible(cardVisibility);
            
            // Show one card every 300ms so users can clearly see each card appear
            frontendCards.forEach((_, index) => {
              setTimeout(() => {
                setTenDrawCardsVisible(prev => {
                  const newVisibility = [...prev];
                  newVisibility[index] = true;
                  return newVisibility;
                });
              }, index * 300);
            });
          }, 1000);
          
          const rareCount = frontendCards.filter(card => card.level >= 2).length;
          const legendaryCount = frontendCards.filter(card => card.level === 4).length;
          
          if (legendaryCount > 0) {
            toast.success(`🎉 AMAZING! Ten draw completed with ${legendaryCount} LEGENDARY card${legendaryCount > 1 ? 's' : ''}!`, {
              duration: 6000,
              style: {
                background: 'linear-gradient(90deg, #ef4444, #dc2626, #b91c1c)',
                color: 'white',
                fontWeight: 'bold',
              },
            });
          } else {
            toast.success(`Ten draw completed! Got ${rareCount} rare+ cards!`);
          }
        }
      } else {
        toast.error(`${drawType === 'single' ? 'Draw' : 'Ten draw'} failed. Please try again.`);
        resetAnimationStates();
      }
    } catch (error) {
      console.error(`${drawType} draw failed:`, error);
      toast.error(`${drawType === 'single' ? 'Draw' : 'Ten draw'} failed. Please try again.`);
      resetAnimationStates();
    }
  };

  const handleSingleDraw = () => {
    handleDraw('single');
  };

  const handleTenDraw = () => {
    handleDraw('ten');
  };

  const resetAnimationStates = () => {
    setIsAnimating(false);
    setAnimationState('idle');
    setCurrentImage('/assets/blindbox/blindbox.png');
  };

  const handleResultConfirm = () => {
    setShowResult(false);
    setSelectedCard(null);
    resetAnimationStates();
  };

  const handleTenDrawResultConfirm = () => {
    setShowTenDrawResult(false);
    setSelectedCards([]);
    setTenDrawCardsVisible([]);
    resetAnimationStates();
  };

  const handleClose = () => {
    if (isAnimating) return;
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setShowResult(false);
      setSelectedCard(null);
      setSelectedCards([]);
      setTenDrawCardsVisible([]);
      setIsAnimating(false);
      setShowTenDrawResult(false);
      setAnimationState('idle');
      setCurrentImage('/assets/blindbox/blindbox.png');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white text-xl font-semibold">🎁 Blind Box</h2>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={isAnimating}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!showResult && !showTenDrawResult && (
          <div className="text-center">
            <div 
              className="relative inline-block cursor-pointer transition-all duration-300 hover:scale-105 mb-6"
              onClick={handleSingleDraw}
            >
              {/* Opening text */}
              {animationState === 'opening' && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="bg-black bg-opacity-80 text-white px-4 py-2 rounded-lg font-bold text-lg animate-pulse">
                    Opening...
                  </div>
                </div>
              )}
              
              
              {/* Card reveal animation */}
              {animationState === 'revealing' && selectedCard && (
                <div className="absolute inset-0 flex items-center justify-center z-30">
                  <img 
                    src={selectedCard.image} 
                    alt={selectedCard.name} 
                    className="w-48 h-48 object-contain animate-card-reveal"
                  />
                </div>
              )}
              
              <img 
                src={currentImage} 
                alt="Blind Box" 
                className={`w-64 h-64 object-contain transition-all duration-300 ${
                  animationState === 'shaking' ? 'animate-shake' : ''
                } ${animationState === 'opening' ? 'opacity-100' : animationState === 'revealing' ? 'opacity-0' : 'opacity-100'}`}
              />
            </div>
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleSingleDraw}
                disabled={isAnimating}
                className="w-40 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors"
              >
                Single Draw
              </button>
              <button
                onClick={handleTenDraw}
                disabled={isAnimating}
                className="w-40 px-6 py-2 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-700 hover:via-pink-700 hover:to-purple-700 disabled:from-gray-600 disabled:via-gray-600 disabled:to-gray-600 text-white rounded-md font-medium transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/50 relative overflow-hidden group"
                style={{
                  background: 'linear-gradient(90deg, #9333ea, #ec4899, #9333ea, #ec4899)',
                  backgroundSize: '300% 100%',
                  animation: 'flowingGradient 3s ease-in-out infinite',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400/30 via-transparent to-purple-400/30 animate-pulse"></div>
                <div 
                  className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 rounded-md blur opacity-75 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: 'conic-gradient(from 0deg, #9333ea, #ec4899, #9333ea, #ec4899, #9333ea)',
                    animation: 'rotatingGlow 2s linear infinite',
                  }}
                ></div>
                <span className="relative z-10">Ten Draw</span>
              </button>
            </div>
            
            <p className="text-gray-400 text-sm mt-4">
              Click blind box or use buttons to draw
            </p>
          </div>
        )}

        {showResult && selectedCard && (
          <div className="text-center">
            <div className="mb-6">
              <div className="relative inline-block">
                {selectedCard.level === 4 && (
                  <div className="absolute inset-0 -m-6">
                    <div className="w-60 h-60 rounded-full animate-color-shift animate-spin-slow opacity-100 blur-lg"></div>
                  </div>
                )}
                
                <div className="absolute inset-0 -m-4 opacity-0 animate-pulse" 
                     style={{
                       animation: 'cardGlow 3s ease-in-out infinite',
                       background: `
                         radial-gradient(
                           circle at center,
                           ${selectedCard.level === 1 ? '#3b82f6' : 
                             selectedCard.level === 2 ? '#8b5cf6' : 
                             selectedCard.level === 3 ? '#f59e0b' : '#ef4444'} 0%,
                           ${selectedCard.level === 1 ? '#1d4ed8' : 
                             selectedCard.level === 2 ? '#7c3aed' : 
                             selectedCard.level === 3 ? '#d97706' : '#dc2626'} 40%,
                           transparent 80%
                         )
                       `,
                       borderRadius: '50%',
                       filter: 'blur(15px)',
                       transform: 'scale(1.2)',
                     }}
                />
                
                <img 
                  src={selectedCard.image} 
                  alt={selectedCard.name} 
                  className="w-48 h-48 object-contain relative z-10"
                />
                <div className={`absolute -top-2 -right-2 px-2 py-1 rounded-full text-xs font-bold z-20 ${
                  selectedCard.level === 1 ? 'bg-blue-500 text-white' :
                  selectedCard.level === 2 ? 'bg-purple-500 text-white' :
                  selectedCard.level === 3 ? 'bg-amber-500 text-white' :
                  'bg-red-500 text-white'
                }`}>
                  {selectedCard.level === 1 ? 'Common' :
                   selectedCard.level === 2 ? 'Rare' :
                   selectedCard.level === 3 ? 'Epic' : 'Hidden'}
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="text-white text-xl font-bold mb-2">{selectedCard.name}</h3>
              <p className="text-gray-400 text-sm">
                {selectedCard.level === 1 ? 'A common profession card' :
                 selectedCard.level === 2 ? 'A rare profession card' :
                 selectedCard.level === 3 ? 'An epic profession card' :
                 'A hidden profession card!'}
              </p>
            </div>
            
            <button
              onClick={handleResultConfirm}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
            >
              Got it!
            </button>
          </div>
        )}

        {showTenDrawResult && selectedCards.length > 0 && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm">
            <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-4xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-white text-2xl font-bold">🎉 Ten Draw Results</h3>
                <button 
                  onClick={handleTenDrawResultConfirm}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="grid grid-cols-5 gap-8 mb-6">
                {selectedCards.map((card, index) => (
                  tenDrawCardsVisible[index] && (
                    <div 
                      key={index} 
                      className="relative inline-block animate-ten-draw-card"
                    >
                    {card.level === 4 && (
                      <div className="absolute inset-0 -m-5">
                        <div className="w-58 h-58 rounded-full animate-color-shift animate-spin-slow opacity-100 blur-lg"></div>
                      </div>
                    )}
                    
                   {card.level >= 2 && (
                     <div className="absolute inset-0 -m-3" 
                          style={{
                            opacity: 0.5,
                            background: `
                              radial-gradient(
                                circle at center,
                                ${card.level === 2 ? '#8b5cf6' : 
                                  card.level === 3 ? '#f59e0b' : '#ef4444'} 0%,
                                ${card.level === 2 ? '#7c3aed' : 
                                  card.level === 3 ? '#d97706' : '#dc2626'} 40%,
                                transparent 80%
                              )
                            `,
                            borderRadius: '8px',
                            filter: 'blur(10px)',
                            transform: 'scale(1.1)',
                          }}
                     />
                   )}
                    
                    <img 
                      src={card.image} 
                      alt={card.name} 
                      className="w-48 h-48 object-contain relative z-10"
                    />
                  </div>
                )))}
              </div>
              
              <div className="flex justify-center">
                <button
                  onClick={handleTenDrawResultConfirm}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors"
                >
                  Awesome!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes shake {
            0%, 100% { 
              transform: translateX(0) rotate(0deg); 
            }
            10% { 
              transform: translateX(-5px) rotate(-2deg); 
            }
            20% { 
              transform: translateX(5px) rotate(2deg); 
            }
            30% { 
              transform: translateX(-5px) rotate(-1deg); 
            }
            40% { 
              transform: translateX(5px) rotate(1deg); 
            }
            50% { 
              transform: translateX(-3px) rotate(-0.5deg); 
            }
            60% { 
              transform: translateX(3px) rotate(0.5deg); 
            }
            70% { 
              transform: translateX(-2px) rotate(-0.25deg); 
            }
            80% { 
              transform: translateX(2px) rotate(0.25deg); 
            }
            90% { 
              transform: translateX(-1px) rotate(-0.125deg); 
            }
          }
          
          .animate-shake {
            animation: shake 0.5s ease-in-out infinite;
          }
          
          @keyframes card-reveal {
            0% {
              transform: scale(0) rotate(0deg);
              opacity: 0;
            }
            50% {
              transform: scale(0.5) rotate(180deg);
              opacity: 0.5;
            }
            100% {
              transform: scale(1) rotate(360deg);
              opacity: 1;
            }
          }
          
          .animate-card-reveal {
            animation: card-reveal 0.5s ease-out forwards;
          }
          
          @keyframes ten-draw-card-appear {
            0% {
              opacity: 0;
              transform: scale(0.1) rotateY(180deg);
            }
            30% {
              opacity: 0.5;
              transform: scale(0.5) rotateY(90deg);
            }
            70% {
              opacity: 0.8;
              transform: scale(0.8) rotateY(20deg);
            }
            100% {
              opacity: 1;
              transform: scale(1) rotateY(0deg);
            }
          }
          
          .animate-ten-draw-card {
            animation: ten-draw-card-appear 0.6s ease-out forwards;
          }
          
          @keyframes cardGlow {
            0%, 100% { 
              opacity: 0; 
              transform: scale(1.2);
            }
            50% { 
              opacity: 0.6; 
              transform: scale(1.3);
            }
          }
          
          .rotate-y-180 {
            transform: rotateY(180deg);
          }
          
          @keyframes shimmer {
            0% {
              transform: translateX(-100%) skewX(-12deg);
            }
            100% {
              transform: translateX(100%) skewX(-12deg);
            }
          }
          
          @keyframes glow {
            0%, 100% {
              box-shadow: 0 0 5px rgba(147, 51, 234, 0.5);
            }
            50% {
              box-shadow: 0 0 20px rgba(147, 51, 234, 0.8), 0 0 30px rgba(236, 72, 153, 0.6);
            }
          }

          @keyframes flowingGradient {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }

          @keyframes rotatingGlow {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `
      }} />
    </div>
  );
};

export default BlindBox;
