# WatchTogether — YouTube Watch Party System

A production-ready, full-stack YouTube Watch Party web application built with **React**, **TypeScript**, **Node.js**, **Express**, **Socket.IO**, **SQLite**, and the official **YouTube IFrame Player API**.

WatchTogether allows groups of users to watch YouTube videos in real time with synchronized playback, server-authoritative role-based access control (RBAC), approval-based playback request workflows, and live room chat.

---

## Architecture Overview

WatchTogether follows an **authoritative server architecture**. The browser clients never dictate or mutate shared room state directly; instead, all mutations pass through server-side validation and authorization before being broadcast.

```
Browser A (Host / Mod)           Socket.IO Server                     Browser B / C (Viewers)
         |                              |                                       |
         | --- Playback Event --------> |                                       |
         |     (play / seek / change)   |                                       |
         |                              | 1. Authenticate socket identity       |
         |                              | 2. Enforce RBAC permissions           |
         |                              | 3. Validate Zod payload               |
         |                              | 4. Update authoritative room state    |
         |                              | 5. Persist to SQLite metadata         |
         |                              |                                       |
         | <--- Authoritative Sync ---- | ------------------------------------> |
         |      (sync_state broadcast)  |                                       |
         |                              |                                       |
         v                              v                                       v
[ YouTube Player ]              [ SQLite Storage ]                      [ YouTube Player ]
(applies drift correction)                                              (applies drift correction)
```

### Playback Request Workflow (Participants)

When an unauthorized user (Participant / Viewer) attempts to play, pause, seek, or change a video:
1. Participant submits a `request_playback_control` event.
2. Server validates room membership, generates a unique UUID `requestId`, and marks it as `PENDING`.
3. Host receives a real-time notification in the **Requests Panel**.
4. If the Host clicks **Approve**, the server re-validates the request, executes the state update authoritatively, broadcasts the new `sync_state`, and marks the request as `APPROVED`.
5. Duplicate approvals and replay attacks are strictly prevented.

---

## Key Features

- **Complete Video Player Control Bar**:
  - **Cinematic Ambient Viewing Effect**: Softly blurred ambient lighting layer (`blur(85px) saturate(170%)`) derived from the active video's high-definition thumbnail. Placed cleanly behind the player and UI with zero pointer event interception, a gentle dark vignette radial overlay, and full `@media (prefers-reduced-motion)` accessibility support.
  - **YouTube Watch Page Layout**: Redesigned around the video centerpiece:
    - Prominent bold video title and Host/Room channel metadata row directly below the player.
    - Synchronized live status pill and compact inline "Change Video" action bar with suggestion chips.
    - Compact, sticky streaming sidebar aligned with the top of the video player for real participants, pending requests, and live chat.
  - **Translucent Player Controls**: Sleek translucent dark surface (`backdrop-blur-md`, `bg-[#0F0F14]/90`) with a smooth contrast bottom gradient overlay on the video viewport.
  - **Permanent Video Quality Selection Architecture (Bug Fix)**:
    - Fully decoupled user requested preference (`qualityPreference`), player command, and actual playing stream resolution (`actualQuality`).
    - Stored locally in `localStorage` without resetting to "Auto" upon buffering or `onStateChange` callbacks.
    - Inspects `getAvailableQualityLevels()` and `getPlaybackQuality()` while gracefully handling YouTube Adaptive Bitrate (ABR) constraints.
    - Displays honest status in the settings menu: shows the requested preference, currently delivered stream resolution, and clear non-blocking adaptive bitrate notices.
    - Never triggers player recreation, remounting, or synchronization loops.
  - **Fullscreen Mode**: Browser Fullscreen API toggle with dynamic state monitoring and exit support (`f` key).
  - **Theater Mode**: Expands the video player across the full viewport width, moving controls and participant panels cleanly below the player (`t` key).
  - **Interactive Quality Selector**: Uses `getAvailableQualityLevels()` and `setPlaybackQuality()` with options from 144p to 1080p and Auto.
  - **Subtitles & Closed Captions (CC)**: CC toggle button and caption language selector via official YouTube caption module (`c` key).
  - **Volume & Mute**: Local volume slider (0-100%) and mute toggle (`m` key).
  - **Playback Speed**: Local speed selector (0.25x, 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x).
  - **Interactive Progress Bar**: Scrubbing/seeking with live hover timestamp tooltip.
  - **Comprehensive Settings Menu**: Clean grouped menu for quality, speed, and captions.
  - **Keyboard Shortcuts**: `Space`/`k` (play/pause), `f` (fullscreen), `m` (mute), `t` (theater), `ArrowLeft`/`ArrowRight` (seek -/+5s), `ArrowUp`/`ArrowDown` (volume -/+5%). Input fields are safeguarded from accidental triggering.
- **YouTube IFrame API Capabilities & Limitations**:
  - **Quality Selection**: While `setPlaybackQuality()` is invoked, YouTube's embedded player algorithm may override resolution based on user bandwidth and viewport dimensions.
  - **Captions Module**: Subtitles are only displayed when provided by the video creator or YouTube auto-captioning. Unavailable caption tracks are handled gracefully with honest status indicators.
  - **Local vs. Synced Controls**: Fullscreen, theater mode, volume, quality, captions, and playback speed remain local preferences, preserving synchronized party playback without emitting unwanted server events.
- **Authoritative Real-Time Synchronization**: Monotonically increasing revision counter (`revision`), server timestamps, and elapsed time calculation prevent stale updates.
- **Sub-Second Drift Correction**: Evaluates playback drift (`drift > 1.5s`) and automatically corrects player position without infinite seek loops.
- **Server-Side Role-Based Access Control (RBAC)**:
  - **HOST**: Full playback control, promote/demote Moderators, remove participants, approve/reject playback requests.
  - **MODERATOR**: Directly play, pause, seek, and change video. Cannot remove participants or assign roles.
  - **PARTICIPANT**: View synchronized stream, send chat messages, submit playback requests for Host approval.
- **Cryptographically Secure Room Identifiers**: 9-character collision-resistant room codes (e.g. `w7k-m9p-2qx`) generated via `crypto.randomBytes`.
- **Server-Controlled Participant Identity**: Unique UUID generated per participant connection; clients cannot spoof or tamper with identity or roles.
- **Host Disconnection Grace Period**: If the Host temporarily disconnects (e.g. network blip or page refresh), a 15-second grace period timer starts, notifying participants instead of abruptly terminating the session.
- **Room Mode Settings & Host Permissions**:
  - **Configurable Playback Modes**:
    - **Host Moderated (Default)**: Strict role-based control where viewers must request approval to play, pause, seek, or change video.
    - **Free-for-All (Party Mode)**: Casual party mode allowing all connected room participants to directly play, pause, seek, and change video without submitting requests.
  - **Room Privacy & Security**:
    - **Lock Room**: Host can lock the room session to prevent new viewers from entering.
    - **Join Passcode**: Optional join passcode protection. Rooms with passcodes require correct credentials on entry.
  - **Chat Slow Mode**:
    - Rate-limits participant chat messages (`Off`, `3s`, `5s`, `10s`, `30s`) to prevent spam/flooding during busy sessions, with live countdown indicators on the chat interface. Hosts and Moderators automatically bypass slow mode.
  - **Live Room Settings Modal**: Seamless glassmorphic control dialog for the Host with real-time room-wide WebSocket synchronization and SQLite persistence.
- **SQLite Persistent Metadata**: Parameterized database queries store room metadata, lifecycle status, room settings, and playback state using modern Node.js SQLite integration (`DatabaseSync` / WAL mode).
- **Interactive Room Chat**: Real-time room messaging with sender role badges, timestamps, auto-scroll, slow mode rate-limiting, and character limits (280 chars).
- **YouTube URL Parsing & Safety**: Accepts standard watch links (`youtube.com/watch?v=`), short links (`youtu.be/`), embeds, and shorts, extracting verified 11-character video IDs. Rejects arbitrary iframe injections and non-YouTube URLs.
- **Responsive Dark Theme**: Modern aesthetic built with Tailwind CSS, charcoal palettes (`#0d0e12`), subtle slate borders, and red streaming accents.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Socket.IO Client, Lucide React |
| **Backend** | Node.js (v20+ / v24+), Express.js, TypeScript, Socket.IO, Zod, Node `crypto` |
| **Database** | SQLite with parameterized queries, WAL journal mode |
| **Testing** | Vitest (unit & integration tests for both frontend and backend) |
| **Deployment** | Vercel (Frontend static hosting), Render / Railway (Backend WebSocket hosting) |

---

## Directory Structure

```
watchtogether/
├── backend/
│   ├── src/
│   │   ├── config/             # Environment configuration & defaults
│   │   ├── database/           # SQLite schema, queries & persistence
│   │   ├── services/           # RoomManager & RequestManager services
│   │   ├── sockets/            # Socket.IO event router & RBAC enforcement
│   │   ├── tests/              # Vitest test suite (backend unit & integration)
│   │   ├── types/              # Domain models & Zod validation schemas
│   │   ├── utils/              # Crypto ID generators & YouTube URL parser
│   │   └── index.ts            # Express + Socket.IO server entry point
│   ├── data/                   # SQLite database storage (gitignored)
│   ├── .env.example
│   ├── render.yaml             # Render deployment configuration
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/         # YouTubePlayer, Navbar, ParticipantsList, etc.
│   │   ├── context/            # WatchPartyContext (Socket.IO client state)
│   │   ├── pages/              # LandingPage & RoomPage
│   │   ├── tests/              # Frontend utility Vitest suite
│   │   ├── types/              # TypeScript client types
│   │   ├── utils/              # YouTube parser & time formatters
│   │   ├── App.tsx             # React Router routing
│   │   ├── index.css           # Tailwind design tokens & dark styling
│   │   └── main.tsx            # React application root
│   ├── .env.example
│   ├── vercel.json             # Vercel SPA rewrites configuration
│   └── package.json
│
├── package.json                # Root workspace scripts & concurrently runner
├── README.md                   # Complete architectural and setup guide
└── INTERVIEW_GUIDE.md          # Technical interview questions and answers
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher (tested on Node `v24.20.0`)
- **npm**: `v10.0.0` or higher

---

## Installation & Setup

1. **Clone or enter the project repository**:
   ```bash
   cd WatchTogether
   ```

2. **Install all dependencies**:
   ```bash
   # Install root concurrently runner
   npm install

   # Install backend dependencies
   cd backend && npm install && cd ..

   # Install frontend dependencies
   cd frontend && npm install && cd ..
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` in both `backend` and `frontend`:
   ```bash
   # Backend
   cp backend/.env.example backend/.env

   # Frontend
   cp frontend/.env.example frontend/.env
   ```

---

## Running Locally

To run both backend and frontend concurrently in development mode from the root directory:
```bash
npm run dev
```

Alternatively, run each service independently:
```bash
# Terminal 1: Backend (runs on port 4000)
cd backend
npm run dev

# Terminal 2: Frontend (runs on http://localhost:5173)
cd frontend
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## Running Automated Tests

The project includes unit and integration tests covering room creation, RBAC authorization rules, playback synchronization revisions, playback request approvals, Room Mode Settings (Host permissions, Free-for-All, lock, passcode, chat slow mode), security sanitization, and URL parsing.

Run all tests across the repository:
```bash
npm run test
```

Or run tests individually:
```bash
# Backend unit & Socket.IO integration tests (21 tests)
npm run test:backend

# Frontend utility & helper tests (15 tests)
npm run test:frontend
```

---

## Socket.IO Event Specification

| Event Name | Direction | Authorized Roles | Description |
|---|---|---|---|
| `create_room` | Client ➔ Server | Anyone | Creates a new room; client becomes authoritative `HOST`. |
| `join_room` | Client ➔ Server | Anyone | Joins existing room as `PARTICIPANT`. Validates `passcode` and checks `isLocked`. |
| `reconnect_session` | Client ➔ Server | Reconnecting user | Rebinds session UUID to new socket ID after refresh. Cancels Host grace timer. |
| `update_room_settings` | Client ➔ Server | `HOST` only | Updates playback mode, room lock, passcode, and chat slow mode cooldown. |
| `room_settings_updated` | Server ➔ Room | Broadcast | Dispatches new `RoomSettings` and `RoomState` to all room members. |
| `play` | Client ➔ Server | `HOST`, `MODERATOR`, or anyone if `FREE_FOR_ALL` | Starts playback at given timestamp. |
| `pause` | Client ➔ Server | `HOST`, `MODERATOR`, or anyone if `FREE_FOR_ALL` | Pauses playback at given timestamp. |
| `seek` | Client ➔ Server | `HOST`, `MODERATOR`, or anyone if `FREE_FOR_ALL` | Adjusts playback timestamp across all clients. |
| `change_video` | Client ➔ Server | `HOST`, `MODERATOR`, or anyone if `FREE_FOR_ALL` | Changes active video ID and resets playback to 00:00. |
| `request_playback_control` | Client ➔ Server | `PARTICIPANT` | Submits approval request for play, pause, seek, or change video. |
| `playback_request_received` | Server ➔ Room | Broadcast | Informs room (Host UI) of incoming participant request. |
| `respond_to_playback_request`| Client ➔ Server | `HOST` only | Approves or rejects request. If approved, executes authoritative state change. |
| `playback_request_updated` | Server ➔ Room | Broadcast | Broadcasts updated request status (`APPROVED` or `REJECTED`). |
| `send_chat` | Client ➔ Server | Room members | Sends chat message. Enforces slow mode cooldown on `PARTICIPANT`. |
| `chat_message` | Server ➔ Room | Broadcast | Broadcasts chat message with sender metadata and timestamps. |
| `assign_role` | Client ➔ Server | `HOST` only | Promotes to `MODERATOR` or demotes to `PARTICIPANT`. |
| `remove_participant` | Client ➔ Server | `HOST` only | Disconnects and removes participant from session. |
| `sync_state` | Server ➔ Room | Broadcast | Authoritative room state payload with monotonically increasing revision counter. |
| `operation_rejected` | Server ➔ Client | Unicast error | Structured error object returned when validation or permissions fail. |

---

## Production Build

To verify that both frontend and backend compile for production:
```bash
npm run build
```

This executes:
- Backend: `tsc` to produce compiled JavaScript in `backend/dist`
- Frontend: `tsc -b && vite build` to generate the optimized client bundle in `frontend/dist`

---

## Deployment Guide

### 1. Deploy Backend (Render / Railway)

1. Push your repository to GitHub.
2. Sign in to [Render](https://render.com) or [Railway](https://railway.app).
3. Create a new **Web Service** pointing to your repository.
4. Set the Root Directory to `backend`.
5. Configure the build and start commands:
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm run start`
6. Add the following Environment Variables in the hosting dashboard:
   - `PORT`: `10000` (or the port provided by your cloud host)
   - `NODE_ENV`: `production`
   - `CLIENT_ORIGIN`: Your deployed frontend URL (e.g., `https://your-app.vercel.app`)
   - `HOST_RECONNECT_GRACE_PERIOD_MS`: `15000`
   - `DATABASE_PATH`: `./data/watchtogether.db`
7. Ensure WebSockets are enabled (standard on Render and Railway).

### 2. Deploy Frontend (Vercel)

1. Sign in to [Vercel](https://vercel.com).
2. Click **Add New Project** and select your GitHub repository.
3. Configure the Project Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add the Environment Variable:
   - `VITE_API_URL`: Your deployed backend URL (e.g., `https://your-backend.onrender.com`)
5. Click **Deploy**. The included `frontend/vercel.json` file ensures client-side routing works for all routes (`/room/:roomId`).

### 3. Verify Cross-Session Synchronization

1. Open your deployed frontend URL in two separate browser windows (or one incognito window).
2. In Window 1, enter a name (e.g., "Alice") and click **Start Watch Party**.
3. Copy the party link or 9-character room code from the top bar.
4. In Window 2, paste the link or enter the room code with the name "Bob" and join.
5. In Window 1, press **Play** or change the video URL. Notice Window 2 updates immediately with sub-second synchronization.
6. In Window 2, notice playback controls are locked into Viewer Mode; click **Request Control** and verify that Window 1 receives the approval request.

---

## Security & Reliability Considerations

1. **Never Trust Browser Roles**: The server maintains authoritative session and role state in memory and database. Sockets emitting `play`, `pause`, `seek`, or `change_video` are verified against the server-stored participant role.
2. **Payload Validation**: Every Socket.IO incoming event is strictly checked by a dedicated Zod schema. Malformed or injected parameters are immediately rejected with structured error objects.
3. **No Raw HTML/iFrame Injection**: The user only submits video URLs or IDs; the YouTube IFrame API generates the iframe securely in an isolated DOM container.
4. **Rate Limiting & Request Flooding Protection**: Limits active pending playback requests to 10 per room.
5. **CORS Configuration**: Restricts socket and HTTP access to the designated `CLIENT_ORIGIN` in production mode.
6. **Clean Database Teardown**: Server listens to `SIGINT` and `SIGTERM` signals to cleanly flush and close SQLite database connections before process exit.

---

## Scaling Beyond Single Instance (Redis Adapter)

In the current MVP, active socket connections and transient room memory reside within the Node.js process, with room metadata persisted to SQLite.

To scale the backend horizontally across multiple server instances or containers:
1. **Socket.IO Redis Adapter**: Replace the in-memory socket adapter with `@socket.io/redis-adapter` backed by a Redis cluster, allowing broadcasts across multiple server nodes.
2. **Shared State Store**: Move `RoomManager` state from JavaScript `Map` objects into Redis Hashes or a centralized Redis database with atomic transactions (`MULTI`/`EXEC` or Lua scripts).
3. **Sticky Sessions**: Configure your load balancer (e.g. AWS ALB, NGINX, or Cloudflare) with sticky cookies if clients use polling fallback before WebSocket upgrades.
