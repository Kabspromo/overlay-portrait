import { useEffect, useMemo, useRef, useState } from 'react';
import { overlayConfig } from './config';

type OverlayProps = {
  overlayOnly?: boolean;
};

type AlertKind = 'subscription' | 'gift' | 'follow' | 'share' | 'firstComment' | 'returningViewer' | 'join';

type AlertItem = {
  id: number;
  kind: AlertKind;
  viewerName: string;
  subtitle: string;
  title: string;
  avatarUrl?: string;
  profileInitial: string;
  createdAt: number;
};

type SocketStatus = 'Connecting' | 'Events connected' | 'Disconnected' | 'Reconnecting';

type MoodMode = 'calm' | 'cozy' | 'reset';

const ALERT_PRIORITY: Record<AlertKind, number> = {
  subscription: 1,
  gift: 2,
  follow: 3,
  share: 4,
  firstComment: 5,
  returningViewer: 6,
  join: 7
};

const getInitials = (value?: string) => {
  if (!value) return 'A';
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const normalizeViewer = (payload: Record<string, any>) => {
  const user = payload.user ?? {};
  const author = payload.author ?? {};
  const candidate = [
    payload.displayName,
    payload.nickname,
    payload.uniqueId,
    payload.username,
    payload.userId,
    payload.id,
    user.displayName,
    user.nickname,
    user.uniqueId,
    user.username,
    user.userId,
    user.id,
    author.displayName,
    author.nickname,
    author.uniqueId,
    author.username,
    author.userId,
    author.id
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  const avatar = [
    payload.profilePictureUrl,
    payload.avatarUrl,
    user.profilePictureUrl,
    user.avatarUrl,
    payload.profilePictureUrls?.[0],
    user.profilePictureUrls?.[0],
    user.avatarThumb?.urlList?.[0],
    user.avatarMedium?.urlList?.[0],
    user.avatarLarge?.urlList?.[0],
    author.avatarThumb?.urlList?.[0],
    author.avatarMedium?.urlList?.[0],
    author.avatarLarge?.urlList?.[0]
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  return {
    displayName: candidate ? String(candidate).trim() : 'A quiet guest',
    avatarUrl: typeof avatar === 'string' ? avatar : undefined
  };
};

const getStorageKey = () => 'amy-quiet-space-viewers';

const readReturningViewers = () => {
  try {
    const raw = window.localStorage.getItem(getStorageKey());
    if (!raw) return new Map<string, number>();
    const parsed = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map<string, number>();
  }
};

const writeReturningViewers = (map: Map<string, number>) => {
  const payload = Object.fromEntries(map.entries());
  window.localStorage.setItem(getStorageKey(), JSON.stringify(payload));
};

const createAvatarSvg = (initial: string) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>
    <rect width='180' height='180' rx='90' fill='#0e1827'/>
    <circle cx='90' cy='74' r='42' fill='#d8be80'/>
    <path d='M35 152c16-34 44-48 55-48s39 14 55 48' fill='#4d7a96'/>
    <text x='90' y='99' text-anchor='middle' fill='#f5f0e2' font-size='56' font-family='Georgia, serif'>${initial}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const App = ({ overlayOnly = false }: OverlayProps) => {
  const [status, setStatus] = useState<SocketStatus>('Connecting');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState(overlayConfig.prompts[0]);
  const [clock, setClock] = useState(new Date());
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [currentMoodMode, setCurrentMoodMode] = useState<MoodMode>('calm');
  const [latestPacket, setLatestPacket] = useState<string>('');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<AlertItem[]>([]);
  const activeRef = useRef<AlertItem | null>(null);
  const seenViewersRef = useRef<Set<string>>(new Set());
  const recentEventsRef = useRef<Map<string, number>>(new Map());
  const moodVotesRef = useRef<Map<string, MoodMode>>(new Map());
  const returningViewersRef = useRef<Map<string, number>>(readReturningViewers());
  const revealTimerRef = useRef<number | null>(null);
  const promptTimerRef = useRef<number | null>(null);

  const isOverlayRoute = overlayOnly;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let index = 0;
    const rotate = () => {
      index = (index + 1) % overlayConfig.prompts.length;
      setCurrentPrompt(overlayConfig.prompts[index]);
    };
    promptTimerRef.current = window.setInterval(rotate, overlayConfig.promptRotationMs);
    return () => {
      if (promptTimerRef.current) window.clearInterval(promptTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const connect = () => {
      setStatus(reconnectAttempt === 0 ? 'Connecting' : 'Reconnecting');
      const socket = new WebSocket(overlayConfig.socketUrl);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        setStatus('Events connected');
        setReconnectAttempt(0);
      });

      socket.addEventListener('message', (event) => {
        const packetText = event.data?.toString?.() ?? '';
        setLatestPacket(packetText);
        if (!packetText) return;
        try {
          const payload = JSON.parse(packetText);
          handlePayload(payload);
        } catch {
          // Ignore malformed JSON.
        }
      });

      socket.addEventListener('close', () => {
        setStatus('Disconnected');
        const timeout = Math.min(15000, 1000 * 2 ** reconnectAttempt);
        setReconnectAttempt((value) => value + 1);
        window.setTimeout(() => {
          connect();
        }, timeout);
      });

      socket.addEventListener('error', () => {
        setStatus('Disconnected');
      });
    };

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [reconnectAttempt]);

  const queueAlert = (alert: AlertItem) => {
    const now = Date.now();
    const duplicateKey = `${alert.kind}:${alert.viewerName}`;
    const previous = recentEventsRef.current.get(duplicateKey);
    if (previous && now - previous < overlayConfig.duplicateWindowMs) {
      return;
    }
    recentEventsRef.current.set(duplicateKey, now);

    const showAlert = (item: AlertItem) => {
      activeRef.current = item;
      setAlerts([item]);
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = window.setTimeout(() => {
        activeRef.current = null;
        setAlerts([]);
        const next = queueRef.current.shift();
        if (next) {
          showAlert(next);
        }
      }, overlayConfig.displayDurationMs);
    };

    if (!activeRef.current) {
      showAlert(alert);
      return;
    }

    if (queueRef.current.length >= overlayConfig.maxWaitingCards) {
      const combinedMessage = buildCombinedOverflow(alert);
      if (combinedMessage && alert.kind === 'join') {
        queueRef.current = queueRef.current.slice(0, overlayConfig.maxWaitingCards - 1);
        queueRef.current.push({
          ...alert,
          id: Date.now(),
          kind: 'join',
          title: combinedMessage,
          subtitle: 'Amy kept the space open for everyone.',
          viewerName: 'Many viewers',
          profileInitial: 'M',
          createdAt: now
        });
      }
      return;
    }

    queueRef.current = [...queueRef.current, alert].sort((a, b) => ALERT_PRIORITY[a.kind] - ALERT_PRIORITY[b.kind]);
  };

  const handlePayload = (payload: Record<string, any>) => {
    if (!payload || typeof payload !== 'object') return;
    const eventName = payload.event;
    if (typeof eventName !== 'string') return;

    const normalized = normalizeViewer(payload.data ?? payload);
    const viewerName = normalized.displayName;
    const avatarUrl = normalized.avatarUrl;
    const initial = getInitials(viewerName);

    if (eventName === 'roomUser' || eventName === 'join') {
      const hasViewerIdentity = Boolean(
        payload.data?.user?.nickname ||
        payload.data?.user?.uniqueId ||
        payload.data?.user?.userId ||
        payload.data?.user?.id ||
        payload.data?.user?.displayName ||
        payload.data?.nickname ||
        payload.data?.uniqueId ||
        payload.data?.username ||
        payload.data?.displayName ||
        payload.data?.userId ||
        payload.data?.author?.nickname ||
        payload.data?.author?.uniqueId ||
        payload.data?.author?.displayName
      );
      if (!hasViewerIdentity) {
        if (typeof payload.data?.viewerCount === 'number') {
          setViewerCount(payload.data.viewerCount);
        }
        return;
      }

      const viewerKey = viewerName.toLowerCase();
      const returningViewer = returningViewersRef.current.get(viewerKey);
      const now = Date.now();
      const isReturning = Boolean(returningViewer && now - returningViewer < overlayConfig.returningViewerDays * 24 * 60 * 60 * 1000);

      if (isReturning) {
        queueAlert({
          id: now,
          kind: 'returningViewer',
          viewerName,
          title: `Welcome back, ${viewerName}`,
          subtitle: 'Your quiet space is right where you left it.',
          avatarUrl,
          profileInitial: initial,
          createdAt: now
        });
      } else {
        seenViewersRef.current.add(viewerName);
        queueAlert({
          id: now,
          kind: 'join',
          viewerName,
          title: `Good to see you, ${viewerName}`,
          subtitle: 'Amy saved you a calm place to land after work.',
          avatarUrl,
          profileInitial: initial,
          createdAt: now
        });
      }

      if (returningViewersRef.current.size >= overlayConfig.maxStoredViewers) {
        const oldestKey = returningViewersRef.current.entries().next().value?.[0];
        if (oldestKey) {
          returningViewersRef.current.delete(oldestKey);
        }
      }
      returningViewersRef.current.set(viewerKey, now);
      writeReturningViewers(returningViewersRef.current);
      return;

      return;
    }

    if (eventName === 'chat') {
      const text = String(payload.data?.content ?? payload.data?.comment ?? payload.data?.text ?? '').toLowerCase();
      const voteMatch = classifyMoodVote(text);
      if (overlayConfig.enableCommentMoodVoting && voteMatch && viewerName) {
        const voterKey = viewerName.toLowerCase();
        moodVotesRef.current.set(voterKey, voteMatch);
        const counts = new Map<MoodMode, number>();
        for (const vote of moodVotesRef.current.values()) {
          counts.set(vote, (counts.get(vote) ?? 0) + 1);
        }
        const winner = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'calm';
        setCurrentMoodMode(winner);
        return;
      }

      if (seenViewersRef.current.has(viewerName)) {
        return;
      }
      seenViewersRef.current.add(viewerName);
      queueAlert({
        id: Date.now(),
        kind: 'firstComment',
        viewerName,
        title: `Good to see you, ${viewerName}`,
        subtitle: 'Amy is glad you joined the quiet space.',
        avatarUrl,
        profileInitial: initial,
        createdAt: Date.now()
      });
      return;
    }

    if (eventName === 'follow') {
      queueAlert({
        id: Date.now(),
        kind: 'follow',
        viewerName,
        title: `Thank you for following, ${viewerName}`,
        subtitle: 'You’re part of Amy’s quiet space now.',
        avatarUrl,
        profileInitial: initial,
        createdAt: Date.now()
      });
      return;
    }

    if (eventName === 'share') {
      queueAlert({
        id: Date.now(),
        kind: 'share',
        viewerName,
        title: `Thank you, ${viewerName}`,
        subtitle: 'You shared Amy’s quiet space with someone.',
        avatarUrl,
        profileInitial: initial,
        createdAt: Date.now()
      });
      return;
    }

    if (eventName === 'gift') {
      const giftName = payload.data?.giftName || payload.data?.gift?.name || 'gift';
      queueAlert({
        id: Date.now(),
        kind: 'gift',
        viewerName,
        title: `A warm thank-you, ${viewerName}`,
        subtitle: `Your ${giftName} added a little lift to the room.`,
        avatarUrl,
        profileInitial: initial,
        createdAt: Date.now()
      });
      return;
    }

    if (eventName === 'subscribe') {
      queueAlert({
        id: Date.now(),
        kind: 'subscription',
        viewerName,
        title: `Welcome closer, ${viewerName}`,
        subtitle: 'Thank you for supporting Amy’s quiet space.',
        avatarUrl,
        profileInitial: initial,
        createdAt: Date.now()
      });
      return;
    }
  };

  const generateTestPacket = (event: string, overrides: Record<string, any> = {}) => {
    const payload = {
      event,
      data: {
        displayName: overrides.displayName ?? 'Sample Viewer',
        profilePictureUrl: overrides.avatarUrl ?? `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70) + 1}`,
        ...overrides
      }
    };
    handlePayload(payload);
    setLatestPacket(JSON.stringify(payload, null, 2));
  };

  const simulateRapidJoins = () => {
    const names = ['Monica', 'James', 'Rina', 'Noah', 'Selene'];
    names.forEach((name, index) => {
      window.setTimeout(() => generateTestPacket('roomUser', { displayName: name, profilePictureUrl: `https://i.pravatar.cc/100?img=${index + 10}` }), index * 220);
    });
  };

  const clearReturningViewers = () => {
    returningViewersRef.current = new Map();
    writeReturningViewers(returningViewersRef.current);
    setViewerCount(0);
  };

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (promptTimerRef.current) window.clearInterval(promptTimerRef.current);
    };
  }, []);

  const formattedTime = useMemo(
    () =>
      clock.toLocaleString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin'
      }),
    [clock]
  );

  const statusClass = status.toLowerCase().replace(/\s+/g, '-');
  const viewerLabel = viewerCount === null ? 'Viewers pending' : `${viewerCount.toLocaleString()} watching`;
  const moodLabel = `${currentMoodMode[0].toUpperCase()}${currentMoodMode.slice(1)} mode`;

  return (
    <div className={`app-shell ${isOverlayRoute ? 'overlay-only' : ''}`}>
      <div className="overlay-canvas" style={{ background: 'transparent' }}>
        <div className="ambient-wash" />
        <div className="window-light" />
        <div className="ambient-layer" style={overlayConfig.enableAmbientEffect ? overlayConfig.ambientWindow : undefined} />
        <div className="overlay-glow" />
        <header className="top-header">
          <div className="header-title-group">
            <span className="space-mark">A</span>
            <div>
              <h1>Amy’s Quiet Space</h1>
              <p>after-work vibes</p>
            </div>
          </div>
          <div className="header-meta">
            {overlayConfig.showConnectionText ? (
              <div className={`meta-pill status-pill ${statusClass}`}>
                <span className="status-dot" />
                {status}
              </div>
            ) : null}
            {overlayConfig.showViewerCount ? <div className="meta-pill">{viewerLabel}</div> : null}
            {overlayConfig.enableAmbientEffect ? <div className="meta-pill mood-pill">{moodLabel}</div> : null}
            <div className="meta-pill clock-pill">{formattedTime}</div>
          </div>
        </header>

        <div className="interaction-bar">
          <div className="prompt-track">
            <span className="prompt-label">After work</span>
            <div className="prompt-text">{currentPrompt}</div>
          </div>
        </div>

        <div className="alert-stack">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alert-card alert-${alert.kind}`}>
              <div className="alert-avatar" style={{ backgroundImage: alert.avatarUrl ? `url(${alert.avatarUrl})` : `url(${createAvatarSvg(alert.profileInitial)})` }} />
              <div className="alert-copy">
                <h2>{alert.title}</h2>
                <p>{alert.subtitle}</p>
              </div>
            </div>
          ))}
        </div>

        {!isOverlayRoute ? (
          <div className="test-panel">
            <h3>Test controls</h3>
            <div className="test-buttons">
              <button onClick={() => generateTestPacket('roomUser', { displayName: 'Sarah' })}>Simulate join</button>
              <button onClick={() => generateTestPacket('chat', { displayName: 'Mina', content: 'hello there' })}>Simulate first comment</button>
              <button onClick={() => generateTestPacket('follow', { displayName: 'Noah' })}>Simulate follow</button>
              <button onClick={() => generateTestPacket('gift', { displayName: 'Lina', giftName: 'rose bouquet' })}>Simulate gift</button>
              <button onClick={() => generateTestPacket('subscribe', { displayName: 'Rae' })}>Simulate subscription</button>
              <button onClick={() => generateTestPacket('share', { displayName: 'Jules' })}>Simulate share</button>
              <button onClick={simulateRapidJoins}>Simulate several rapid joins</button>
              <button onClick={() => setStatus('Disconnected')}>Simulate WebSocket disconnection</button>
              <button onClick={clearReturningViewers}>Clear returning-viewer memory</button>
            </div>
            <pre>{latestPacket || 'No packets yet'}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const classifyMoodVote = (text: string): MoodMode | null => {
  const terms = {
    calm: /\b(calm|soft|quiet|gentle|breathe|slow)\b/i,
    cozy: /\b(cozy|warm|comfort|settle|chill|easy)\b/i,
    reset: /\b(reset|fresh|clear|focus|unwind|recharge)\b/i
  };
  if (terms.calm.test(text)) return 'calm';
  if (terms.cozy.test(text)) return 'cozy';
  if (terms.reset.test(text)) return 'reset';
  return null;
};

const buildCombinedOverflow = (alert: AlertItem) => {
  if (alert.kind !== 'join') return null;
  return `${alert.viewerName} and others joined Amy’s quiet space.`;
};

export default App;
