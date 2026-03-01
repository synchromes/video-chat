import { useState, useEffect, useRef } from 'react'
import { Video, Mic, MicOff, SkipForward, X, VideoOff, Moon, Sun, MonitorPlay, Infinity, MessageSquare, Send } from 'lucide-react'
import { useWebRTC } from './hooks/useWebRTC'
import { VideoPlayer } from './components/VideoPlayer'
import { LayoutPicker, VideoLayout } from './components/LayoutPicker'

function App() {
  const {
    localStream,
    remoteStream,
    partnerConnected,
    searching,
    startSearch,
    skipPartner,
    disconnectUser,
    toggleMic,
    toggleCamera,
    micEnabled,
    cameraEnabled,
    messages,
    sendMessage
  } = useWebRTC();

  const [isDark, setIsDark] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [videoLayout, setVideoLayout] = useState<VideoLayout>(() => {
    return (localStorage.getItem('randomchat-layout') as VideoLayout) || 'side-by-side';
  });
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (partnerConnected && window.innerWidth >= 768) {
      setIsChatOpen(true);
    } else if (!partnerConnected) {
      setIsChatOpen(false);
    }
  }, [partnerConnected]);

  const handleLayoutChange = (layout: VideoLayout) => {
    setVideoLayout(layout);
    localStorage.setItem('randomchat-layout', layout);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendMessage(chatInput);
      setChatInput("");
    }
  };


  // Renders local + remote video based on current layout
  const renderVideos = () => {
    const localVideo = (
      <div className="relative overflow-hidden bg-zinc-900 w-full h-full">
        {localStream ? (
          <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover ${!cameraEnabled ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-900 text-sm">Loading camera</div>
        )}
        {!cameraEnabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
            <VideoOff className="w-8 h-8 text-zinc-600" />
          </div>
        )}
        <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none z-20">
          <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium tracking-wide text-white flex items-center gap-1.5 border border-white/10">
            You {!micEnabled && <MicOff className="w-3 h-3 text-red-400 ml-1" />}
          </div>
        </div>
      </div>
    );

    const remoteVideo = (
      <div className="relative overflow-hidden bg-zinc-900 w-full h-full">
        {remoteStream ? (
          <VideoPlayer stream={remoteStream} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-900 gap-3">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">Connecting</span>
          </div>
        )}
        <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none z-20">
          <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium tracking-wide text-white flex items-center gap-2 border border-white/10">
            Stranger
          </div>
        </div>
      </div>
    );

    switch (videoLayout) {
      case 'side-by-side':
        return (
          <div className="absolute inset-0 flex flex-col md:flex-row gap-1.5 p-1.5 bg-black">
            <div className="flex-1 min-h-0 min-w-0 rounded-xl overflow-hidden">{localVideo}</div>
            <div className="flex-1 min-h-0 min-w-0 rounded-xl overflow-hidden">{remoteVideo}</div>
          </div>
        );

      case 'focus':
        return (
          <div className="absolute inset-0 bg-black">
            <div className="absolute inset-0">{remoteVideo}</div>
            <div className="absolute bottom-4 right-4 w-36 sm:w-48 aspect-video rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 z-20">
              {localVideo}
            </div>
          </div>
        );

      case 'reverse-focus':
        return (
          <div className="absolute inset-0 bg-black">
            <div className="absolute inset-0">{localVideo}</div>
            <div className="absolute bottom-4 right-4 w-36 sm:w-48 aspect-video rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 z-20">
              {remoteVideo}
            </div>
          </div>
        );

      case 'stacked':
        return (
          <div className="absolute inset-0 flex flex-col gap-1.5 p-1.5 bg-black">
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden">{remoteVideo}</div>
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden">{localVideo}</div>
          </div>
        );

      case 'theater':
        return (
          <div className="absolute inset-0 bg-black">
            <div className="absolute inset-0">{remoteVideo}</div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-28 sm:w-36 aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-white/10 z-20">
              {localVideo}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans transition-colors duration-300 selection:bg-zinc-300 dark:selection:bg-zinc-700 overflow-hidden">

      {/* Header */}
      <header className="px-6 py-3 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xl z-20 flex-shrink-0">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tighter">
          <Infinity className="w-6 h-6" />
          <span>RandomChat.</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Systems operational</span>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex overflow-hidden p-2 sm:p-3 gap-3 relative isolate min-h-0">

        {/* Video Area */}
        <div className="flex-1 min-w-0 min-h-0 relative z-10 flex flex-col transition-all duration-300">

          <div className="w-full flex-1 min-h-0 bg-zinc-200/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden relative shadow-sm flex items-center justify-center transition-all duration-500">

            {/* Idle State: Show camera preview + Start/Searching */}
            {!partnerConnected && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">

                {/* Camera preview background */}
                {localStream && (
                  <div className="absolute inset-0 overflow-hidden">
                    <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover ${!cameraEnabled ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
                    {/* Dark overlay to make text readable */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
                  </div>
                )}

                {!cameraEnabled && localStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-0">
                    <VideoOff className="w-12 h-12 text-zinc-700" />
                  </div>
                )}

                {/* Content overlay */}
                <div className="relative z-20 flex flex-col items-center text-center p-6">
                  {searching ? (
                    <div className="flex flex-col items-center gap-6">
                      <div className="relative flex items-center justify-center">
                        <div className="absolute w-24 h-24 border border-white/20 rounded-full animate-ping opacity-20" />
                        <div className="absolute w-16 h-16 border border-white/30 rounded-full animate-ping opacity-30" />
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-zinc-900 shadow-xl z-10">
                          <MonitorPlay className="w-5 h-5" />
                        </div>
                      </div>
                      <div>
                        <h2 className="text-xl font-medium tracking-tight mb-2 text-white">Searching for connection</h2>
                        <p className="text-sm text-zinc-300">Please wait while we match you with a stranger.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center max-w-sm mx-auto">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-zinc-900 shadow-xl mb-6 rotate-3 transform transition-transform hover:rotate-6">
                        <MonitorPlay className="w-8 h-8" />
                      </div>
                      <h1 className="text-3xl sm:text-5xl font-bold tracking-tighter mb-4 text-white">
                        Meet Someone New.
                      </h1>
                      <p className="text-zinc-300 mb-8 text-base sm:text-lg leading-relaxed">
                        Connect with strangers securely via peer-to-peer. Minimalist, fast, anonymous.
                      </p>
                      <button
                        onClick={startSearch}
                        className="bg-white text-zinc-900 hover:bg-zinc-100 px-8 py-4 rounded-full font-semibold transition-all active:scale-[0.98] cursor-pointer text-base flex items-center justify-center gap-3 w-full sm:w-auto mx-auto shadow-lg"
                      >
                        Start Chatting
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Connected: Render dynamic layout */}
            {partnerConnected && (
              <>
                {renderVideos()}

                {/* Layout picker button (top-right) */}
                <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
                  <LayoutPicker
                    currentLayout={videoLayout}
                    onLayoutChange={handleLayoutChange}
                    isOpen={layoutPickerOpen}
                    onToggle={() => setLayoutPickerOpen(!layoutPickerOpen)}
                  />
                  {!isChatOpen && (
                    <button
                      onClick={() => setIsChatOpen(true)}
                      className="p-2 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-md text-white border border-white/10 transition-all relative"
                      title="Open Chat"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {messages.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </>
            )}

          </div>

          {/* Floating Control Bar */}
          <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-xl border border-zinc-200 dark:border-white/10 p-2 rounded-full shadow-2xl transition-all duration-300 ${(partnerConnected || searching) ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95 pointer-events-none'}`}>

            <button
              onClick={toggleMic}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white' : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'}`}
              title={micEnabled ? 'Mute' : 'Unmute'}
            >
              {micEnabled ? <Mic className="w-[18px] h-[18px]" /> : <MicOff className="w-[18px] h-[18px]" />}
            </button>

            <button
              onClick={toggleCamera}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${cameraEnabled ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white' : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'}`}
              title={cameraEnabled ? 'Camera Off' : 'Camera On'}
            >
              {cameraEnabled ? <Video className="w-[18px] h-[18px]" /> : <VideoOff className="w-[18px] h-[18px]" />}
            </button>

            <div className="w-px h-7 bg-zinc-300 dark:bg-zinc-600 mx-0.5" />

            {partnerConnected ? (
              <>
                <button
                  onClick={skipPartner}
                  className="px-5 h-11 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-50 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95 text-sm"
                >
                  <SkipForward className="w-4 h-4" />
                  <span className="hidden sm:inline">Skip</span>
                </button>
                <button
                  onClick={disconnectUser}
                  className="w-11 h-11 sm:w-auto sm:px-5 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold flex flex-shrink-0 items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-red-500/20 text-sm"
                  title="Stop"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              </>
            ) : searching ? (
              <button
                onClick={disconnectUser}
                className="px-5 h-11 rounded-full bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95 text-sm"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Chat Sidebar */}
        <aside
          className={`flex-shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all duration-300 ease-in-out z-20 
            ${isChatOpen && partnerConnected
              ? 'w-[calc(100%-1rem)] sm:w-80 md:w-72 lg:w-80 translate-x-0 opacity-100 visible absolute md:relative right-2 md:right-0 inset-y-2 md:inset-y-0'
              : 'w-0 translate-x-full opacity-0 invisible md:hidden'
            }`}
        >
          {/* Chat Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2 font-medium text-sm">
              <MessageSquare className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <span className="text-zinc-900 dark:text-zinc-100">Live Chat</span>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer"
              title="Close Chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative bg-zinc-50/50 dark:bg-zinc-950/50 min-h-0">
            {messages.length === 0 ? (
              <div className="m-auto text-center text-zinc-400 dark:text-zinc-600 text-sm flex flex-col items-center gap-2">
                <MessageSquare className="w-8 h-8 opacity-20" />
                Say hi to your new partner!
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col max-w-[85%] ${msg.sender === 'me' ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-1 px-1 uppercase tracking-wider">
                    {msg.sender === 'me' ? 'You' : 'Stranger'}
                  </span>
                  <div className={`px-3.5 py-2 rounded-2xl text-sm ${msg.sender === 'me'
                    ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 rounded-tr-sm'
                    : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/50 rounded-tl-sm shadow-sm'
                    }`}
                    style={{ wordBreak: 'break-word' }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-2.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 p-2.5 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        </aside>

      </main>
    </div>
  )
}

export default App
