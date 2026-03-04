import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Video, Mic, MicOff, VideoOff, X, MessageSquare, Send, GripHorizontal, Link2, Users, Sparkles, ArrowLeft, DoorOpen } from 'lucide-react'
import { usePrivateRoom } from '../hooks/usePrivateRoom'
import { VideoPlayer } from './VideoPlayer'

interface PrivateRoomProps {
    onBack: () => void;
}

// Calculate optimal grid columns for N participants
function getGridCols(total: number): string {
    if (total <= 1) return 'grid-cols-1';
    if (total <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (total <= 4) return 'grid-cols-2';
    if (total <= 6) return 'grid-cols-2 md:grid-cols-3';
    if (total <= 9) return 'grid-cols-3';
    if (total <= 16) return 'grid-cols-3 md:grid-cols-4';
    if (total <= 25) return 'grid-cols-4 md:grid-cols-5';
    if (total <= 36) return 'grid-cols-5 md:grid-cols-6';
    return 'grid-cols-6 md:grid-cols-8';
}

export function PrivateRoom({ onBack }: PrivateRoomProps) {
    const {
        localStream,
        remotePeers,
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
        sendMessage
    } = usePrivateRoom();

    const [joinCode, setJoinCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
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
        setControlPos({
            x: dragStartRef.current.startX + (clientX - dragStartRef.current.x),
            y: dragStartRef.current.startY + (clientY - dragStartRef.current.y),
        });
    }, [isDragging]);

    const handleDragEnd = useCallback(() => setIsDragging(false), []);
    const onMouseDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); handleDragStart(e.clientX, e.clientY); }, [handleDragStart]);

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
        const onUp = () => handleDragEnd();
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [isDragging, handleDragMove, handleDragEnd]);

    const onTouchStart = useCallback((e: React.TouchEvent) => { handleDragStart(e.touches[0].clientX, e.touches[0].clientY); }, [handleDragStart]);

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        const onUp = () => handleDragEnd();
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onUp);
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

    // ---- LOBBY ----
    if (!roomCode && !roomClosed) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {localStream && (
                    <div className="absolute inset-0 overflow-hidden rounded-2xl">
                        <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover ${!cameraEnabled ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                    </div>
                )}
                <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center">
                    <button onClick={onBack} className="self-start mb-8 flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                        <ArrowLeft className="w-4 h-4" /> Kembali
                    </button>
                    <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-violet-500/30 mb-8 rotate-3 hover:rotate-6 transition-transform">
                        <Users className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter text-white mb-3 text-center">Ruang Privat</h2>
                    <p className="text-white/60 text-center mb-10 text-base leading-relaxed max-w-xs">Buat ruang untuk video call bersama teman Anda. Mendukung banyak peserta sekaligus!</p>
                    {error && <div className="w-full mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center">{error}</div>}
                    <div className="w-full flex flex-col gap-3">
                        <button onClick={createRoom} className="w-full group relative overflow-hidden bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl p-5 text-left transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-violet-500/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 font-semibold text-base mb-1"><Sparkles className="w-4 h-4" /> Buat Ruang Baru</div>
                                    <p className="text-sm text-white/70">Dapatkan kode unik untuk dibagikan ke teman</p>
                                </div>
                                <DoorOpen className="w-6 h-6 text-white/40 group-hover:text-white/80 transition-colors" />
                            </div>
                        </button>
                        <div className="flex items-center gap-3 my-1">
                            <div className="flex-1 h-px bg-white/10" /><span className="text-xs text-white/30 uppercase tracking-widest font-semibold">atau</span><div className="flex-1 h-px bg-white/10" />
                        </div>
                        <form onSubmit={handleJoinSubmit} className="w-full">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                                <label className="text-sm font-medium text-white/70 mb-2 block">Masukkan Kode Ruang</label>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="Contoh: A3B7K2" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={6} className="flex-1 bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-center text-lg font-mono tracking-[0.3em] uppercase" />
                                    <button type="submit" disabled={joinCode.length < 3} className="bg-white text-zinc-900 hover:bg-zinc-100 px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95">Gabung</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    // ---- ROOM CLOSED ----
    if (roomClosed) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6"><X className="w-8 h-8 text-red-400" /></div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">Ruang Ditutup</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-center max-w-xs">Pemilik ruang telah keluar dan menutup ruangan ini.</p>
                <button onClick={onBack} className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-6 py-3 rounded-full font-semibold transition-all cursor-pointer active:scale-95">Kembali ke Beranda</button>
            </div>
        );
    }

    // ---- WAITING / CONNECTED ----
    const gridClass = getGridCols(participantCount);

    return (
        <div className="flex-1 flex overflow-hidden gap-3 relative">
            {/* Video Grid Area */}
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
                            <div className="relative z-20 flex flex-col items-center text-center p-6 max-w-sm">
                                <div className="relative flex items-center justify-center mb-6">
                                    <div className="absolute w-24 h-24 border border-violet-400/20 rounded-full animate-ping opacity-30" />
                                    <div className="absolute w-16 h-16 border border-violet-400/30 rounded-full animate-ping opacity-40" />
                                    <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl shadow-violet-500/30 z-10"><Users className="w-6 h-6 text-white" /></div>
                                </div>
                                <h2 className="text-xl font-semibold text-white mb-2">Menunggu Peserta Bergabung</h2>
                                <p className="text-white/50 text-sm mb-6">Bagikan kode atau link di bawah kepada teman-teman Anda</p>
                                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 w-full mb-4">
                                    <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2 font-semibold">Kode Ruang</div>
                                    <div className="text-3xl font-mono font-bold text-white tracking-[0.4em] mb-3">{roomCode}</div>
                                    <button onClick={handleCopy} className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium py-2.5 rounded-xl transition-all cursor-pointer active:scale-95">
                                        {copied ? <><Check className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">Link Disalin!</span></> : <><Link2 className="w-4 h-4" />Salin Link Undangan</>}
                                    </button>
                                </div>
                                <button onClick={leaveRoom} className="text-white/40 hover:text-white/80 text-sm transition-colors cursor-pointer mt-2">Tutup Ruangan</button>
                            </div>
                        </div>
                    )}

                    {/* Connected: Dynamic Video Grid */}
                    {hasConnectedPeers && (
                        <div className={`absolute inset-0 bg-black p-1 grid ${gridClass} gap-1 auto-rows-fr`}>
                            {/* Local video tile */}
                            <div className="relative rounded-lg overflow-hidden bg-zinc-900 min-h-0">
                                <div className="w-full h-full">
                                    {localStream ? (
                                        <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover ${!cameraEnabled ? 'opacity-0' : 'opacity-100'} transition-opacity`} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">Memuat kamera</div>
                                    )}
                                </div>
                                {!cameraEnabled && <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10"><VideoOff className="w-6 h-6 text-zinc-600" /></div>}
                                <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none z-20">
                                    <div className="bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-medium text-white flex items-center gap-1 border border-white/10">
                                        Kamu {!micEnabled && <MicOff className="w-2.5 h-2.5 text-red-400" />}
                                    </div>
                                </div>
                            </div>

                            {/* Remote video tiles */}
                            {Array.from(remotePeers.entries()).map(([peerId, stream]) => (
                                <div key={peerId} className="relative rounded-lg overflow-hidden bg-zinc-900 min-h-0">
                                    <div className="w-full h-full">
                                        {stream ? (
                                            <VideoPlayer stream={stream} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                                                <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                                                <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Menghubungkan</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none z-20">
                                        <div className="bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-medium text-white border border-white/10">
                                            Peserta
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Participant count badge + chat toggle */}
                    {hasConnectedPeers && (
                        <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
                            <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold text-white border border-white/10 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" /> {participantCount}
                            </div>
                            {roomCode && (
                                <button onClick={handleCopy} className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-mono font-semibold text-white border border-white/10 hover:bg-black/60 transition-all cursor-pointer" title="Salin kode ruang">
                                    {roomCode}
                                </button>
                            )}
                            {!isChatOpen && (
                                <button onClick={() => setIsChatOpen(true)} className="p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white border border-white/10 transition-all relative cursor-pointer" title="Buka Obrolan">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    {messages.length > 0 && <span className="absolute -top-1 -right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Draggable Control Bar */}
                <div
                    style={{ transform: `translate(calc(-50% + ${controlPos.x}px), ${controlPos.y}px)`, left: '50%', bottom: '1.5rem' }}
                    className={`absolute z-30 flex items-center gap-1.5 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-xl border border-zinc-200 dark:border-white/10 p-1.5 rounded-full shadow-2xl select-none transition-opacity duration-300 ${hasConnectedPeers ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDragging ? 'cursor-grabbing' : ''}`}
                >
                    <div onMouseDown={onMouseDown} onTouchStart={onTouchStart} className="w-8 h-11 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-grab active:cursor-grabbing transition-colors touch-none" title="Geser">
                        <GripHorizontal className="w-4 h-4" />
                    </div>
                    <div className="w-px h-7 bg-zinc-300 dark:bg-zinc-600" />
                    <button onClick={toggleMic} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white' : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'}`} title={micEnabled ? 'Bisukan' : 'Aktifkan Mikrofon'}>
                        {micEnabled ? <Mic className="w-[18px] h-[18px]" /> : <MicOff className="w-[18px] h-[18px]" />}
                    </button>
                    <button onClick={toggleCamera} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${cameraEnabled ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white' : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'}`} title={cameraEnabled ? 'Matikan Kamera' : 'Nyalakan Kamera'}>
                        {cameraEnabled ? <Video className="w-[18px] h-[18px]" /> : <VideoOff className="w-[18px] h-[18px]" />}
                    </button>
                    <div className="w-px h-7 bg-zinc-300 dark:bg-zinc-600 mx-0.5" />
                    <button onClick={leaveRoom} className="w-11 h-11 sm:w-auto sm:px-5 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-red-500/20 text-sm cursor-pointer">
                        <X className="w-4 h-4" /><span className="hidden sm:inline">Keluar</span>
                    </button>
                </div>
            </div>

            {/* Chat Sidebar */}
            <aside className={`flex-shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all duration-300 ease-in-out z-20 ${isChatOpen && hasConnectedPeers ? 'w-[calc(100%-1rem)] sm:w-80 md:w-72 lg:w-80 translate-x-0 opacity-100 visible absolute md:relative right-2 md:right-0 inset-y-0' : 'w-0 translate-x-full opacity-0 invisible md:hidden'}`}>
                <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                    <div className="flex items-center gap-2 font-medium text-sm">
                        <MessageSquare className="w-4 h-4 text-zinc-500 dark:text-zinc-400" /><span className="text-zinc-900 dark:text-zinc-100">Obrolan Grup</span>
                    </div>
                    <button onClick={() => setIsChatOpen(false)} className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-zinc-50/50 dark:bg-zinc-950/50 min-h-0">
                    {messages.length === 0 ? (
                        <div className="m-auto text-center text-zinc-400 dark:text-zinc-600 text-sm flex flex-col items-center gap-2"><MessageSquare className="w-8 h-8 opacity-20" />Sapa teman-teman Anda!</div>
                    ) : (
                        messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col max-w-[85%] ${msg.sender === 'me' ? 'self-end items-end' : 'self-start items-start'}`}>
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-1 px-1 uppercase tracking-wider">{msg.sender === 'me' ? 'Kamu' : 'Peserta'}</span>
                                <div className={`px-3.5 py-2 rounded-2xl text-sm ${msg.sender === 'me' ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 rounded-tr-sm' : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/50 rounded-tl-sm shadow-sm'}`} style={{ wordBreak: 'break-word' }}>{msg.text}</div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="p-2.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                        <input type="text" placeholder="Ketik pesan..." className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
                        <button type="submit" disabled={!chatInput.trim()} className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 p-2.5 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"><Send className="w-4 h-4 ml-0.5" /></button>
                    </form>
                </div>
            </aside>
        </div>
    );
}
