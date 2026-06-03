'use client';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

interface AlphabetRailProps {
  onSelect: (letter: string) => void;
}

export function AlphabetRail({ onSelect }: AlphabetRailProps) {
  return (
    <div className="absolute right-1 top-[260px] z-[1200] flex w-6 flex-col items-center gap-0.5 text-[14px] font-semibold text-[#1e88e5]">
      {LETTERS.map((letter) => (
        <button key={letter} type="button" onClick={() => onSelect(letter)} className="h-5 leading-5">
          {letter}
        </button>
      ))}
    </div>
  );
}
