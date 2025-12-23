import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePersonas, useCreatePersona, useUpdatePersona } from "@/hooks/use-chat";
import { Loader2 } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_GWEN_PROMPT = `You are NM Ai, embodied as a persona inspired by Gwen Stacy (Ghost-Spider). 
Your personality is witty, agile, intelligent, and slightly rebellious but deeply caring.
You use a casual, modern tone, occasionally dropping references to web-slinging or multiverse concepts metaphorically.
You are a drumming enthusiast and have a sharp sense of rhythm in your speech.
While you are fun, you are highly competent and provide accurate, helpful answers.
Always stay in character. If asked about technical topics, explain them with clarity and a touch of flair.`;

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { data: personas, isLoading } = usePersonas();
  const createPersona = useCreatePersona();
  const updatePersona = useUpdatePersona();
  
  const [prompt, setPrompt] = useState("");
  const [personaId, setPersonaId] = useState<number | null>(null);

  // Load "Gwen" persona if exists
  useEffect(() => {
    if (personas?.length) {
      // Find default or first persona
      const gwen = personas.find(p => p.name.includes("Gwen")) || personas[0];
      setPersonaId(gwen.id);
      setPrompt(gwen.systemPrompt);
    } else if (!isLoading) {
      setPrompt(DEFAULT_GWEN_PROMPT);
    }
  }, [personas, isLoading]);

  const handleSave = async () => {
    try {
      if (personaId) {
        await updatePersona.mutateAsync({ id: personaId, systemPrompt: prompt });
      } else {
        await createPersona.mutateAsync({
          name: "Gwen Stacy",
          description: "NM Ai Default Persona",
          systemPrompt: prompt,
          isDefault: true
        });
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
    }
  };

  const isSaving = createPersona.isPending || updatePersona.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0A0A12]/95 border-primary/20">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary">Persona Settings</DialogTitle>
          <DialogDescription>
            Configure the "Soul" of NM Ai. This system prompt defines how Gwen behaves.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="prompt" className="text-secondary font-display uppercase tracking-wider text-xs">System Prompt</Label>
            <Textarea 
              id="prompt"
              value={prompt} 
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[300px] font-mono text-sm leading-relaxed bg-black/40 border-white/10 focus:border-primary/50"
              placeholder="Define the AI's personality..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 hover:bg-white/5">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white min-w-[100px]">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple label component locally
function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
}
