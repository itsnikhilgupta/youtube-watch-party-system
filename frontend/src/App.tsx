import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WatchPartyProvider } from './context/WatchPartyContext.js';
import { LandingPage } from './pages/LandingPage.js';
import { RoomPage } from './pages/RoomPage.js';

export function App() {
  return (
    <WatchPartyProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WatchPartyProvider>
  );
}

export default App;
