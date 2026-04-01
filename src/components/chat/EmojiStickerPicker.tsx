import { useState, useRef, useEffect } from "react";
import { Smile, Sticker } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES = [
  {
    label: "Sorrisos",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤗", "🤭", "🫢", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "🤥"],
  },
  {
    label: "Gestos",
    emojis: ["👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "✌️", "🤞", "🫰", "🤟", "🤘", "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤙", "💪"],
  },
  {
    label: "Corações",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"],
  },
  {
    label: "Objetos",
    emojis: ["🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "📱", "💻", "⌚", "📷", "🔔", "📌", "📎", "✏️", "📝", "📅", "💰", "💳", "📊", "📈", "✅", "❌", "⚠️", "🔥", "⭐", "💡", "🚀", "🎯", "💬", "📢"],
  },
];

const STICKERS_PLACEHOLDER = [
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
  "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦄", "🐝",
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export const EmojiPicker = ({ onSelect, disabled }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          title="Emojis"
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 p-0">
        {/* Category tabs */}
        <div className="flex border-b border-border px-1 py-1 gap-0.5 overflow-x-auto scrollbar-none">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(i)}
              className={cn(
                "text-xs px-2 py-1 rounded whitespace-nowrap transition-colors",
                activeCategory === i
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        {/* Emoji grid */}
        <div className="p-2 grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto scrollbar-thin">
          {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-lg transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface StickerPickerProps {
  onSelect: (sticker: string) => void;
  disabled?: boolean;
}

export const StickerPicker = ({ onSelect, disabled }: StickerPickerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          title="Figurinhas"
        >
          <Sticker className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-72 p-2">
        <p className="text-xs font-medium text-muted-foreground mb-2">Figurinhas</p>
        <div className="grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
          {STICKERS_PLACEHOLDER.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                onSelect(s);
                setOpen(false);
              }}
              className="h-12 w-12 flex items-center justify-center rounded-lg hover:bg-muted text-2xl transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
