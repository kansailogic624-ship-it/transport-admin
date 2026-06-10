"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login";
import { useAuth } from "@/contexts/auth-context";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        読み込み中…
      </div>
    );
  }

  return <LoginForm />;
}
