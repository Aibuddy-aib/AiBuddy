import clsx from 'clsx';
import { useMutation, useQuery } from 'convex/react';
import { KeyboardEvent, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSendInput } from '../hooks/sendInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';

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

  const onKeyDown = async (e: KeyboardEvent) => {
    e.stopPropagation();

    // Set the typing indicator if we're not submitting.
    if (e.key !== 'Enter') {
      console.log(inflightUuid.current);
      if (currentlyTyping || inflightUuid.current !== undefined) {
        return;
      }
      inflightUuid.current = crypto.randomUUID();
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
    if (!inputRef.current) {
      return;
    }
    const text = inputRef.current.innerText;
    inputRef.current.innerText = '';
    if (!text) {
      return;
    }
    let messageUuid = inflightUuid.current;
    if (currentlyTyping && currentlyTyping.playerId === humanPlayer.id) {
      messageUuid = currentlyTyping.messageUuid;
    }
    messageUuid = messageUuid || crypto.randomUUID();
    await writeMessage({
      worldId,
      playerId: humanPlayer.id,
      conversationId: conversation.id,
      text,
      messageUuid,
    });
  };
  return (
    <div className="mt-4 font-system">
      <div className="flex items-center justify-between mb-1 text-xs font-system">
        <span className="font-bold text-gray-300">{humanName}</span>
      </div>
      <div className="flex items-center bg-gray-900 rounded-lg shadow-inner overflow-hidden">
        <div
          className="p-2 text-sm min-h-[40px] w-full text-white font-system"
          ref={inputRef}
          contentEditable
          style={{ outline: 'none' }}
          tabIndex={0}
          placeholder="Type your message..."
          onKeyDown={(e) => onKeyDown(e)}
        />
        <div className="bg-blue-700 px-2 py-1 mr-1 rounded text-white text-xs font-system">
          Press Enter
        </div>
      </div>
      <div className="text-xs text-gray-500 ml-3 font-system">Press Enter to send</div>
    </div>
  );
}
