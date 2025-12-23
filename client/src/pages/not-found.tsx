import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0A0A12] p-4">
      <Card className="w-full max-w-md bg-white/5 border-white/10 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold font-display text-white">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-400">
            Looks like you've swung into the wrong dimension. This page doesn't exist.
          </p>
          
          <div className="mt-8">
            <Link href="/" className="text-secondary hover:text-secondary/80 hover:underline underline-offset-4 transition-colors">
              Return to Home Base
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
