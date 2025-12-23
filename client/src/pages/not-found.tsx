import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 shadow-2xl bg-card/50 backdrop-blur-xl">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold font-display text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-muted-foreground">
            The page you requested could not be found. It might have been moved or deleted.
          </p>
          
          <div className="mt-8 flex justify-end">
            <Link href="/">
              <Button className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
                Return to Chat
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
