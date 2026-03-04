import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Check, Video, Mic, MicOff, VideoOff, X, MessageSquare, Send, GripHorizontal, Link2, Users, Sparkles, ArrowLeft, DoorOpen, Maximize2, Minimize2, Wifi, WifiOff } from 'lucide-react'
import { usePrivateRoom, ParticipantInfo } from '../hooks/usePrivateRoom'
import { VideoPlayer } from './VideoPlayer'

interface PrivateRoomProps {
    onBack: () => void;
}

// Dynamic grid columns — responsive for mobile
function getGridStyle(total: number): { cols: string; mobileCols: string } {
    if (total <= 1) return { cols: '1', mobileCols: '1' };
    if (total === 2) return { cols: '2', mobileCols: '1' };
    if (total <= 4) return { cols: '2', mobileCols: '2' };
    if (total <= 6) return { cols: '3', mobileCols: '2' };
    if (total <= 9) return { cols: '3', mobileCols: '2' };
    if (total <= 12) return { cols: '4', mobileCols: '3' };
    if (total <= 16) return { cols: '4', mobileCols: '3' };
    if (total <= 25) return { cols: '5', mobileCols: '3' };
    return { cols: '6', mobileCols: '4' };
}

// Connection quality color
function qualityColor(q: string): string {
    if (q === 'excellent') return 'bg-emerald-400';
    if (q === 'good') return 'bg-green-400';
    if (q === 'poor') return 'bg-yellow-400';
    return 'bg-red-400';
}

// ---- Video Tile Component ----
function VideoTile({
    stream,
    label,
    isSpeaking,
    isMuted,
    isCameraOff,
    quality,
    isPinned,
    onPin,
    isLocal
}: {
    stream: MediaStream | null;
    label: string;
    isSpeaking?: boolean;
    isMuted?: boolean;
    isCameraOff?: boolean;
    quality?: string;
    isPinned?: boolean;
    onPin?: () => void;
    isLocal?: boolean;
}) {
    return (
        <div
            className={`relative rounded-xl overflow-hidden bg-zinc-900 min-h-0 group transition-all duration-300 ${isPinned ? 'col-span-full row-span-2 md:col-span-2 md:row-span-2' : ''
                } ${isSpeaking ? 'ring-2 ring-violet-500 ring-offset-1 ring-offset-black shadow-lg shadow-violet-500/20' : ''
                }`}
            onClick={onPin}
        >
            <div className="w-full h-full">
                {stream && !isCameraOff ? (
                    <VideoPlayer stream={stream} muted={!!isLocal} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 gap-2">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-zinc-700/50 flex items-center justify-center">
                            <span className="text-base sm:text-lg font-bold text-zinc-400 uppercase">{label.charAt(0)}</span>
                        </div>
                        {isCameraOff && <VideoOff className="w-4 h-4 text-zinc-600 mt-1" />}
                    </div>
                )}
            </div>

            {/* Speaking glow animation */}
            {isSpeaking && (
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 border-2 border-violet-500/60 rounded-xl animate-pulse" />
                </div>
            )}

            {/* Bottom bar */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 sm:p-2.5 flex items-end justify-between pointer-events-none z-20">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] sm:text-[11px] font-semibold text-white truncate max-w-[100px] sm:max-w-[140px]">{label}</span>
                    {isMuted && <MicOff className="w-3 h-3 text-red-400 flex-shrink-0" />}
                    {isSpeaking && !isMuted && (
                        <div className="flex items-center gap-[2px] ml-0.5">
                            <div className="w-[3px] h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-[3px] h-3 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-[3px] h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {quality && <div className={`w-2 h-2 rounded-full ${qualityColor(quality)}`} />}
                </div>
            </div>

            {/* Pin button (hover) */}
            <button
                onClick={(e) => { e.stopPropagation(); onPin?.(); }}
                className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-black/40 text-white/70 hover:text-white hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-all cursor-pointer pointer-events-auto"
                title={isPinned ? 'Lepas Pin' : 'Pin'}
            >
                {isPinned ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
        </div>
    );
}

export function PrivateRoom({ onBack }: PrivateRoomProps) {
    const {
        localStream,
        participants,
        hasConnectedPeers,
        participantCount,
        roomCode,
        waitingForGuest,
        error,
        roomClosed,
        createRoom,
        joinRoom,
        leaveRoom,
        toggleMic,
        toggleCamera,
        micEnabled,
        cameraEnabled,
        messages,
        sendMessage,
    } = usePrivateRoom();

    const [joinCode, setJoinCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [pinnedId, setPinnedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Draggable control bar
    const [controlPos, setControlPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

    const handleDragStart = useCallback((clientX: number, clientY: number) => {
        setIsDragging(true);
        dragStartRef.current = { x: clientX, y: clientY, startX: controlPos.x, startY: controlPos.y };
    }, [controlPos]);
    const handleDragMove = useCallback((clientX: number, clientY: number) => {
        if (!isDragging) return;
        setControlPos({ x: dragStartRef.current.startX + (clientX - dragStartRef.current.x), y: dragStartRef.current.startY + (clientY - dragStartRef.current.y) });
    }, [isDragging]);
    const handleDragEnd = useCallback(() => setIsDragging(false), []);
    const onMouseDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); handleDragStart(e.clientX, e.clientY); }, [handleDragStart]);

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
        const onUp = () => handleDragEnd();
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [isDragging, handleDragMove, handleDragEnd]);

    const onTouchStart = useCallback((e: React.TouchEvent) => { handleDragStart(e.touches[0].clientX, e.touches[0].clientY); }, [handleDragStart]);

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        const onUp = () => handleDragEnd();
        window.addEventListener('touchmove', onMove, { passive: true }); window.addEventListener('touchend', onUp);
        return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
    }, [isDragging, handleDragMove, handleDragEnd]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
    useEffect(() => {
        if (hasConnectedPeers && window.innerWidth >= 768) setIsChatOpen(true);
        if (!hasConnectedPeers) setIsChatOpen(false);
    }, [hasConnectedPeers]);

    const handleCopy = () => {
        if (!roomCode) return;
        const shareUrl = `${window.location.origin}?room=${roomCode}`;
        navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    };

    const handleSendMessage = (e: React.FormEvent) => { e.preventDefault(); if (chatInput.trim()) { sendMessage(chatInput); setChatInput(''); } };
    const handleJoinSubmit = (e: React.FormEvent) => { e.preventDefault(); if (joinCode.trim()) joinRoom(joinCode); };

    // Build participant streams for rendering
    const remoteStreams = useMemo(() => {
        return participants.map((p: ParticipantInfo) => {
            const stream = new MediaStream();
            if (p.videoTrack) stream.addTrack(p.videoTrack);
            if (p.audioTrack) stream.addTrack(p.audioTrack);
            return { ...p, stream: stream.getTracks().length > 0 ? stream : null };
        });
    }, [participants]);

    const gridStyle = useMemo(() => getGridStyle(participantCount), [participantCount]);

    // ===== LOBBY =====
    if (!roomCode && !roomClosed) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative">
                {localStream && (
                    <div className="absolute inset-0 overflow-hidden rounded-2xl">
                        <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover ${!cameraEnabled ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                    </div>
                )}
                <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center">
                    <button onClick={onBack} className="self-start mb-6 sm:mb-8 flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                        <ArrowLeft className="w-4 h-4" /> Kembali
                    </button>
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-2xl shadow-violet-500/30 mb-6 sm:mb-8 rotate-3 hover:rotate-6 transition-transform">
                        <Users className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                    </div>
                    <h2 className="text-2xl sm:text-4xl font-bold tracking-tighter text-white mb-2 sm:mb-3 text-center">Ruang Privat</h2>
                    <p className="text-white/60 text-center mb-8 sm:mb-10 text-sm sm:text-base leading-relaxed max-w-xs">Video call bersama teman. Mendukung banyak peserta dengan kualitas tinggi.</p>
                    {error && <div className="w-full mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center">{error}</div>}
                    <div className="w-full flex flex-col gap-3">
                        <button onClick={createRoom} className="w-full group relative overflow-hidden bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl p-4 sm:p-5 text-left transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-violet-500/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 font-semibold text-sm sm:text-base mb-1"><Sparkles className="w-4 h-4" /> Buat Ruang Baru</div>
                                    <p className="text-xs sm:text-sm text-white/70">Dapatkan kode unik untuk dibagikan ke teman</p>
                                </div>
                                <DoorOpen className="w-5 h-5 sm:w-6 sm:h-6 text-white/40 group-hover:text-white/80 transition-colors" />
                            </div>
                        </button>
                        <div className="flex items-center gap-3 my-1">
                            <div className="flex-1 h-px bg-white/10" /><span className="text-[10px] sm:text-xs text-white/30 uppercase tracking-widest font-semibold">atau</span><div className="flex-1 h-px bg-white/10" />
                        </div>
                        <form onSubmit={handleJoinSubmit} className="w-full">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 sm:p-4 backdrop-blur-sm">
                                <label className="text-xs sm:text-sm font-medium text-white/70 mb-2 block">Masukkan Kode Ruang</label>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="A3B7K2" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={6} className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-center text-base sm:text-lg font-mono tracking-[0.3em] uppercase" />
                                    <button type="submit" disabled={joinCode.length < 3} className="bg-white text-zinc-900 hover:bg-zinc-100 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold text-sm sm:text-base transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95">Gabung</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    // ===== ROOM CLOSED =====
    if (roomClosed) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-5 sm:mb-6"><X className="w-7 h-7 sm:w-8 sm:h-8 text-red-400" /></div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">Ruang Ditutup</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mb-6 sm:mb-8 text-center max-w-xs text-sm sm:text-base">Koneksi ke ruangan terputus.</p>
                <button onClick={onBack} className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-6 py-3 rounded-full font-semibold transition-all cursor-pointer active:scale-95">Kembali ke Beranda</button>
            </div>
        );
    }

    // ===== WAITING / CONNECTED =====
    return (
        <div className="flex-1 flex overflow-hidden gap-2 sm:gap-3 relative">
            <div className="flex-1 min-w-0 min-h-0 relative z-10 flex flex-col">
                <div className="w-full flex-1 min-h-0 bg-zinc-200/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden relative shadow-sm">

                    {/* Waiting screen */}
                    {waitingForGuest && !hasConnectedPeers && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                            {localStream && (
                                <div className="absolute inset-0 overflow-hidden">
                                    <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover ${!cameraEnabled ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
                                </div>
                            )}
                            <div className="relative z-20 flex flex-col items-center text-center p-4 sm:p-6 max-w-sm">
                                <div className="relative flex items-center justify-center mb-5 sm:mb-6">
                                    <div className="absolute w-20 h-20 sm:w-24 sm:h-24 border border-violet-400/20 rounded-full animate-ping opacity-30" />
                                    <div className="absolute w-14 h-14 sm:w-16 sm:h-16 border border-violet-400/30 rounded-full animate-ping opacity-40" />
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl shadow-violet-500/30 z-10"><Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" /></div>
                                </div>
                                <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">Menunggu Peserta</h2>
                                <p className="text-white/50 text-xs sm:text-sm mb-5 sm:mb-6">Bagikan kode atau link ke teman Anda</p>
                                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 sm:p-4 w-full mb-4">
                                    <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-white/40 mb-1.5 sm:mb-2 font-semibold">Kode Ruang</div>
                                    <div className="text-2xl sm:text-3xl font-mono font-bold text-white tracking-[0.35em] sm:tracking-[0.4em] mb-2.5 sm:mb-3">{roomCode}</div>
                                    <button onClick={handleCopy} className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer active:scale-95">
                                        {copied ? <><Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" /><span className="text-emerald-400">Link Disalin!</span></> : <><Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Salin Link Undangan</>}
                                    </button>
                                </div>
                                <button onClick={leaveRoom} className="text-white/40 hover:text-white/80 text-xs sm:text-sm transition-colors cursor-pointer mt-1 sm:mt-2">Tutup Ruangan</button>
                            </div>
                        </div>
                    )}

                    {/* Connected: Dynamic Video Grid */}
                    {hasConnectedPeers && (
                        <div
                            className="absolute inset-0 bg-black p-1 grid gap-1 auto-rows-fr"
                            style={{
                                gridTemplateColumns: `repeat(${window.innerWidth < 768 ? gridStyle.mobileCols : gridStyle.cols}, 1fr)`
                            }}
                        >
                            {/* Local */}
                            <VideoTile
                                stream={localStream}
                                label="Kamu"
                                isMuted={!micEnabled}
                                isCameraOff={!cameraEnabled}
                                isPinned={pinnedId === '__local__'}
                                onPin={() => setPinnedId(prev => prev === '__local__' ? null : '__local__')}
                                isLocal
                            />

                            {/* Remote participants */}
                            {remoteStreams.map((p) => (
                                <VideoTile
                                    key={p.identity}
                                    stream={p.stream}
                                    label={p.name}
                                    isSpeaking={p.isSpeaking}
                                    isMuted={p.isMuted}
                                    isCameraOff={p.isCameraOff}
                                    quality={p.connectionQuality}
                                    isPinned={pinnedId === p.identity}
                                    onPin={() => setPinnedId(prev => prev === p.identity ? null : p.identity)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Top-right badges */}
                    {hasConnectedPeers && (
                        <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-40 flex items-center gap-1.5 sm:gap-2">
                            <div className="bg-black/50 backdrop-blur-md px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold text-white border border-white/10 flex items-center gap-1 sm:gap-1.5">
                                <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {participantCount}
                            </div>
                            {roomCode && (
                                <button onClick={handleCopy} className="bg-black/50 backdrop-blur-md px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-mono font-semibold text-white border border-white/10 hover:bg-black/70 transition-all cursor-pointer" title="Salin kode">
                                    {roomCode}
                                </button>
                            )}
                            {!isChatOpen && (
                                <button onClick={() => setIsChatOpen(true)} className="p-1.5 sm:p-2 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md text-white border border-white/10 transition-all relative cursor-pointer" title="Obrolan">
                                    <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                    {messages.length > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Draggable Control Bar */}
                <div
                    style={{ transform: `translate(calc(-50% + ${controlPos.x}px), ${controlPos.y}px)`, left: '50%', bottom: '0.75rem' }}
                    className={`absolute z-30 flex items-center gap-1 sm:gap-1.5 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-xl border border-zinc-200 dark:border-white/10 p-1 sm:p-1.5 rounded-full shadow-2xl select-none transition-opacity duration-300 ${hasConnectedPeers ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDragging ? 'cursor-grabbing' : ''}`}
                >
                    <div onMouseDown={onMouseDown} onTouchStart={onTouchStart} className="w-7 h-9 sm:w-8 sm:h-11 rounded-full flex items-center justify-center text-zinc-400 cursor-grab active:cursor-grabbing touch-none">
                        <GripHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="w-px h-6 sm:h-7 bg-zinc-300 dark:bg-zinc-600" />
                    <button onClick={toggleMic} className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'}`}>
                        {micEnabled ? <Mic className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> : <MicOff className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
                    </button>
                    <button onClick={toggleCamera} className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${cameraEnabled ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'}`}>
                        {cameraEnabled ? <Video className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> : <VideoOff className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
                    </button>
                    <div className="w-px h-6 sm:h-7 bg-zinc-300 dark:bg-zinc-600 mx-0.5" />
                    <button onClick={leaveRoom} className="h-9 sm:h-11 px-3 sm:px-5 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-all active:scale-95 shadow-md shadow-red-500/20 text-xs sm:text-sm cursor-pointer">
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="hidden sm:inline">Keluar</span>
                    </button>
                </div>
            </div>

            {/* Chat Sidebar */}
            <aside className={`flex-shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all duration-300 ease-in-out z-20 ${isChatOpen && hasConnectedPeers ? 'w-[calc(100%-0.5rem)] sm:w-72 md:w-72 lg:w-80 translate-x-0 opacity-100 visible absolute sm:relative right-1 sm:right-0 inset-y-0' : 'w-0 translate-x-full opacity-0 invisible'}`}>
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                    <div className="flex items-center gap-2 font-medium text-xs sm:text-sm">
                        <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500 dark:text-zinc-400" /><span className="text-zinc-900 dark:text-zinc-100">Obrolan Grup</span>
                    </div>
                    <button onClick={() => setIsChatOpen(false)} className="p-1 sm:p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer"><X className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3 bg-zinc-50/50 dark:bg-zinc-950/50 min-h-0">
                    {messages.length === 0 ? (
                        <div className="m-auto text-center text-zinc-400 dark:text-zinc-600 text-xs sm:text-sm flex flex-col items-center gap-2"><MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 opacity-20" />Sapa teman-teman Anda!</div>
                    ) : (
                        messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col max-w-[85%] ${msg.sender === 'me' ? 'self-end items-end' : 'self-start items-start'}`}>
                                <span className="text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 mb-0.5 sm:mb-1 px-1 uppercase tracking-wider">{msg.senderName}</span>
                                <div className={`px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-xs sm:text-sm ${msg.sender === 'me' ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 rounded-tr-sm' : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/50 rounded-tl-sm shadow-sm'}`} style={{ wordBreak: 'break-word' }}>{msg.text}</div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="p-2 sm:p-2.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                    <form onSubmit={handleSendMessage} className="flex gap-1.5 sm:gap-2">
                        <input type="text" placeholder="Ketik pesan..." className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-full px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
                        <button type="submit" disabled={!chatInput.trim()} className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 p-2 sm:p-2.5 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer">
                            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" />
                        </button>
                    </form>
                </div>
            </aside>
        </div>
    );
}
