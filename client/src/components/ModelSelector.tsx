import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Bot, Zap } from "lucide-react";

interface ModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function ModelSelector({ value, onValueChange }: ModelSelectorProps) {
  return (
    <div className="w-full max-w-xs">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-[180px] bg-secondary/50 border-border/50 backdrop-blur-sm focus:ring-primary/20">
          <SelectValue placeholder="Select Model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gpt-5.1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>GPT-5.1</span>
            </div>
          </SelectItem>
          <SelectItem value="ollama">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-orange-400" />
              <span>Ollama (Local)</span>
            </div>
          </SelectItem>
          <SelectItem value="gpt-4o">
             <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-400" />
              <span>GPT-4o</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
