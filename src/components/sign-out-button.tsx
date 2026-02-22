"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
interface SignOutButtonProps {
  className?: string;
}
export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();
  async function handleSignOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/auth/sign-in");
    router.refresh();
  }
  return (
    <button type="button" onClick={handleSignOut} className={className}>
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}
