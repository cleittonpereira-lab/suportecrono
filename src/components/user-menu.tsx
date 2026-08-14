import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogIn, LogOut, Shield, UserRound } from "lucide-react";

export function UserMenu() {
  const { user, profile, role, isGuest, displayName, signOut } = useAuth();
  const nav = useNavigate();

  if (isGuest) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="hidden sm:inline-flex">Convidado</Badge>
        <Button size="sm" variant="outline" onClick={() => nav({ to: "/auth" })}>
          <LogIn className="mr-1.5 h-3.5 w-3.5" /> Entrar
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <Button size="sm" onClick={() => nav({ to: "/auth" })}>
        <LogIn className="mr-1.5 h-3.5 w-3.5" /> Entrar
      </Button>
    );
  }

  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-accent transition-colors">
          <Avatar className="h-7 w-7">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
            <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-[12px] font-medium truncate max-w-[140px]">{displayName}</span>
            <span className="text-[10px] text-muted-foreground capitalize">{role ?? "usuário"}</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">{displayName}</span>
            <span className="text-[11px] text-muted-foreground truncate">{profile?.email}</span>
            {profile?.cargo && <span className="text-[11px] text-muted-foreground">{profile.cargo}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/perfil"><UserRound className="mr-2 h-4 w-4" /> Meu perfil</Link>
        </DropdownMenuItem>
        {role === "admin" && (
          <>
            <DropdownMenuItem asChild>
              <Link to="/admin/usuarios"><Shield className="mr-2 h-4 w-4" /> Gestão de usuários</Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await signOut(); nav({ to: "/auth" }); }}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}