import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ALL_TABS, TAB_META, type TabKey } from "@/lib/tab-permissions";
import { toast } from "sonner";
import { Shield, CheckCircle2, Ban, Settings2, Loader2, UserRound, UserPlus, AtSign, KeyRound, Pencil, Mail, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAdminUsers,
  setUserStatus,
  setUserAppRole,
  setUserCargo,
  setUserLabRole,
  setUserTitulo,
  setUserUsername,
  setUserNome,
  setUserEmail,
  setUserPassword,
  setUserTabPermissions,
  setGuestTabPermissions,
  inviteAppUser,
  syncAndActivateUsers,
} from "@/lib/lab-adminUsers.functions";
import type { PublicUser, UserRole, UserStatus } from "@/lib/user-store.server";

export const Route = createFileRoute("/_app/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Gestão de usuários — Suporte INFRA" },
      { name: "description", content: "Aprovação, permissões e papéis dos usuários do sistema." },
    ],
  }),
  component: AdminUsuariosPage,
});

type Row = {
  id: string;
  email: string;
  nome: string | null;
  cargo: string | null;
  titulo: string | null;
  username: string | null;
  labRole: "aprovador" | "verificador" | "digitador" | "nenhum";
  status: UserStatus;
  role: UserRole;
  tabs: string[];
  isGuest?: boolean;
  emailConfirmedAt?: string | null;
  lastSignInAt?: string | null;
};

const GUEST_ROW_ID = "__guest__";

function AdminUsuariosPage() {
  const { role, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && role !== "admin") nav({ to: "/", replace: true });
  }, [role, loading, nav]);

  const listAdminUsersFn = useServerFn(listAdminUsers);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    enabled: role === "admin",
    queryFn: async (): Promise<Row[]> => {
      const { users, guestTabs } = await listAdminUsersFn();
      const userRows: Row[] = (users as PublicUser[]).map((u) => ({
        id: u.id,
        email: u.email,
        nome: u.nome,
        cargo: u.cargo,
        titulo: u.titulo,
        username: u.username,
        labRole: u.labRole,
        status: u.status,
        role: u.role,
        tabs: u.tabs,
        emailConfirmedAt: u.emailConfirmedAt,
        lastSignInAt: u.lastSignInAt,
      }));
      const guestRow: Row = {
        id: GUEST_ROW_ID,
        email: "acesso público sem cadastro",
        nome: "Usuário sem login",
        cargo: "Convidado",
        titulo: null,
        username: null,
        labRole: "nenhum",
        status: "ativo",
        role: "usuario",
        tabs: guestTabs,
        isGuest: true,
      };
      return [guestRow, ...userRows];
    },
  });

  const setStatusFn = useServerFn(setUserStatus);
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Row["status"] }) =>
      setStatusFn({ data: { userId: id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Status atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setAppRoleFn = useServerFn(setUserAppRole);
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      setAppRoleFn({ data: { userId: id, role } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Papel atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setCargoFn = useServerFn(setUserCargo);
  const setCargo = useMutation({
    mutationFn: ({ id, cargo }: { id: string; cargo: string }) =>
      setCargoFn({ data: { userId: id, cargo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Cargo atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setLabRoleFn = useServerFn(setUserLabRole);
  const setTituloFn = useServerFn(setUserTitulo);
  const setUsernameFn = useServerFn(setUserUsername);
  const inviteFn = useServerFn(inviteAppUser);
  const setPasswordFn = useServerFn(setUserPassword);
  const setNomeFn = useServerFn(setUserNome);
  const setEmailFn = useServerFn(setUserEmail);

  const setNome = useMutation({
    mutationFn: ({ id, nome }: { id: string; nome: string }) =>
      setNomeFn({ data: { userId: id, nome } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Nome atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setEmail = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      setEmailFn({ data: { userId: id, email } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("E-mail atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      setPasswordFn({ data: { userId: id, password } }),
    onSuccess: () => toast.success("Senha redefinida."),
    onError: (e: any) => toast.error(e.message),
  });

  const setLabRole = useMutation({
    mutationFn: ({ id, labRole }: { id: string; labRole: Row["labRole"] }) =>
      setLabRoleFn({ data: { userId: id, labRole } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Papel no Relatório atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setTitulo = useMutation({
    mutationFn: ({ id, titulo }: { id: string; titulo: string }) =>
      setTituloFn({ data: { userId: id, titulo: titulo || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Título atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setUsernameMut = useMutation({
    mutationFn: ({ id, username }: { id: string; username: string }) =>
      setUsernameFn({ data: { userId: id, username: username || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Nome de usuário atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const invite = useMutation({
    mutationFn: (input: { email: string; nome: string; username: string; role: UserRole }) =>
      inviteFn({ data: input }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Conta criada! Senha temporária: ${res.tempPassword} — informe ao usuário.`, {
        duration: 20000,
      });
      setInviteOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const syncAllFn = useServerFn(syncAndActivateUsers);
  const syncAllMut = useMutation({
    mutationFn: () => syncAllFn(),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`${res?.updatedCount || 0} conta(s) sincronizada(s) e ativada(s) com sucesso!`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [permsFor, setPermsFor] = useState<Row | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  if (loading || role !== "admin") {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Administração · Acessos"
        icon={Shield}
        title="Gestão de usuários"
        description="Aprovações, papéis e permissões de aba por usuário."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => syncAllMut.mutate()}
              disabled={syncAllMut.isPending}
            >
              {syncAllMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Sincronizar & Ativar Contas
            </Button>
            <Button size="sm" className="h-8" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Convidar usuário
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Nome de usuário</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Título (Relatório)</TableHead>
                    <TableHead>Papel no Relatório</TableHead>
                    <TableHead>Permissões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    if (r.isGuest) {
                      return (
                        <TableRow key={r.id} className="bg-muted/40">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserRound className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{r.nome}</div>
                                <div className="text-xs text-muted-foreground">{r.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">—</span></TableCell>
                          <TableCell>
                            <Badge variant="outline">Público</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">Convidado</Badge>
                          </TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">—</span></TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">—</span></TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">—</span></TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {r.tabs.length === 0 ? "Todas as abas não-admin" : `${r.tabs.length} abas`}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => setPermsFor(r)}>
                              <Settings2 className="h-3.5 w-3.5 mr-1" /> Gerenciar abas
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.nome || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.email}</div>
                        </TableCell>
                        <TableCell>
                          <UsernameCell
                            initial={r.username ?? ""}
                            onSave={(username) => setUsernameMut.mutate({ id: r.id, username })}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={r.status}
                            emailConfirmedAt={r.emailConfirmedAt ?? null}
                            lastSignInAt={r.lastSignInAt ?? null}
                          />
                        </TableCell>
                        <TableCell>
          <Select
                            value={r.role}
                            onValueChange={(v: string) => setRole.mutate({ id: r.id, role: v as UserRole })}
                          >
                            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="gestor">Gestor</SelectItem>
                              <SelectItem value="usuario">Usuário</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <CargoCell
                            initial={r.cargo ?? ""}
                            onSave={(cargo) => setCargo.mutate({ id: r.id, cargo })}
                          />
                        </TableCell>
                        <TableCell>
                          <CargoCell
                            initial={r.titulo ?? ""}
                            placeholder="Ex.: Engº Geotécnico ..."
                            width="w-56"
                            onSave={(titulo) => setTitulo.mutate({ id: r.id, titulo })}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.labRole}
                            onValueChange={(v: string) => setLabRole.mutate({ id: r.id, labRole: v as Row["labRole"] })}
                          >
                            <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nenhum">Nenhum</SelectItem>
                              <SelectItem value="digitador">Digitador</SelectItem>
                              <SelectItem value="verificador">Verificador</SelectItem>
                              <SelectItem value="aprovador">Aprovador</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {r.tabs.length === 0 ? "Padrão do papel" : `${r.tabs.length} abas`}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {r.status !== "ativo" && (
                            <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "ativo" })}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                            </Button>
                          )}
                          {r.status !== "bloqueado" && (
                            <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "bloqueado" })}>
                              <Ban className="h-3.5 w-3.5 mr-1" /> Bloquear
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setPermsFor(r)}>
                            <Settings2 className="h-3.5 w-3.5 mr-1" /> Abas
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const pwd = window.prompt(
                                `Definir nova senha para ${r.email}\n(mínimo 8 caracteres)`,
                                "labespecial1234",
                              );
                              if (!pwd) return;
                              if (pwd.length < 8) {
                                toast.error("Senha deve ter ao menos 8 caracteres.");
                                return;
                              }
                              setPassword.mutate({ id: r.id, password: pwd });
                            }}
                          >
                            <KeyRound className="h-3.5 w-3.5 mr-1" /> Senha
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const nome = window.prompt(
                                `Editar nome do usuário`,
                                r.nome ?? "",
                              );
                              if (nome == null) return;
                              const trimmed = nome.trim();
                              if (trimmed.length < 2) {
                                toast.error("Nome muito curto.");
                                return;
                              }
                              setNome.mutate({ id: r.id, nome: trimmed });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Nome
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const email = window.prompt(
                                `Editar e-mail (apenas @suportesolos.com.br)`,
                                r.email ?? "",
                              );
                              if (email == null) return;
                              const trimmed = email.trim().toLowerCase();
                              if (!trimmed.endsWith("@suportesolos.com.br")) {
                                toast.error("Apenas e-mails @suportesolos.com.br.");
                                return;
                              }
                              setEmail.mutate({ id: r.id, email: trimmed });
                            }}
                          >
                            <Mail className="h-3.5 w-3.5 mr-1" /> E-mail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum usuário.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PermsDialog row={permsFor} onClose={() => setPermsFor(null)} />
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={(input) => invite.mutate(input)}
        submitting={invite.isPending}
      />
    </div>
  );
}

function StatusBadge({
  status,
  emailConfirmedAt,
  lastSignInAt,
}: {
  status: string;
  emailConfirmedAt?: string | null;
  lastSignInAt?: string | null;
}) {
  if (status === "bloqueado") return <Badge variant="destructive">Bloqueado</Badge>;
  if (status === "ativo") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
        Ativo
      </Badge>
    );
  }
  // status = pendente → refina pelo estado do convite
  if (!emailConfirmedAt) {
    return (
      <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30" title="O usuário ainda não confirmou o cadastro.">
        Aguardando aprovação
      </Badge>
    );
  }
  if (!lastSignInAt) {
    return (
      <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30" title="Cadastro criado, aguardando aprovação do administrador.">
        Aguardando aprovação
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" title="Usuário já entrou uma vez; aguardando aprovação.">
      Aguardando aprovação
    </Badge>
  );
}

function CargoCell({ initial, onSave, placeholder = "Cargo", width = "w-40" }: { initial: string; onSave: (cargo: string) => void; placeholder?: string; width?: string }) {
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);
  const dirty = value !== initial;
  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={`h-8 ${width}`}
      />
      {dirty && (
        <Button size="sm" variant="outline" className="h-8" onClick={() => onSave(value.trim())}>
          Salvar
        </Button>
      )}
    </div>
  );
}

function UsernameCell({ initial, onSave }: { initial: string; onSave: (u: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);
  const dirty = value.trim().toLowerCase() !== initial.trim().toLowerCase();
  const valid = value === "" || /^[a-zA-Z0-9._-]{3,40}$/.test(value.trim());
  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <AtSign className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="usuario.login"
          className={`h-8 w-40 pl-7 ${!valid ? "border-destructive" : ""}`}
          autoCapitalize="none"
          autoComplete="off"
        />
      </div>
      {dirty && (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!valid}
          onClick={() => onSave(value.trim().toLowerCase())}
        >
          Salvar
        </Button>
      )}
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onInvite,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvite: (i: { email: string; nome: string; username: string; role: UserRole }) => void;
  submitting: boolean;
}) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<UserRole>("usuario");

  useEffect(() => {
    if (!open) {
      setEmail(""); setNome(""); setUsername(""); setRole("usuario");
    }
  }, [open]);

  const emailOk = /@suportesolos\.com\.br$/i.test(email.trim());
  const usernameOk = username === "" || /^[a-zA-Z0-9._-]{3,40}$/.test(username.trim());
  const canSubmit = emailOk && nome.trim().length >= 2 && usernameOk && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar novo usuário</DialogTitle>
          <DialogDescription>
            Cria a conta na hora com uma senha temporária — você informa a senha ao
            usuário (mostrada aqui depois de criar).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">E-mail</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.sobrenome@suportesolos.com.br"
              autoCapitalize="none"
            />
            {email && !emailOk && (
              <p className="text-[11px] text-destructive">Somente e-mails @suportesolos.com.br.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome completo</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João da Silva" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome de usuário (opcional)</label>
            <div className="relative">
              <AtSign className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="joao.silva"
                className="pl-7"
                autoCapitalize="none"
                autoComplete="off"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              3–40 caracteres, apenas letras, números, ponto, traço ou sublinhado. Permite login pelo modo "Usuário".
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Papel</label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="usuario">Usuário</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onInvite({
                email: email.trim().toLowerCase(),
                nome: nome.trim(),
                username: username.trim().toLowerCase(),
                role,
              })
            }
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PermsDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<TabKey>>(new Set());
  const [useDefault, setUseDefault] = useState(true);
  const setUserTabsFn = useServerFn(setUserTabPermissions);
  const setGuestTabsFn = useServerFn(setGuestTabPermissions);

  useEffect(() => {
    if (row) {
      setSelected(new Set(row.tabs as TabKey[]));
      setUseDefault(row.tabs.length === 0);
    }
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const tabs = useDefault ? [] : Array.from(selected);
      if (row.isGuest) {
        await setGuestTabsFn({ data: { tabs } });
      } else {
        await setUserTabsFn({ data: { userId: row.id, tabs } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Permissões salvas.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (k: TabKey) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row?.isGuest ? "Abas visíveis para convidados" : "Permissões de abas"}
          </DialogTitle>
          <DialogDescription>{row?.nome || row?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={useDefault} onCheckedChange={(v) => setUseDefault(!!v)} />
            {row?.isGuest
              ? "Liberar todas as abas não-admin (padrão)"
              : "Usar padrão do papel (todas as abas não-admin)"}
          </label>
          <div className={`grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-2 ${useDefault ? "opacity-50 pointer-events-none" : ""}`}>
            {ALL_TABS.filter((k) => !TAB_META[k].adminOnly).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm rounded border p-2">
                <Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(k)} />
                <span>{TAB_META[k].label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
