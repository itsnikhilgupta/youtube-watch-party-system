# WatchTogether — Technical Interview & Code Walkthrough Guide

This document is prepared specifically for technical interviews, code walkthroughs, and architectural discussions regarding the WatchTogether YouTube Watch Party system. All explanations and answers directly reflect the actual implementation in this repository.

---

## Part 1: Core System Architecture & Concepts

### 1. Technology Selection: React + TypeScript
- **Why React?** Component-driven hierarchy perfectly isolates independent concerns: video container, custom playback slider, participant list, chat stream, and modal dialogues. React's state-driven model ensures reactive UI updates as real-time WebSocket events arrive.
- **Why TypeScript?** End-to-end type safety between backend schemas and frontend event contracts. Ensures payload shapes for events like `sync_state`, `playback_request_received`, and `role_assigned` are strictly typed, eliminating runtime typos and property mismatches.

### 2. Express & Socket.IO Synergy
- Express handles HTTP routing, health checks (`GET /api/health`), room metadata lookups (`GET /api/rooms/:roomId`), and static file serving.
- Socket.IO attaches directly to the underlying Node.js `http.Server` instance. It handles bi-directional, full-duplex WebSocket communication, automatic fallback to long-polling when firewalls block WebSockets, and built-in connection heartbeat monitoring (`pingInterval` / `pingTimeout`).

### 3. Socket.IO Rooms
- Socket.IO rooms are server-side virtual groupings of socket connections identified by a string (e.g. `room.roomId`).
- When a user joins, the backend invokes `socket.join(roomId)`.
- When an event occurs (e.g. video paused), the server calls `io.to(roomId).emit('sync_state', { room })`. This ensures broadcasts are delivered strictly to participants within that watch party and never leak to unrelated rooms.

### 4. Authoritative Room State Management
- Room state is defined by:
  ```typescript
  {
    roomId: string;
    videoId: string | null;
    isPlaying: boolean;
    currentTime: number;
    updatedAt: number; // millisecond timestamp
    revision: number;  // monotonically increasing integer
    hostParticipantId: string;
    settings: {
      playbackMode: 'HOST_MODERATED' | 'FREE_FOR_ALL';
      isLocked: boolean;
      hasPasscode: boolean;
      slowModeSeconds: number;
    };
  }
  ```
- The backend is the single source of truth. Every playback mutation increments the `revision` counter and records `updatedAt = Date.now()`.
- Clients compare incoming revisions against their local state; stale or out-of-order network packets with lower revision numbers are discarded.

### 5. YouTube IFrame Player API & Autoplay Restrictions
- Instead of insecure `<iframe src="...">` embedding, the official script (`https://www.youtube.com/iframe_api`) is loaded asynchronously.
- The player is instantiated programmatically using `new window.YT.Player()` with native controls hidden (`controls: 0`) and keyboard input disabled (`disablekb: 1`). This prevents viewers from desynchronizing their local player.
- **Autoplay Handling**: Modern browsers restrict unmuted autoplay without prior user interaction. If `player.playVideo()` throws an autoplay prevention error, the application displays an unobtrusive "Start Playing" gesture prompt to satisfy browser security policies.

### 6. Sub-Second Synchronization & Drift Correction
- **Expected Time Formula**:
  $$\text{ExpectedTime} = \text{currentTime} + \begin{cases} \frac{\text{Date.now()} - \text{updatedAt}}{1000} & \text{if } \text{isPlaying} \\ 0 & \text{if paused} \end{cases}$$
- **Loop Prevention**: When the client updates its player to match a server broadcast, an `isApplyingServerSync` flag is activated. This stops the player's internal `onStateChange` event from emitting redundant `play` or `pause` events back to the server.
- **Drift Threshold**: A configurable threshold of $1.5\text{ seconds}$. If the local client time differs from the server by less than 1.5 seconds, playback proceeds uninterrupted (avoiding jitter and stutter). If the drift exceeds 1.5 seconds, `player.seekTo(expectedTime, true)` is called to snap into synchronization.

### 7. Server-Side Role-Based Access Control (RBAC) & Dynamic Room Modes
- Three explicit roles: `HOST`, `MODERATOR`, and `PARTICIPANT`.
- The browser is never trusted. Even if an attacker uses browser DevTools to emit `socket.emit('play', ...)` or modifies local storage, the backend maps `socket.id` to its internal `Participant` session record and validates:
  ```typescript
  const auth = getAuthenticatedContext();
  const canControl = auth.role === 'HOST' || auth.role === 'MODERATOR' || auth.room.settings.playbackMode === 'FREE_FOR_ALL';
  if (!canControl) {
    return emitError('UNAUTHORIZED', 'Participants must request permission to control playback', ack);
  }
  ```
- In **Host Moderated** mode, non-staff participants must go through the request approval queue.
- In **Free-for-All** (Party Mode), any room member is granted direct playback mutation access without requiring manual approvals, while staff management (promoting mods, removing participants, room settings) remains strictly guarded for the Host.

### 8. Playback Request Approval Workflow
- When a Participant clicks play, pause, seek, or change video in Moderated mode, they submit a `request_playback_control` event.
- The backend verifies room membership, generates a UUID for the request, and stores it in `RequestManager` with `status: 'PENDING'`.
- The request is broadcast via `playback_request_received` to the room.
- Only the Host can approve or reject via `respond_to_playback_request`.
- The backend validates that the request exists, is currently `PENDING`, and that the reviewer is the current Host. Upon approval, the server executes the action, bumps the room revision, broadcasts `sync_state`, and marks the request `APPROVED`. Replays and duplicate approvals are rejected with `REQUEST_ALREADY_PROCESSED`.

### 9. Disconnection & Reconnection Grace Period
- If a standard Participant disconnects, they are removed from active participants, pending requests are expired, and remaining members receive `user_left`.
- If the **Host** disconnects (e.g. accidental page refresh or temporary mobile network switch):
  - Rather than closing the room immediately, the backend starts a 15-second grace period timer (`HOST_RECONNECT_GRACE_PERIOD_MS`).
  - Participants receive a `host_disconnected_grace_period` banner.
  - If the Host reconnects within 15 seconds, the timer is cleared, socket IDs are rebound to the existing Host UUID, and playback continues seamlessly.
  - If the timer expires without Host reconnection, the room is safely closed (`room_closed`), metadata marked inactive in SQLite, and participants are notified.

### 10. Database Persistence (SQLite)
- Room metadata, current video ID, playback state, timestamps, and lifecycle flags are saved to SQLite using parameterized queries (`?` placeholders) and WAL (`Write-Ahead Logging`) mode.
- SQLite provides persistent room history without the overhead of external database servers.

### 11. Scaling Constraints & The Redis Solution
- **Current Limitation**: Active socket connections, room participant maps, and timer objects exist in Node.js process memory. If deployed across multiple server instances behind a round-robin load balancer, Socket A on Server 1 cannot emit to Socket B on Server 2.
- **Horizontal Scaling Path**:
  1. Add `@socket.io/redis-adapter` to publish/subscribe socket events across server instances.
  2. Store room states and participant lists in a centralized Redis database (using Redis Hashes and Pub/Sub).
  3. Use Redis TTL for host grace period timers and session tracking.

### 12. Room Mode Settings & Dynamic Host Governance
- **Dynamic Playback Modes**:
  - `HOST_MODERATED`: Default strict mode. Unauthorized participants must submit requests (`request_playback_control`) which require explicit Host approval.
  - `FREE_FOR_ALL`: Party mode. Anyone in the room can play, pause, seek, or change videos directly without approvals.
- **Room Privacy & Access Control**:
  - `isLocked`: When enabled by the Host, new incoming connection attempts to `joinRoom` are immediately rejected with `ROOM_LOCKED`, allowing private viewing sessions to continue undisturbed.
  - `passcode`: When set, clients attempting to join must supply a matching passcode; missing or mismatched credentials return `ROOM_PASSCODE_REQUIRED` or `INVALID_PASSCODE`.
- **Chat Slow Mode Cooldown Architecture**:
  - Server maintains a thread-safe `lastChatMessageTimes` timestamp map per participant.
  - When `slowModeSeconds > 0`, non-staff participants cannot send consecutive messages within the window (`canSendChatMessage`). If throttled, the server computes the exact remaining cooldown in seconds and returns `SLOW_MODE_ACTIVE`.
  - Hosts and Moderators automatically bypass slow mode.
  - The client UI dynamically synchronizes countdown timers and disables the send input until the cooldown expires.
- **Event Lifecycle**:
  - Host dispatches `update_room_settings` with a validated `updateRoomSettingsSchema` payload.
  - The server updates in-memory `InternalRoom`, persists to SQLite (`updateRoomSettingsInDb`), and broadcasts `room_settings_updated` to all participants, updating their UI instantly.

---

## Part 2: 20 Core Interview Questions and Answers

### Q1: Why did you choose WebSockets (Socket.IO) instead of HTTP polling or Server-Sent Events (SSE)?
**Answer**:
"HTTP polling introduces unacceptable latency and excessive HTTP header overhead for millisecond-accurate video synchronization. Server-Sent Events (SSE) is unidirectional (server-to-client only), meaning client actions like play/pause still require separate HTTP POST requests. Socket.IO provides full-duplex, low-latency communication over a single TCP connection, ideal for bi-directional synchronization, real-time chat, and playback request approvals."

### Q2: How do you prevent an infinite loop between YouTube player events and server broadcasts?
**Answer**:
"When the Host presses Play, the local player emits an event to the server. The server updates authoritative state and broadcasts `sync_state` to all clients, including the Host. When clients call `player.playVideo()` in response, the YouTube IFrame API fires its own local `onStateChange` event. To prevent that event from echoing back to the server, we use an `isApplyingServerSync` boolean ref. While applying a server update, any local player event triggers are ignored."

### Q3: What happens if a participant's internet connection experiences jitter or lag?
**Answer**:
"We implement a drift threshold of 1.5 seconds. The client continually compares its current playback timestamp with the server's expected timestamp (`currentTime + elapsed`). If the drift is minor (under 1.5s), we let the video play naturally without interruptions. If the drift exceeds 1.5s (due to network buffering or a tab suspension), the player performs a smooth seek to catch up to the authoritative timestamp."

### Q4: How do you ensure users cannot elevate their role to Host by editing localStorage or JavaScript variables?
**Answer**:
"The browser's local state is treated as entirely untrusted and purely presentational. When a socket connects, the server assigns a cryptographically generated UUID and associates it with the socket connection ID in a server-side `Map`. All permission checks (`isHost`, `isModerator`) are verified exclusively against the server's internal memory and database records, completely ignoring any client-supplied role parameters."

### Q5: How are room codes generated, and how do you prevent collisions?
**Answer**:
"Room codes are generated using Node's `crypto.randomBytes()`. We format them into 9-character alphanumeric codes with hyphens (e.g. `w7k-m9p-2qx`), using a curated 32-character alphabet that omits visually ambiguous characters like `0`, `O`, `1`, `l`, and `I`. Before finalizing room creation, we verify that neither the active in-memory room map nor the SQLite database already contains that room code."

### Q6: What prevents replay attacks on approved playback requests?
**Answer**:
"Each playback request is assigned a unique UUID and starts in a `PENDING` state. In `RequestManager.reviewRequest()`, the server checks `if (request.status !== 'PENDING') throw new Error('REQUEST_ALREADY_PROCESSED')`. Once the Host approves or rejects it, the state is permanently transitioned to `APPROVED` or `REJECTED`, ensuring the action cannot be re-executed even if a packet is replayed."

### Q7: Why did you hide the native YouTube player controls?
**Answer**:
"Native YouTube player controls allow viewers to pause or scrub through the video locally without going through our backend logic. By setting `controls: 0` in `playerVars` and rendering our own custom dark-themed control bar, we enforce our RBAC rules: Hosts and Moderators have active controls, while Participants have request buttons that trigger approval workflows."

### Q8: What is the purpose of the revision counter in the room state?
**Answer**:
"Because WebSocket packets or network retries can occasionally arrive out of order, relying solely on timestamps can lead to race conditions. The server maintains a monotonically increasing integer `revision`. Each time state changes (play, pause, seek, or change video), `revision` is incremented. Clients only apply state updates where `newRevision > currentRevision`."

### Q9: How is YouTube URL parsing made resilient against malicious input?
**Answer**:
"We never insert raw HTML or iframe strings into the DOM. We use `extractYouTubeVideoId()` which parses standard URLs (`watch?v=`), short links (`youtu.be/`), embeds, and shorts using strict regex matching for an 11-character alphanumeric identifier (`/^[a-zA-Z0-9_-]{11}$/`). Any input containing script tags or arbitrary domains is rejected immediately."

### Q10: How do you handle a Host refreshing their browser?
**Answer**:
"When the Host disconnects, we don't destroy the room immediately. We initiate a 15-second grace period timer (`HOST_RECONNECT_GRACE_PERIOD_MS`) and broadcast a warning banner to all viewers. When the Host's page reloads, the client sends a `reconnect_session` event containing the room ID and participant UUID stored in `sessionStorage`. The backend rebinds the Host's identity to the new socket ID, clears the timer, and resumes normal operation."

### Q11: What database is used, and why was it configured with WAL mode?
**Answer**:
"We use SQLite via Node.js's built-in `DatabaseSync` engine (`node:sqlite`). We enable `PRAGMA journal_mode = WAL;` (Write-Ahead Logging), which allows concurrent readers without locking the database while writes are occurring. It provides ACID compliance and persistent metadata without requiring an external database process for local and single-instance deployments."

### Q12: How do you prevent chat spam or memory leaks from endless messages?
**Answer**:
"Chat messages are validated with a Zod schema enforcing a maximum length of 280 characters and non-empty strings. In the database and frontend, chat messages are kept in bounded structures, and inputs are sanitized to prevent script execution."

### Q13: If this application grew to 100,000 concurrent rooms, what would fail first and how would you redesign it?
**Answer**:
"The single Node.js process would run out of memory and CPU capacity to handle 100,000 concurrent WebSocket connections. To scale horizontally:
1. Distribute incoming WebSocket connections across multiple Node.js instances using an Application Load Balancer with sticky sessions.
2. Integrate `@socket.io/redis-adapter` so instances can broadcast events across nodes.
3. Move room state, participant maps, and requests from in-memory JavaScript `Map` objects to a Redis cluster.
4. Migrate persistent metadata from SQLite to a distributed database like PostgreSQL."

### Q14: How does the application handle late joiners who enter mid-video?
**Answer**:
"When a new participant joins, the server calculates the exact expected playback position based on `room.currentTime + (Date.now() - room.updatedAt) / 1000` (if currently playing). The `room_joined` event delivers this synchronized timestamp along with the current video ID, so the joining client's player immediately mounts, cues the correct video, and seeks to the live position."

### Q15: Why did you separate the frontend and backend into two decoupled applications?
**Answer**:
"Separating frontend and backend allows independent deployment, scaling, and technology lifecycles. The frontend is built as an optimized static SPA deployed to global CDNs (like Vercel or Cloudflare Pages) for zero-latency asset delivery, while the backend runs as a stateful, long-lived WebSocket service on platforms like Render or Railway."

### Q16: How do you test the WebSocket event contract in continuous integration?
**Answer**:
"We wrote automated integration tests with Vitest and `socket.io-client`. In `backend/src/tests/socket.test.ts`, the test suite boots an ephemeral HTTP/Socket.IO server on a random port, connects real client sockets for 'Host' and 'Participant', emits events (`create_room`, `join_room`, `play`, `request_playback_control`), and asserts that RBAC rejections occur for unauthorized participants while approved events broadcast correctly."

### Q17: How did you implement dynamic playback modes (Host Moderated vs. Free-for-All) without compromising server authority or creating race conditions?
**Answer**:
"We decoupled room playback permissions from fixed participant roles by checking `canControl = auth.role === 'HOST' || auth.role === 'MODERATOR' || auth.room.settings.playbackMode === 'FREE_FOR_ALL'`. In Free-for-All mode, any participant calling `play`, `pause`, `seek`, or `change_video` has their action executed authoritatively with monotonic revision bumping and drift timestamping, completely eliminating the need for request approval queues. However, administrative capabilities (promoting moderators, kicking participants, and updating room settings) remain strictly restricted to the Host. The state change is broadcast atomically via `room_settings_updated` so all connected clients adapt their UI immediately."

### Q18: How does the server enforce chat rate-limiting (slow mode) without relying on client-side state?
**Answer**:
"Client-side timers can easily be bypassed by modifying local JavaScript code or sending raw WebSocket messages. Therefore, slow mode is enforced strictly on the backend: the `RoomManager` maintains a `lastChatMessageTimes` timestamp map per participant. When a participant sends a message via `send_chat`, the server evaluates `Date.now() - lastTime < slowModeSeconds * 1000`. If violated, the request is rejected with `SLOW_MODE_ACTIVE` and the remaining cooldown in seconds, before any message is broadcast. To provide a smooth user experience, the frontend mirrors this with a local countdown timer on the submit button and input field, but the backend remains the ultimate gatekeeper. Hosts and Moderators are granted automatic cooldown bypass."

### Q19: How do room locks and passcodes work in a real-time WebSocket architecture?
**Answer**:
"When a room is marked `isLocked: true`, the backend `RoomManager.joinRoom` method immediately throws a `ROOM_LOCKED` error, which emits an `operation_rejected` event to the connecting socket without joining them to the Socket.IO room or adding them to the participant list. For passcode protection, the Host configures a secret string stored securely on the server. The public `RoomSettings` object only exposes a boolean `hasPasscode: true` so the hash/plaintext is never leaked to clients. During `join_room`, the client must send a `passcode` property; if absent or incorrect, the server throws `ROOM_PASSCODE_REQUIRED` or `INVALID_PASSCODE`, and the landing page UI prompts the user accordingly."

### Q20: How do you handle schema evolution and database persistence in SQLite for new room attributes?
**Answer**:
"In SQLite, `CREATE TABLE IF NOT EXISTS` does not modify tables that already exist from earlier versions of the application. To ensure zero-downtime schema evolution when introducing features like `playback_mode`, `is_locked`, `passcode`, and `slow_mode_seconds`, we execute idempotent `ALTER TABLE rooms ADD COLUMN ...` statements wrapped in safe try/catch blocks within the `getDatabase()` initialization routine. This guarantees that newly created databases receive the full schema immediately, while existing developer or production databases are upgraded non-destructively without requiring manual migration scripts or dropping existing tables."
