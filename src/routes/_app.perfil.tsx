import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, KeyRound, Loader2, Save, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil — Suporte INFRA" },
      { name: "description", content: "Gerencie seus dados, avatar e senha." },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user, profile, role, displayName, refresh, isGuest } = useAuth();
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    setNome(profile?.nome ?? "");
    setCargo(profile?.cargo ?? "");
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile?.nome, profile?.cargo, profile?.avatar_url]);

  if (isGuest || !user) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Meu perfil</CardTitle>
            <CardDescription>Entre com sua conta para gerenciar seu perfil.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleAvatar = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB).");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      // signed URL de longa duração (10 anos) — bucket é privado
      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (sErr || !signed) throw sErr ?? new Error("Falha ao gerar URL do avatar");
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ avatar_url: signed.signedUrl })
        .eq("id", user.id);
      if (pErr) throw pErr;
      setAvatarUrl(signed.signedUrl);
      await refresh();
      toast.success("Foto atualizada.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Não foi possível enviar a foto: " + msg);
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ nome: nome.trim() || null, cargo: cargo.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Dados atualizados.");
    } catch (e) {
      toast.error("Falha ao salvar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (pwd.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (pwd !== pwd2) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setPwd("");
      setPwd2("");
      toast.success("Senha alterada com sucesso.");
    } catch (e) {
      toast.error("Falha ao alterar senha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Conta · Preferências"
        icon={UserRound}
        title="Meu perfil"
        description="Atualize seus dados, foto e senha."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da conta</CardTitle>
          <CardDescription>Atualize sua foto e informações pessoais.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 border">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground p-1.5 shadow hover:opacity-90 disabled:opacity-60"
                aria-label="Trocar foto"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleAvatar(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="font-medium">{displayName}</div>
              <div className="text-xs text-muted-foreground">{profile?.email}</div>
              <div className="flex gap-1.5 mt-1">
                {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
                {profile?.status && (
                  <Badge variant={profile.status === "ativo" ? "default" : "outline"} className="capitalize">
                    {profile.status}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Engenheiro" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Alterar senha
          </CardTitle>
          <CardDescription>Use pelo menos 6 caracteres.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pwd">Nova senha</Label>
              <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd2">Confirmar nova senha</Label>
              <Input id="pwd2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={changePassword} disabled={savingPwd || !pwd || !pwd2}>
              {savingPwd ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Alterar senha
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}