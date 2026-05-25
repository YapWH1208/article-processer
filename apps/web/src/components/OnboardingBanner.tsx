"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileUp, Brain, MessageCircle, ArrowRight, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface OnboardingBannerProps {
  /** Only render when true (e.g. zero articles). */
  visible: boolean;
}

const STORAGE_KEY = "onboarding-dismissed";

export function OnboardingBanner({ visible }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "true");
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  if (!visible || dismissed) return null;

  const steps = [
    { icon: FileUp, title: "Upload a paper", desc: "Drag & drop PDF, HTML, or Markdown files." },
    { icon: Brain, title: "AI extracts insights", desc: "Entities, claims, methodology & more." },
    { icon: MessageCircle, title: "Chat & explore", desc: "Ask questions, browse the knowledge graph." },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
      >
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-start gap-4 p-5">
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary mb-3">
                  👋 Welcome to Article Processor
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
                        <step.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{i + 1}. {step.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Link href="/upload">
                    <Button size="sm" className="gap-1.5">
                      Get Started <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={handleDismiss}>
                    Dismiss
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleDismiss} aria-label="Dismiss onboarding">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
