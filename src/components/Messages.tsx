import clsx from 'clsx';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MessageInput } from './MessageInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import { useEffect, useRef } from 'react';

export function Messages({
  worldId,
  engineId,
  conversation,
  inConversationWithMe,
  humanPlayer,
  scrollViewRef,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  conversation:
    | { kind: 'active'; doc: Conversation }
    | { kind: 'archived'; doc: Doc<'archivedConversations'> };
  inConversationWithMe: boolean;
  humanPlayer?: Player;
  scrollViewRef: React.RefObject<HTMLDivElement>;
}) {
  const humanPlayerId = humanPlayer?.id;
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const messages = useQuery(api.messages.listMessages, {
    worldId,
    conversationId: conversation.doc.id,
  });
  let currentlyTyping = conversation.kind === 'active' ? conversation.doc.isTyping : undefined;
  if (messages !== undefined && currentlyTyping) {
    if (messages.find((m) => m.messageUuid === currentlyTyping!.messageUuid)) {
      currentlyTyping = undefined;
    }
  }
  const currentlyTypingName =
    currentlyTyping &&
    descriptions?.playerDescriptions.find((p) => p.playerId === currentlyTyping?.playerId)?.name;

  const scrollView = scrollViewRef.current;
  const isScrolledToBottom = useRef(false);
  useEffect(() => {
    if (!scrollView) return undefined;

    const onScroll = () => {
      isScrolledToBottom.current = !!(
        scrollView && scrollView.scrollHeight - scrollView.scrollTop - 50 <= scrollView.clientHeight
      );
    };
    scrollView.addEventListener('scroll', onScroll);
    return () => scrollView.removeEventListener('scroll', onScroll);
  }, [scrollView]);
  useEffect(() => {
    if (isScrolledToBottom.current) {
      scrollViewRef.current?.scrollTo({
        top: scrollViewRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, currentlyTyping]);

  if (messages === undefined) {
    return null;
  }
  if (messages.length === 0 && !inConversationWithMe) {
    return null;
  }
  const messageNodes: { time: number; node: React.ReactNode }[] = messages.map((m) => {
    const isCurrentUser = m.author === humanPlayerId;
    const node = (
      <div 
        key={`text-${m._id}`} 
        className={`leading-tight mb-3 ${isCurrentUser ? "pl-1" : "pr-1"}`}
      >
        <div className="flex items-center justify-between mb-1 text-xs font-system">
          <span className="font-bold text-gray-300">{m.authorName}</span>
          <time dateTime={m._creationTime.toString()} className="text-gray-400">
            {new Date(m._creationTime).toLocaleTimeString()}
          </time>
        </div>
        <div 
          className={`p-3 rounded-lg text-sm ${
            isCurrentUser 
              ? "bg-blue-700 text-white ml-auto rounded-tr-none" 
              : "bg-gray-700 text-white mr-auto rounded-tl-none"
          } w-full inline-block shadow-sm font-system`}
        >
          {m.text}
        </div>
      </div>
    );
    return { node, time: m._creationTime };
  });
  const lastMessageTs = messages.map((m) => m._creationTime).reduce((a, b) => Math.max(a, b), 0);

  const membershipNodes: typeof messageNodes = [];
  if (conversation.kind === 'active') {
    for (const [playerId, m] of conversation.doc.participants) {
      const playerName = descriptions?.playerDescriptions.find((p) => p.playerId === playerId)
        ?.name;
      let started;
      if (m.status.kind === 'participating') {
        started = m.status.started;
      }
      if (started) {
        membershipNodes.push({
          node: (
            <div key={`joined-${playerId}`} className="my-2 text-center">
              <span className="text-xs py-1 px-2 bg-gray-700 rounded-full inline-block text-gray-300">
                {playerName} joined the conversation
              </span>
            </div>
          ),
          time: started,
        });
      }
    }
  } else {
    for (const playerId of conversation.doc.participants) {
      const playerName = descriptions?.playerDescriptions.find((p) => p.playerId === playerId)
        ?.name;
      const started = conversation.doc.created;
      membershipNodes.push({
        node: (
          <div key={`joined-${playerId}`} className="my-2 text-center">
            <span className="text-xs py-1 px-2 bg-gray-700 rounded-full inline-block text-gray-300">
              {playerName} joined the conversation
            </span>
          </div>
        ),
        time: started,
      });
      const ended = conversation.doc.ended;
      membershipNodes.push({
        node: (
          <div key={`left-${playerId}`} className="my-2 text-center">
            <span className="text-xs py-1 px-2 bg-gray-700 rounded-full inline-block text-gray-300">
              {playerName} left the conversation
            </span>
          </div>
        ),
        // Always sort all "left" messages after the last message.
        time: Math.max(lastMessageTs + 1, ended),
      });
    }
  }
  const nodes = [...messageNodes, ...membershipNodes];
  nodes.sort((a, b) => a.time - b.time);
  return (
    <div className="text-sm">
      <div className="bg-slate-800 rounded-lg text-gray-200 p-2 font-system">
        {nodes.length > 0 && nodes.map((n) => n.node)}
        {currentlyTyping && currentlyTyping.playerId !== humanPlayerId && (
          <div key="typing" className="leading-tight mb-3 pr-1">
            <div className="flex items-center justify-between mb-1 text-xs font-system">
              <span className="font-bold text-gray-300">{currentlyTypingName}</span>
              <time dateTime={currentlyTyping.since.toString()} className="text-gray-400">
                {new Date(currentlyTyping.since).toLocaleTimeString()}
              </time>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg text-sm mr-auto rounded-tl-none w-full inline-block shadow-sm font-system">
              <span className="text-gray-400 italic">typing...</span>
            </div>
          </div>
        )}
        {humanPlayer && inConversationWithMe && conversation.kind === 'active' && (
          <MessageInput
            worldId={worldId}
            engineId={engineId}
            conversation={conversation.doc}
            humanPlayer={humanPlayer}
          />
        )}
      </div>
    </div>
  );
}
