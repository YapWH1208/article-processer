"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function DevPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings"); }, [router]);
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Redirecting to Settings…
      </div>
    </div>
  );
}
