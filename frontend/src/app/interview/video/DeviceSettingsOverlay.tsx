'use client';

import React from 'react';
import { Settings, X } from 'lucide-react';

interface DeviceOption {
  deviceId: string;
  label: string;
}

interface DeviceSettingsOverlayProps {
  videoDevices: DeviceOption[];
  audioDevices: DeviceOption[];
  selectedVideoId: string;
  selectedAudioId: string;
  onChangeVideo: (deviceId: string) => void;
  onChangeAudio: (deviceId: string) => void;
  onClose: () => void;
  size?: 'sm' | 'md';
}

/**
 * Modal overlay permitting candidates to switch cameras and microphones during an interview.
 * Ensures hardware device IDs map to WebKit/Chromium MediaStream tracks without page reloads.
 */
export function DeviceSettingsOverlay({
  videoDevices,
  audioDevices,
  selectedVideoId,
  selectedAudioId,
  onChangeVideo,
  onChangeAudio,
  onClose,
  size = 'sm',
}: DeviceSettingsOverlayProps) {
  const isSmall = size === 'sm';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Device Configuration"
      className={`absolute inset-0 bg-slate-950/95 z-30 flex flex-col justify-center ${
        isSmall ? 'p-3 gap-2 text-[10px]' : 'p-6 gap-3.5 text-xs'
      } text-white leading-tight select-none rounded-xl`}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-1">
        <span className="font-bold text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
          <Settings className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
          Device Settings
        </span>
        <button
          onClick={onClose}
          aria-label="Close device settings"
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
        >
          <X className={isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="camera-select" className="text-slate-400 font-semibold">
          Camera Source
        </label>
        <select
          id="camera-select"
          value={selectedVideoId}
          onChange={(e) => onChangeVideo(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-blue-500 w-full"
        >
          {videoDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
            </option>
          ))}
          {videoDevices.length === 0 && <option value="">No cameras detected</option>}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mic-select" className="text-slate-400 font-semibold">
          Microphone Source
        </label>
        <select
          id="mic-select"
          value={selectedAudioId}
          onChange={(e) => onChangeAudio(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-blue-500 w-full"
        >
          {audioDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Mic ${d.deviceId.slice(0, 5)}`}
            </option>
          ))}
          {audioDevices.length === 0 && <option value="">No microphones detected</option>}
        </select>
      </div>
    </div>
  );
}

export default DeviceSettingsOverlay;
