export const overlayConfig = {
  socketUrl: 'ws://localhost:21213/',
  displayDurationMs: 5000,
  transitionDurationMs: 600,
  gapBetweenCardsMs: 250,
  maxWaitingCards: 3,
  duplicateWindowMs: 15000,
  returningViewerDays: 30,
  maxStoredViewers: 500,
  promptRotationMs: 18000,
  prompts: [
    'Where are you joining from after work?',
    'Drop one word for your current mood.',
    'Choose the room mood: calm, cozy or reset.',
    'What helped you unwind today?'
  ],
  showConnectionText: true,
  showViewerCount: true,
  enableAmbientEffect: true,
  enableCommentMoodVoting: true,
  ambientWindow: {
    left: '50%',
    top: '12%',
    width: '44%',
    height: '42%'
  }
};
