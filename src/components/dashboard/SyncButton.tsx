'use client';

import { RefreshCw } from 'lucide-react';

interface SyncButtonProps {
  syncing: boolean;
  onSync: () => void;
}

export default function SyncButton({ syncing, onSync }: SyncButtonProps) {
  return (
    <button
      onClick={onSync}
      disabled={syncing}
      title="Sync all platforms"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? 'Syncing…' : 'Sync'}
    </button>
  );
}
