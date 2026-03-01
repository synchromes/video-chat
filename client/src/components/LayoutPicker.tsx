import React from 'react';
import { LayoutGrid } from 'lucide-react';

export type VideoLayout = 'side-by-side' | 'focus' | 'reverse-focus' | 'stacked' | 'theater';

interface LayoutPickerProps {
    currentLayout: VideoLayout;
    onLayoutChange: (layout: VideoLayout) => void;
    isOpen: boolean;
    onToggle: () => void;
}

interface LayoutOption {
    id: VideoLayout;
    name: string;
    icon: React.ReactNode;
}

const layoutOptions: LayoutOption[] = [
    {
        id: 'side-by-side',
        name: 'Side by Side',
        icon: (
            <svg viewBox="0 0 32 22" className="w-full h-full">
                <rect x="1" y="1" width="14" height="20" rx="2" className="fill-current opacity-60" />
                <rect x="17" y="1" width="14" height="20" rx="2" className="fill-current opacity-40" />
            </svg>
        ),
    },
    {
        id: 'focus',
        name: 'Focus',
        icon: (
            <svg viewBox="0 0 32 22" className="w-full h-full">
                <rect x="1" y="1" width="30" height="20" rx="2" className="fill-current opacity-40" />
                <rect x="21" y="13" width="9" height="7" rx="1.5" className="fill-current opacity-80" />
            </svg>
        ),
    },
    {
        id: 'reverse-focus',
        name: 'Reverse',
        icon: (
            <svg viewBox="0 0 32 22" className="w-full h-full">
                <rect x="1" y="1" width="30" height="20" rx="2" className="fill-current opacity-60" />
                <rect x="21" y="13" width="9" height="7" rx="1.5" className="fill-current opacity-40" />
            </svg>
        ),
    },
    {
        id: 'stacked',
        name: 'Stacked',
        icon: (
            <svg viewBox="0 0 32 22" className="w-full h-full">
                <rect x="1" y="1" width="30" height="9" rx="2" className="fill-current opacity-40" />
                <rect x="1" y="12" width="30" height="9" rx="2" className="fill-current opacity-60" />
            </svg>
        ),
    },
    {
        id: 'theater',
        name: 'Theater',
        icon: (
            <svg viewBox="0 0 32 22" className="w-full h-full">
                <rect x="1" y="1" width="30" height="20" rx="2" className="fill-current opacity-40" />
                <rect x="12" y="15" width="8" height="5" rx="1" className="fill-current opacity-80" />
            </svg>
        ),
    },
];

export const LayoutPicker: React.FC<LayoutPickerProps> = ({ currentLayout, onLayoutChange, isOpen, onToggle }) => {
    return (
        <div className="relative">
            <button
                onClick={onToggle}
                className="p-2 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-md text-white border border-white/10 transition-all"
                title="Change Layout"
            >
                <LayoutGrid className="w-4 h-4" />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-2 w-[240px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        Video Layout
                    </div>
                    <div className="grid grid-cols-1 gap-1 mt-1">
                        {layoutOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => { onLayoutChange(option.id); onToggle(); }}
                                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all cursor-pointer ${currentLayout === option.id
                                        ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <div className={`w-8 h-5.5 flex-shrink-0 ${currentLayout === option.id ? 'text-zinc-50 dark:text-zinc-900' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                    {option.icon}
                                </div>
                                <span>{option.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
