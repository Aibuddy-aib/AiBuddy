export const ACTION_TIMEOUT = 10_000; // Increased to 10 seconds, as GPT-4 needs longer response time
// export const ACTION_TIMEOUT = 60_000;// normally fine

export const IDLE_WORLD_TIMEOUT = 5 * 60 * 1000;
export const WORLD_HEARTBEAT_INTERVAL = 60 * 1000;

export const MAX_STEP = 10 * 60 * 1000;
export const TICK = 16;
export const STEP_INTERVAL = 1000; // Increased to 1000ms (1s), significantly reduces update frequency

export const PATHFINDING_TIMEOUT = 8_000; // Further reduce pathfinding timeout
export const PATHFINDING_BACKOFF = 500; // Increased to 500ms, reduce conflict handling frequency
export const CONVERSATION_DISTANCE = 3;
export const MIDPOINT_THRESHOLD = 4;
export const TYPING_TIMEOUT = 15 * 1000;
export const COLLISION_THRESHOLD = 0.75;

// How many human players can be in a world at once.
export const MAX_HUMAN_PLAYERS = 8;

// Don't talk to anyone for 15s after having a conversation.
// export const CONVERSATION_COOLDOWN = 120 * 1000; // Increased to 120s (2min)
export const CONVERSATION_COOLDOWN = 600 * 1000; // Reduced to 600s (10min)

// Don't do another activity for 10s after doing one.
export const ACTIVITY_COOLDOWN = 30_000; // Increased to 30s

// Don't talk to a player within 60s of talking to them.
export const PLAYER_CONVERSATION_COOLDOWN = 90 * 1000; // Increased to 90s (1.5min)

// activity duration
export const ACTIVITIES = [
  { description: 'reading a book', emoji: '📖', duration: 20_000 }, 
  { description: 'daydreaming', emoji: '😐', duration: 15_000 },
  { description: 'gardening', emoji: '🌳', duration: 18_000 },
  { description: 'Listening music', emoji: '🎵', duration: 20_000 },
  { description: 'exercising', emoji: '🏃', duration: 18_000 },
  { description: 'meditating', emoji: '🧘', duration: 22_000 },
  { description: 'sketching', emoji: '🎨', duration: 19_000 },
];


export const WORK_DURATION = 4 * 60 * 60 * 1000; // 4 hours
export const WORK_REWARD_INTERVAL = 60 * 1000; // 1 minute
export const BASR_WORK_REWARD = 300; // 300 tokens

export const RANDOM_EVENT_COUNT = 5; // 5 events per day
export const RANDOM_EVENT_PROBABILITY = 0.01; // 1% chance to trigger an event
export const RANDOM_EVENT_INTERVAL = 60 * 60 * 1000; // 1 hour
export const RANDOM_EVENTS = [
  // lucky events
  { title: 'Pick up a wallet', description: 'picked up a wallet full of AIB Token on the road.', type: 'income', amount: 20 },
  { title: 'Lottery win', description: 'won the lottery and received a prize of 60 AIB Token.', type: 'income', amount: 60 },
  { title: 'Skill breakthrough', description: 'achieved a breakthrough in skill learning and received a 20 AIB bonus.', type: 'income', amount: 20 },
  { title: 'Mentor guidance', description: 'received guidance from a mentor, resulting in a 20 AIB salary bonus.', type: 'income', amount: 20 },
  { title: 'Pay raise', description: 'recognized by the boss for outstanding performance and received a 30 AIB raise.', type: 'income', amount: 30 },
  { title: 'Unexpected fortune', description: 'found 50 AIB Token hidden in the corner while cleaning.', type: 'income', amount: 50 },
  { title: 'Lucky draw - 3rd Prize', description: 'won 3rd prize in a street lucky draw and received 10 AIB Token.', type: 'income', amount: 10 },
  { title: 'Lucky draw - 2nd Prize', description: 'won 2nd prize in a street lucky draw and received 20 AIB Token.', type: 'income', amount: 20 },
  { title: 'Lucky draw - 1st Prize', description: 'won 1st prize in a street lucky draw and received 50 AIB Token.', type: 'income', amount: 50 },

  // unlucky events
  { title: 'Lost wallet', description: 'lost a wallet containing AIB Token and suffered a loss of 20 AIB.', type: 'expense', amount: 20 },
  { title: 'Investment failure', description: 'lost 50 AIB Token in a high-risk investment project.', type: 'expense', amount: 50 },
  { title: 'Skill regression', description: 'skills deteriorated due to lack of practice and lost 20 AIB Token.', type: 'expense', amount: 20 },
  { title: 'Device failure', description: 'spent 30 AIB Token to repair broken work equipment.', type: 'expense', amount: 30 },
  { title: 'Traffic fine', description: 'fined 20 AIB Token for violating traffic regulations.', type: 'expense', amount: 20 },
  { title: 'Health issue', description: 'paid 80 AIB Token in medical bills due to overwork.', type: 'expense', amount: 80 },
  { title: 'Work mistake', description: 'made a serious mistake at work and lost a day’s salary of 20 AIB.', type: 'expense', amount: 20 },
  { title: 'Property damage', description: 'accidentally damaged public property and compensated 20 AIB.', type: 'expense', amount: 20 },
  { title: 'Online scam', description: 'fell for an online scam and lost 30 AIB Token.', type: 'expense', amount: 30 },
  { title: 'Bad weather', description: 'affected by bad weather and had 20 AIB deducted from salary.', type: 'expense', amount: 20 }
]

export const ENGINE_ACTION_DURATION = 30000;

// Bound the number of pathfinding searches we do per game step.
export const MAX_PATHFINDS_PER_STEP = 10; // Reduced to 10, limit pathfinding calculations per step

export const DEFAULT_NAME = 'Own';

// Invite 60% of invites that come from other agents.
export const INVITE_ACCEPT_PROBABILITY = 0.4; // Reduced to 0.4, reduce invitation acceptance probability

// Wait for invites to be accepted.
export const INVITE_TIMEOUT = 45 * 1000; // Increased to 45 seconds

// Wait for another player to say something before jumping in.
export const AWKWARD_CONVERSATION_TIMEOUT = 4 * 1000; // Increased to 4 seconds

// Leave a conversation after participating too long.
export const MAX_CONVERSATION_DURATION = 60_000; // Increased to 60 seconds

export const DIRECT_CHAT_MAX_CONVERSATION_DURATION = 10 * 60 * 1000; // 10 minutes
export const DIRECT_CHAT_COOLDOWN = 10; // 10 seconds

// Leave a conversation if it has more than 8 messages;
// export const MAX_CONVERSATION_MESSAGES = 6; // Reduced to 6 messages
export const MAX_CONVERSATION_MESSAGES = 3; // Reduced to 3 messages

// Wait for before sending another message.
export const MESSAGE_COOLDOWN = 3000; // Increased to 3000ms (3s)

// How many memories to get from the agent's memory.
// This is over-fetched by 10x so we can prioritize memories by more than relevance.
export const NUM_MEMORIES_TO_SEARCH = 2; // Reduced to 2 memories

// Don't run a turn of the agent more than once every fraction of a second.
export const AGENT_WAKEUP_THRESHOLD = 100; // Significantly increased to 100, significantly reduces AI decision frequency

// How old we let memories be before we vacuum them
export const VACUUM_MAX_AGE = 2 * 7 * 24 * 60 * 60 * 1000;
export const DELETE_BATCH_SIZE = 10; // Increased batch size, improve efficiency

export const HUMAN_IDLE_TOO_LONG = 5 * 60 * 1000;

// Skill mapping constants
export const SKILL_MAP = {
  'waiter': { name: 'Waiter', image: '/assets/1Waiter.png', level: 'Common', levelOrder: 1, reward: 100 },
  'cooker': { name: 'Chef', image: '/assets/1Chef.png', level: 'Common', levelOrder: 1, reward: 100 },
  'employee': { name: 'Staff', image: '/assets/1Staff.png', level: 'Common', levelOrder: 1, reward: 100 },
  'firemen': { name: 'Firefighter', image: '/assets/2Firefighter.png', level: 'Rare', levelOrder: 2, reward: 300 },
  'singer': { name: 'Singer', image: '/assets/2Singer.png', level: 'Rare', levelOrder: 2, reward: 300 },
  'doctor': { name: 'Doctor', image: '/assets/2Doctor.png', level: 'Rare', levelOrder: 2, reward: 300 },
  'cosmonaut': { name: 'Astronaut', image: '/assets/3Astronaut.png', level: 'Epic', levelOrder: 3, reward: 1000 },
  'tax_collector': { name: 'Tax Officer', image: '/assets/4Tax officer.png', level: 'Hidden', levelOrder: 4, reward: 1000 }
} as const;

export const DEFAULT_SKILL_INFO = { name: 'Unknown', image: '/assets/1Waiter.png', level: 'Common', levelOrder: 1, reward: 0 };
