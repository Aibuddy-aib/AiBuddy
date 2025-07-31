import React, { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface RandomEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  worldId?: Id<'worlds'>;
  playerId?: string | null;
}

const RandomEventModal: React.FC<RandomEventModalProps> = ({
  isOpen,
  onClose,
  worldId,
  playerId
}) => {
  // get player events
  const playerEvents = useQuery(
    api.aiTown.playerOperations.getPlayerEventsForDisplay,
    worldId && playerId ? { worldId, playerId } : 'skip'
  );

  // debug info
  useEffect(() => {
    if (playerEvents) {
      console.log('[RandomEventModal] Player events loaded:', playerEvents.length, 'events');
    }
  }, [playerEvents]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-xl w-11/12 max-w-4xl max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-white text-xl font-semibold">Event Records</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {playerEvents === undefined ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading events...</p>
            </div>
          ) : playerEvents && playerEvents.length > 0 ? (
            <div className="space-y-4">
              {/* table header */}
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-gray-400 border-b border-gray-700 pb-2">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Event</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-2">Token Change</div>
                <div className="col-span-2">Time</div>
              </div>
              
              {/* event list */}
              {playerEvents.map((event, index) => (
                <div key={index} className="grid grid-cols-12 gap-4 text-sm border-b border-gray-800 pb-3">
                  <div className="col-span-1 text-white font-medium">
                    {playerEvents.length - index}
                  </div>
                  <div className="col-span-4">
                    <div className="text-white font-medium mb-1">{event.title}</div>
                    <div className="text-gray-300 text-xs">{event.description}</div>
                  </div>
                  <div className="col-span-3 text-gray-300 capitalize">
                    {event.type}
                  </div>
                  <div className={`col-span-2 font-semibold ${
                    event.tokenChange > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {event.tokenChange > 0 ? '+' : ''}{event.tokenChange} AIB
                  </div>
                  <div className="col-span-2 text-gray-300 text-xs">
                    {new Date(event.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-400 text-4xl mb-4">📋</div>
              <p className="text-gray-400 text-lg">No events found</p>
              <p className="text-gray-500 text-sm mt-2">No trigger event yet</p>
            </div>
          )}
        </div>
        
        <div className="flex justify-center p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RandomEventModal; 