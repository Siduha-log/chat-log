"use client";

import { useState } from "react";
import { FingerprintIcon } from "lucide-react";
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
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [showReturningOptions, setShowReturningOptions] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // マジックリンク/OAuthのコールバック処理（/auth/callback）が失敗した場合、
  // ?error=...&reason=...付きでここへ戻ってくる。技術的な理由（reason）は
  // 開発者がコンソールで追えるよう残しつつ、画面にはわかりやすい文言のみ表示する。
  const [callbackError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") !== "auth_callback_failed") return null;
    const reason = params.get("reason");
    if (reason) console.error("[auth/callback] failed:", reason);
    return "ログインに失敗しました。もう一度お試しください。";
  });

  const handlePasskeyLogin = async () => {
    setPasskeyError(null);
    setPasskeyLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPasskey();
    setPasskeyLoading(false);

    if (error) {
      setPasskeyError(error.message || "パスキーでのログインに失敗しました。");
      return;
    }
    if (data?.session) {
      window.location.href = getNextPath();
    }
  };

  const handleSocialLogin = async (provider: SocialProvider) => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(getNextPath())}`,
      },
    });
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLinkLoading(true);
    setMagicLinkError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(getNextPath())}`,
      },
    });

    setMagicLinkLoading(false);

    if (error) {
      setMagicLinkError(error.message);
      return;
    }
    setMagicLinkSent(true);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ChatHub</h1>

      {callbackError && (
        <p className="w-full max-w-sm text-center text-sm text-destructive">{callbackError}</p>
      )}

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

      {showReturningOptions ? (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            2回目以降の方向け
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={passkeyLoading}
              onClick={handlePasskeyLogin}
              type="button"
            >
              <FingerprintIcon className="size-4" />
              {passkeyLoading ? "確認中..." : "パスキーでログイン"}
            </Button>
            {passkeyError && (
              <p className="text-center text-xs text-destructive">{passkeyError}</p>
            )}
          </div>

          {showMagicLink ? (
            <div className="flex flex-col gap-3">
              {magicLinkSent ? (
                <p className="text-sm text-muted-foreground">
                  {email} 宛にログイン用のリンクを送信しました。メール内のリンクからログインしてください。
                </p>
              ) : (
                <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
                  <Input
                    type="email"
                    required
                    placeholder="メールアドレス"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button type="submit" disabled={magicLinkLoading}>
                    {magicLinkLoading ? "送信中..." : "ログインリンクを送信"}
                  </Button>
                  {magicLinkError && <p className="text-sm text-destructive">{magicLinkError}</p>}
                </form>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowMagicLink(true)}
            >
              パスキーが使えない場合
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="text-sm text-muted-foreground underline"
          onClick={() => setShowReturningOptions(true)}
        >
          その他のログイン方法（2回目以降の方はこちら）
        </button>
      )}
    </div>
  );
}
