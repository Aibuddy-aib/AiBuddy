import { useMutation, useQuery } from 'convex/react';
import { KeyboardEvent, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import { randomUUID } from '../utils/crypto';

export function MessageInput({
  worldId,
  engineId,
  humanPlayer,
  conversation,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  humanPlayer: Player;
  conversation: Conversation;
}) {
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const humanName = descriptions?.playerDescriptions.find((p) => p.playerId === humanPlayer.id)
    ?.name;
  const inputRef = useRef<HTMLParagraphElement>(null);
  const inflightUuid = useRef<string | undefined>();
  const writeMessage = useMutation(api.messages.writeMessage);
  const startTyping = useSendInput(engineId, 'startTyping');
  const currentlyTyping = conversation.isTyping;
  const [isLoading, setIsLoading] = useState(false);

  const onKeyDown = async (e: KeyboardEvent) => {
    e.stopPropagation();

    // Set the typing indicator if we're not submitting.
    if (e.key !== 'Enter') {
      console.log(inflightUuid.current);
      if (currentlyTyping || inflightUuid.current !== undefined) {
        return;
      }
      inflightUuid.current = randomUUID();
      try {
        // Don't show a toast on error.
        await startTyping({
          playerId: humanPlayer.id,
          conversationId: conversation.id,
          messageUuid: inflightUuid.current,
        });
      } finally {
        inflightUuid.current = undefined;
      }
      return;
    }

    // Send the current message.
    e.preventDefault();
    if (!inputRef.current || isLoading) {
      return;
    }
    const text = inputRef.current.innerText;
    inputRef.current.innerText = '';
    if (!text) {
      return;
    }
    
    setIsLoading(true);
    try {
      let messageUuid = inflightUuid.current;
      if (currentlyTyping && currentlyTyping.playerId === humanPlayer.id) {
        messageUuid = currentlyTyping.messageUuid;
      }
      messageUuid = messageUuid || randomUUID();
      await writeMessage({
        worldId,
        playerId: humanPlayer.id,
        conversationId: conversation.id,
        text,
        messageUuid,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="mt-4 font-system">
      <div className="flex items-center justify-between mb-1 text-xs font-system">
        <span className="font-bold text-gray-300">{humanName}</span>
      </div>
      <div className="flex items-center bg-gray-900 rounded-lg shadow-inner overflow-hidden">
        <div
          className={`p-2 text-sm min-h-[40px] w-full text-white font-system ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          ref={inputRef}
          contentEditable={!isLoading}
          style={{ outline: 'none' }}
          tabIndex={isLoading ? -1 : 0}
          placeholder={isLoading ? "Sending..." : "Type your message..."}
          onKeyDown={(e) => onKeyDown(e)}
        />
        <div className={`px-2 py-1 mr-1 rounded text-white text-xs font-system ${
          isLoading ? 'bg-gray-600' : 'bg-blue-700'
        }`}>
          {isLoading ? 'Sending...' : 'Press Enter'}
        </div>
      </div>
      <div className="text-xs text-gray-500 ml-3 font-system">Press Enter to send</div>
    </div>
  );
}
