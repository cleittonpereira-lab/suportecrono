export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      amostras: {
        Row: {
          codigo: string | null
          created_at: string
          id: string
          identificacao: string | null
          material: string | null
          observacoes: string | null
          os_numero: string
          profundidade: string | null
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          id?: string
          identificacao?: string | null
          material?: string | null
          observacoes?: string | null
          os_numero: string
          profundidade?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string
          id?: string
          identificacao?: string | null
          material?: string | null
          observacoes?: string | null
          os_numero?: string
          profundidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      drive_folder_cache: {
        Row: {
          folder_id: string
          parent_id: string | null
          path: string
          updated_at: string
        }
        Insert: {
          folder_id: string
          parent_id?: string | null
          path: string
          updated_at?: string
        }
        Update: {
          folder_id?: string
          parent_id?: string | null
          path?: string
          updated_at?: string
        }
        Relationships: []
      }
      drive_sync_log: {
        Row: {
          created_at: string
          error: string | null
          file_id: string | null
          folder_id: string | null
          id: string
          kind: string
          metadata: Json | null
          rev: number | null
          scope_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          file_id?: string | null
          folder_id?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          rev?: number | null
          scope_id: string
          status: string
        }
        Update: {
          created_at?: string
          error?: string | null
          file_id?: string | null
          folder_id?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          rev?: number | null
          scope_id?: string
          status?: string
        }
        Relationships: []
      }
      ensaios: {
        Row: {
          amostra_id: string
          corpo_prova: string | null
          created_at: string
          equipamento_id: string | null
          id: string
          observacoes: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          status: Database["public"]["Enums"]["ensaio_status"]
          tecnico: string | null
          tipo_ensaio_id: string
          updated_at: string
        }
        Insert: {
          amostra_id: string
          corpo_prova?: string | null
          created_at?: string
          equipamento_id?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          status?: Database["public"]["Enums"]["ensaio_status"]
          tecnico?: string | null
          tipo_ensaio_id: string
          updated_at?: string
        }
        Update: {
          amostra_id?: string
          corpo_prova?: string | null
          created_at?: string
          equipamento_id?: string | null
          id?: string
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          status?: Database["public"]["Enums"]["ensaio_status"]
          tecnico?: string | null
          tipo_ensaio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ensaios_amostra_id_fkey"
            columns: ["amostra_id"]
            isOneToOne: false
            referencedRelation: "amostras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ensaios_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ensaios_tipo_ensaio_id_fkey"
            columns: ["tipo_ensaio_id"]
            isOneToOne: false
            referencedRelation: "tipos_ensaio"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          capacidade: number | null
          codigo: string | null
          created_at: string
          descricao: string | null
          fabricante: string | null
          id: string
          laboratorio: string | null
          modelo: string | null
          nome: string
          numero_serie: string | null
          observacoes: string | null
          situacao: Database["public"]["Enums"]["equipamento_situacao"]
          tempo_medio_min: number | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          capacidade?: number | null
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          fabricante?: string | null
          id?: string
          laboratorio?: string | null
          modelo?: string | null
          nome: string
          numero_serie?: string | null
          observacoes?: string | null
          situacao?: Database["public"]["Enums"]["equipamento_situacao"]
          tempo_medio_min?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          capacidade?: number | null
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          fabricante?: string | null
          id?: string
          laboratorio?: string | null
          modelo?: string | null
          nome?: string
          numero_serie?: string | null
          observacoes?: string | null
          situacao?: Database["public"]["Enums"]["equipamento_situacao"]
          tempo_medio_min?: number | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      guest_permissions: {
        Row: {
          created_at: string
          tab_key: string
        }
        Insert: {
          created_at?: string
          tab_key: string
        }
        Update: {
          created_at?: string
          tab_key?: string
        }
        Relationships: []
      }
      lab_capsulas: {
        Row: {
          amostra: string | null
          created_at: string
          created_by: string | null
          data_final: string | null
          data_inicial: string | null
          data_tara: string | null
          determinacao: string | null
          ensaio_codigo: string | null
          id: string
          numero: string
          observacoes: string | null
          operador_final_id: string | null
          operador_final_nome: string | null
          operador_inicial_id: string | null
          operador_inicial_nome: string | null
          os: string | null
          pendencia_id: string | null
          peso_final: number | null
          peso_inicial: number | null
          peso_tara: number | null
          tipo_ensaio: string | null
          updated_at: string
        }
        Insert: {
          amostra?: string | null
          created_at?: string
          created_by?: string | null
          data_final?: string | null
          data_inicial?: string | null
          data_tara?: string | null
          determinacao?: string | null
          ensaio_codigo?: string | null
          id?: string
          numero: string
          observacoes?: string | null
          operador_final_id?: string | null
          operador_final_nome?: string | null
          operador_inicial_id?: string | null
          operador_inicial_nome?: string | null
          os?: string | null
          pendencia_id?: string | null
          peso_final?: number | null
          peso_inicial?: number | null
          peso_tara?: number | null
          tipo_ensaio?: string | null
          updated_at?: string
        }
        Update: {
          amostra?: string | null
          created_at?: string
          created_by?: string | null
          data_final?: string | null
          data_inicial?: string | null
          data_tara?: string | null
          determinacao?: string | null
          ensaio_codigo?: string | null
          id?: string
          numero?: string
          observacoes?: string | null
          operador_final_id?: string | null
          operador_final_nome?: string | null
          operador_inicial_id?: string | null
          operador_inicial_nome?: string | null
          os?: string | null
          pendencia_id?: string | null
          peso_final?: number | null
          peso_inicial?: number | null
          peso_tara?: number | null
          tipo_ensaio?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_capsulas_pendencia_id_fkey"
            columns: ["pendencia_id"]
            isOneToOne: false
            referencedRelation: "lab_pendencias_digitacao"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_draft_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          diff: Json
          id: string
          rev: number
          scope_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          diff: Json
          id?: string
          rev: number
          scope_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          diff?: Json
          id?: string
          rev?: number
          scope_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_draft_history_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "lab_index"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      lab_index: {
        Row: {
          amostra_code: string | null
          ensaio_nome: string | null
          ensaio_tipo: string | null
          extra: Json | null
          os_cliente: string | null
          os_numero: string | null
          rev: number | null
          scope_id: string
          updated_at: string
          workflow_status: string
        }
        Insert: {
          amostra_code?: string | null
          ensaio_nome?: string | null
          ensaio_tipo?: string | null
          extra?: Json | null
          os_cliente?: string | null
          os_numero?: string | null
          rev?: number | null
          scope_id: string
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          amostra_code?: string | null
          ensaio_nome?: string | null
          ensaio_tipo?: string | null
          extra?: Json | null
          os_cliente?: string | null
          os_numero?: string | null
          rev?: number | null
          scope_id?: string
          updated_at?: string
          workflow_status?: string
        }
        Relationships: []
      }
      lab_os: {
        Row: {
          id: string
          numero: string
          client: string | null
          work_number: string | null
          local: string | null
          operator: string | null
          technical_resp: string | null
          revision: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          numero: string
          client?: string | null
          work_number?: string | null
          local?: string | null
          operator?: string | null
          technical_resp?: string | null
          revision?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          numero?: string
          client?: string | null
          work_number?: string | null
          local?: string | null
          operator?: string | null
          technical_resp?: string | null
          revision?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lab_amostras: {
        Row: {
          id: string
          os_id: string
          report_number: string | null
          borehole: string | null
          depth: string | null
          description: string | null
          granulometric_description: string | null
          code: string | null
          sample_type: string | null
          material_type: string | null
          coords: Json | null
          photos: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          os_id: string
          report_number?: string | null
          borehole?: string | null
          depth?: string | null
          description?: string | null
          granulometric_description?: string | null
          code?: string | null
          sample_type?: string | null
          material_type?: string | null
          coords?: Json | null
          photos?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          os_id?: string
          report_number?: string | null
          borehole?: string | null
          depth?: string | null
          description?: string | null
          granulometric_description?: string | null
          code?: string | null
          sample_type?: string | null
          material_type?: string | null
          coords?: Json | null
          photos?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_amostras_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "lab_os"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_ensaios: {
        Row: {
          id: string
          amostra_id: string
          tipo: string
          status: string | null
          label: string | null
          nome: string | null
          sigla: string | null
          operator: string | null
          photos: Json
          payload: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          amostra_id: string
          tipo: string
          status?: string | null
          label?: string | null
          nome?: string | null
          sigla?: string | null
          operator?: string | null
          photos?: Json
          payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          amostra_id?: string
          tipo?: string
          status?: string | null
          label?: string | null
          nome?: string | null
          sigla?: string | null
          operator?: string | null
          photos?: Json
          payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_ensaios_amostra_id_fkey"
            columns: ["amostra_id"]
            isOneToOne: false
            referencedRelation: "lab_amostras"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_pendencias_digitacao: {
        Row: {
          amostra: string | null
          aprovador_user_id: string | null
          created_at: string
          data_conclusao: string
          digitador_user_id: string | null
          ensaio: string
          equipamento: string | null
          id: string
          observacao: string | null
          operador_nome: string | null
          operador_user_id: string | null
          origem: string
          os: string
          payload: Json | null
          programacao_id: string | null
          status: string
          tipo_ensaio: string | null
          updated_at: string
          verificador_user_id: string | null
        }
        Insert: {
          amostra?: string | null
          aprovador_user_id?: string | null
          created_at?: string
          data_conclusao?: string
          digitador_user_id?: string | null
          ensaio: string
          equipamento?: string | null
          id?: string
          observacao?: string | null
          operador_nome?: string | null
          operador_user_id?: string | null
          origem?: string
          os: string
          payload?: Json | null
          programacao_id?: string | null
          status?: string
          tipo_ensaio?: string | null
          updated_at?: string
          verificador_user_id?: string | null
        }
        Update: {
          amostra?: string | null
          aprovador_user_id?: string | null
          created_at?: string
          data_conclusao?: string
          digitador_user_id?: string | null
          ensaio?: string
          equipamento?: string | null
          id?: string
          observacao?: string | null
          operador_nome?: string | null
          operador_user_id?: string | null
          origem?: string
          os?: string
          payload?: Json | null
          programacao_id?: string | null
          status?: string
          tipo_ensaio?: string | null
          updated_at?: string
          verificador_user_id?: string | null
        }
        Relationships: []
      }
      lab_report_approval_comments: {
        Row: {
          action: string
          author_id: string
          author_name: string | null
          author_role: string | null
          comment: string | null
          created_at: string
          id: string
          rev: number
          scope_id: string
        }
        Insert: {
          action: string
          author_id: string
          author_name?: string | null
          author_role?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rev: number
          scope_id: string
        }
        Update: {
          action?: string
          author_id?: string
          author_name?: string | null
          author_role?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rev?: number
          scope_id?: string
        }
        Relationships: []
      }
      lab_report_approvals: {
        Row: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          filename: string | null
          id: string
          requested_at: string
          requested_by: string
          requested_by_name: string | null
          rev: number
          scope_id: string
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
          verification_comment: string | null
          verified_at: string | null
          verified_by: string | null
          verified_by_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          filename?: string | null
          id?: string
          requested_at?: string
          requested_by: string
          requested_by_name?: string | null
          rev: number
          scope_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          verification_comment?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          filename?: string | null
          id?: string
          requested_at?: string
          requested_by?: string
          requested_by_name?: string | null
          rev?: number
          scope_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          verification_comment?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cargo: string | null
          created_at: string
          email: string
          id: string
          lab_report_role: Database["public"]["Enums"]["lab_report_role"]
          nome: string | null
          status: Database["public"]["Enums"]["profile_status"]
          titulo: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email: string
          id: string
          lab_report_role?: Database["public"]["Enums"]["lab_report_role"]
          nome?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          titulo?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string
          id?: string
          lab_report_role?: Database["public"]["Enums"]["lab_report_role"]
          nome?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          titulo?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      programacao_historico: {
        Row: {
          acao: string
          autor: string | null
          created_at: string
          detalhes: Json | null
          ensaio_id: string | null
          id: string
          programacao_id: string | null
        }
        Insert: {
          acao: string
          autor?: string | null
          created_at?: string
          detalhes?: Json | null
          ensaio_id?: string | null
          id?: string
          programacao_id?: string | null
        }
        Update: {
          acao?: string
          autor?: string | null
          created_at?: string
          detalhes?: Json | null
          ensaio_id?: string | null
          id?: string
          programacao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programacao_historico_ensaio_id_fkey"
            columns: ["ensaio_id"]
            isOneToOne: false
            referencedRelation: "ensaios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacao_historico_programacao_id_fkey"
            columns: ["programacao_id"]
            isOneToOne: false
            referencedRelation: "programacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      programacoes: {
        Row: {
          created_at: string
          ensaio_id: string
          equipamento_id: string | null
          fim: string
          id: string
          inicio: string
          observacoes: string | null
          ordem: number | null
          status: Database["public"]["Enums"]["programacao_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ensaio_id: string
          equipamento_id?: string | null
          fim: string
          id?: string
          inicio: string
          observacoes?: string | null
          ordem?: number | null
          status?: Database["public"]["Enums"]["programacao_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ensaio_id?: string
          equipamento_id?: string | null
          fim?: string
          id?: string
          inicio?: string
          observacoes?: string | null
          ordem?: number | null
          status?: Database["public"]["Enums"]["programacao_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programacoes_ensaio_id_fkey"
            columns: ["ensaio_id"]
            isOneToOne: false
            referencedRelation: "ensaios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programacoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_permissions: {
        Row: {
          created_at: string
          id: string
          tab_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tab_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tab_key?: string
          user_id?: string
        }
        Relationships: []
      }
      tipos_ensaio: {
        Row: {
          codigo: string | null
          cor_gantt: string | null
          created_at: string
          equipamento_padrao_id: string | null
          id: string
          nome: string
          observacoes: string | null
          permite_paralelo: boolean
          tempo_desmontagem_min: number | null
          tempo_max_min: number | null
          tempo_medio_min: number | null
          tempo_min_min: number | null
          tempo_preparacao_min: number | null
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          cor_gantt?: string | null
          created_at?: string
          equipamento_padrao_id?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          permite_paralelo?: boolean
          tempo_desmontagem_min?: number | null
          tempo_max_min?: number | null
          tempo_medio_min?: number | null
          tempo_min_min?: number | null
          tempo_preparacao_min?: number | null
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          cor_gantt?: string | null
          created_at?: string
          equipamento_padrao_id?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          permite_paralelo?: boolean
          tempo_desmontagem_min?: number | null
          tempo_max_min?: number | null
          tempo_medio_min?: number | null
          tempo_min_min?: number | null
          tempo_preparacao_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_ensaio_equipamento_padrao_id_fkey"
            columns: ["equipamento_padrao_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_ensaio_dependencias: {
        Row: {
          created_at: string
          id: string
          predecessor_id: string
          sucessor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          predecessor_id: string
          sucessor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          predecessor_id?: string
          sucessor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_ensaio_dependencias_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "tipos_ensaio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipos_ensaio_dependencias_sucessor_id_fkey"
            columns: ["sucessor_id"]
            isOneToOne: false
            referencedRelation: "tipos_ensaio"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      resolve_email_by_username: {
        Args: { _username: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "gestor" | "usuario" | "verificador"
      approval_status:
        | "digitacao"
        | "pendente"
        | "pendente_verificacao"
        | "verificado"
        | "rejeitado_verificacao"
        | "pendente_aprovacao"
        | "aprovado"
        | "rejeitado"
      ensaio_status:
        | "recebido"
        | "aguardando_programacao"
        | "programado"
        | "em_preparacao"
        | "em_execucao"
        | "pausado"
        | "aguardando_leitura"
        | "finalizado"
        | "conferencia"
        | "liberado"
        | "entregue"
        | "cancelado"
      equipamento_situacao:
        | "disponivel"
        | "manutencao"
        | "interditado"
        | "inativo"
      lab_report_role: "aprovador" | "verificador" | "digitador" | "nenhum"
      prioridade: "baixa" | "normal" | "alta" | "urgente"
      profile_status: "pendente" | "ativo" | "bloqueado"
      programacao_status:
        | "nao_programado"
        | "programado"
        | "em_execucao"
        | "finalizado"
        | "atrasado"
        | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gestor", "usuario", "verificador"],
      approval_status: [
        "digitacao",
        "pendente",
        "pendente_verificacao",
        "verificado",
        "rejeitado_verificacao",
        "pendente_aprovacao",
        "aprovado",
        "rejeitado",
      ],
      ensaio_status: [
        "recebido",
        "aguardando_programacao",
        "programado",
        "em_preparacao",
        "em_execucao",
        "pausado",
        "aguardando_leitura",
        "finalizado",
        "conferencia",
        "liberado",
        "entregue",
        "cancelado",
      ],
      equipamento_situacao: [
        "disponivel",
        "manutencao",
        "interditado",
        "inativo",
      ],
      lab_report_role: ["aprovador", "verificador", "digitador", "nenhum"],
      prioridade: ["baixa", "normal", "alta", "urgente"],
      profile_status: ["pendente", "ativo", "bloqueado"],
      programacao_status: [
        "nao_programado",
        "programado",
        "em_execucao",
        "finalizado",
        "atrasado",
        "cancelado",
      ],
    },
  },
} as const
