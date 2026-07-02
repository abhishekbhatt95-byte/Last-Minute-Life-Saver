import React, { useState } from 'react';

interface NamePromptProps {
  userName: string;
  onSave: (name: string) => void;
  onSkip: () => void;
}

export const NamePrompt: React.FC<NamePromptProps> = ({ userName, onSave, onSkip }) => {
  const [name, setName] = useState(userName || '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e1e2e] p-6 rounded-lg shadow-xl w-full max-w-sm">
        <h2 className="text-xl font-bold text-white mb-2">Hey! What should I call you?</h2>
        <p className="text-gray-400 mb-4 text-sm">So I can personalize things around here.</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full bg-[#11111b] text-white p-2 rounded mb-4 border border-[#313244] focus:outline-none focus:border-[#14b8a6]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => name && onSave(name)}
            disabled={!name}
            className="flex-1 bg-[#14b8a6] text-black font-bold py-2 rounded hover:bg-[#0e9f8f] disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={onSkip}
            className="flex-1 bg-[#313244] text-white py-2 rounded hover:bg-[#45475a]"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};
