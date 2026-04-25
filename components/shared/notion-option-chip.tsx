import { cn } from '@/lib/utils';

const NOTION_COLOR_CLASSES: Record<string, string> = {
  default: 'border-[#d4d4d8] bg-white text-[#3f3f46]',
  gray: 'border-[#d4d4d8] bg-[#f4f4f5] text-[#52525b]',
  brown: 'border-[#e7d3bf] bg-[#f8efe7] text-[#8a5a35]',
  orange: 'border-[#f3c9ad] bg-[#fff0e5] text-[#c2410c]',
  yellow: 'border-[#ead69b] bg-[#fff8db] text-[#a16207]',
  green: 'border-[#b7dfb4] bg-[#ebf7e8] text-[#2f7d32]',
  blue: 'border-[#b7d5f3] bg-[#e9f2fd] text-[#1d5fa8]',
  purple: 'border-[#d8c4f0] bg-[#f3ecfd] text-[#7e4db3]',
  pink: 'border-[#f0bfd5] bg-[#fdebf3] text-[#b83280]',
  red: 'border-[#efbeb4] bg-[#fdecea] text-[#c2410c]',
};

interface NotionOptionChipProps {
  label: string;
  colorName?: string | null;
  fallbackHex?: string | null;
  className?: string;
}

export function NotionOptionChip({
  label,
  colorName,
  fallbackHex = null,
  className,
}: NotionOptionChipProps) {
  if (fallbackHex) {
    return (
      <span
        className={cn(
          'inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold',
          className,
        )}
        style={{
          backgroundColor: `${fallbackHex}18`,
          borderColor: `${fallbackHex}55`,
          color: fallbackHex,
        }}
      >
        {label}
      </span>
    );
  }

  const normalized = (colorName ?? 'default').trim().toLowerCase();

  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold',
        NOTION_COLOR_CLASSES[normalized] ?? NOTION_COLOR_CLASSES.default,
        className,
      )}
    >
      {label}
    </span>
  );
}
