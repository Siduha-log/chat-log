"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";

type SocialProvider = "google" | "github" | "x";

// 共有シート(/share)経由で未ログイン状態だった場合、ログイン後に元の
// 行き先（例: /?shareUrl=...）へ戻すためのクエリパラメータ。
function getNextPath(): string {
  return new URLSearchParams(window.location.search).get("next") || "/";
}

const socialProviders: { id: SocialProvider; label: string }[] = [
  { id: "google", label: "Googleでログイン" },
  { id: "github", label: "GitHubでログイン" },
  { id: "x", label: "Xでログイン" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSocialLogin = async (provider: SocialProvider) => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(getNextPath())}`,
      },
    });
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "signin") {
      window.location.href = getNextPath();
    } else {
      setMessage("確認メールを送信しました。メール内のリンクから認証してください。");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ChatHub</h1>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {socialProviders.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            onClick={() => handleSocialLogin(p.id)}
            type="button"
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex w-full max-w-sm items-center gap-2 text-sm text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        または
        <div className="h-px flex-1 bg-border" />
      </div>

      <form
        onSubmit={handleEmailAuth}
        className="flex w-full max-w-sm flex-col gap-3"
      >
        <Input
          type="email"
          required
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          required
          minLength={6}
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={loading}>
          {mode === "signin" ? "ログイン" : "アカウント作成"}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() =>
            setMode((m) => (m === "signin" ? "signup" : "signin"))
          }
        >
          {mode === "signin"
            ? "アカウントをお持ちでない方はこちら"
            : "ログイン画面に戻る"}
        </button>
        {message && <p className="text-sm text-destructive">{message}</p>}
      </form>
    </div>
  );
}
