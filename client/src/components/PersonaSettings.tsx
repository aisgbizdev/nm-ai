import { useState, useEffect } from "react";
import { usePersonas, useUpdatePersona, useUploadKnowledge, usePersonaKnowledge } from "@/hooks/use-chat";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Save, Upload, UserCog, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function PersonaSettings() {
  const { data: personas, isLoading } = usePersonas();
  const updatePersona = useUpdatePersona();
  const uploadKnowledge = useUploadKnowledge();
  const { toast } = useToast();
  
  // State for form
  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // When personas load, select default if none selected
  useEffect(() => {
    if (personas && personas.length > 0 && !selectedPersonaId) {
      const defaultPersona = personas.find(p => p.isDefault) || personas[0];
      setSelectedPersonaId(defaultPersona.id);
      setSystemPrompt(defaultPersona.systemPrompt);
    }
  }, [personas, selectedPersonaId]);

  // Handle switching persona in settings
  const handlePersonaSelect = (id: number) => {
    const persona = personas?.find(p => p.id === id);
    if (persona) {
      setSelectedPersonaId(id);
      setSystemPrompt(persona.systemPrompt);
    }
  };

  const handleSavePrompt = async () => {
    if (!selectedPersonaId) return;
    try {
      await updatePersona.mutateAsync({
        id: selectedPersonaId,
        systemPrompt: systemPrompt
      });
      toast({
        title: "Persona Updated",
        description: "System prompt saved successfully.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update persona.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedPersonaId || !e.target.files?.length) return;
    
    setIsUploading(true);
    const files = Array.from(e.target.files);
    
    try {
      // Upload one by one or modify API to accept multiple
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        await uploadKnowledge.mutateAsync({
          personaId: selectedPersonaId,
          formData
        });
      }
      toast({
        title: "Files Uploaded",
        description: `Successfully uploaded ${files.length} knowledge files.`,
      });
    } catch (err) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload knowledge files.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary transition-colors">
          <UserCog className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh] bg-background border-border flex flex-col p-0 overflow-hidden">
        <div className="flex flex-1 overflow-hidden h-full">
          {/* Sidebar - Persona List */}
          <div className="w-64 border-r border-border bg-card/50 p-4 flex flex-col gap-4">
            <DialogHeader className="px-0 pb-2">
              <DialogTitle className="text-xl font-display text-primary">Identity Settings</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1">
              <div className="space-y-2">
                {personas?.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => handlePersonaSelect(persona.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2",
                      selectedPersonaId === persona.id 
                        ? "bg-primary/20 text-primary font-medium border border-primary/30" 
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <Bot className="h-4 w-4" />
                    {persona.name}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content - Editor */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 bg-background/50">
            {selectedPersonaId ? (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-semibold text-foreground">System Prompt (Instructions)</Label>
                    <Button 
                      onClick={handleSavePrompt} 
                      disabled={updatePersona.isPending}
                      size="sm"
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updatePersona.isPending ? "Saving..." : "Save Instructions"}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Paste the "soul" of Gwen Stacy here. Instructions from your GPTs export can be pasted directly.
                  </p>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="min-h-[300px] font-mono text-sm bg-black/40 border-border focus:border-primary/50 resize-y"
                    placeholder="You are Gwen Stacy..."
                  />
                </div>

                <div className="space-y-4 border-t border-border/50 pt-6">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-semibold text-foreground">Knowledge Base</Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="file-upload"
                            type="file"
                            multiple
                            accept=".txt,.md,.json,.csv"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                        />
                        <Button 
                            variant="secondary" 
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('file-upload')?.click()}
                            disabled={isUploading}
                        >
                            <Upload className="h-4 w-4" />
                            {isUploading ? "Uploading..." : "Upload Files"}
                        </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Upload .txt or .md files to expand Gwen's knowledge.
                  </p>
                  
                  <KnowledgeFileList personaId={selectedPersonaId} />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a persona to edit
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KnowledgeFileList({ personaId }: { personaId: number }) {
  const { data: knowledgeFiles, isLoading } = usePersonaKnowledge(personaId);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading files...</div>;
  
  if (!knowledgeFiles?.length) {
    return <div className="text-sm text-muted-foreground italic border border-dashed border-border rounded-lg p-4 text-center">No knowledge files uploaded yet.</div>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {knowledgeFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-2 bg-card p-2 rounded border border-border/50 text-xs text-card-foreground">
                <FileText className="h-4 w-4 text-secondary shrink-0" />
                <span className="truncate">{file.filename}</span>
            </div>
        ))}
    </div>
  );
}
