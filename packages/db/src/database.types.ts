
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_events": {
                  Row: {
                    "action_type": string,"actor_type": string,"actor_user_id": string | null,"agent_id": string | null,"agent_run_id": string | null,"department_id": string | null,"detail": NonNullable<Json>,"id": string,"occurred_at": string,"organization_id": string,"process_id": string | null,"status": string,"title": string
                  }
                  Insert: {
                    "action_type": string,"actor_type": string,"actor_user_id"?: string | null,"agent_id"?: string | null,"agent_run_id"?: string | null,"department_id"?: string | null,"detail"?: NonNullable<Json>,"id"?: string,"occurred_at"?: string,"organization_id": string,"process_id"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "action_type"?: string,"actor_type"?: string,"actor_user_id"?: string | null,"agent_id"?: string | null,"agent_run_id"?: string | null,"department_id"?: string | null,"detail"?: NonNullable<Json>,"id"?: string,"occurred_at"?: string,"organization_id"?: string,"process_id"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_process_id_fkey"
      columns: ["process_id"]
isOneToOne: false
      referencedRelation: "processes"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_actions": {
                  Row: {
                    "access": string,"agent_id": string,"agent_run_id": string,"approval_request_id": string | null,"arguments": NonNullable<Json>,"created_at": string,"error": string | null,"finished_at": string | null,"id": string,"idempotency_key": string,"organization_id": string,"policy_evaluation": Json | null,"result": Json | null,"status": Database["public"]['Enums']["action_status"],"tool": string
                  }
                  Insert: {
                    "access": string,"agent_id": string,"agent_run_id": string,"approval_request_id"?: string | null,"arguments": NonNullable<Json>,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key": string,"organization_id": string,"policy_evaluation"?: Json | null,"result"?: Json | null,"status"?: Database["public"]['Enums']["action_status"],"tool": string
                  }
                  Update: {
                    "access"?: string,"agent_id"?: string,"agent_run_id"?: string,"approval_request_id"?: string | null,"arguments"?: NonNullable<Json>,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"idempotency_key"?: string,"organization_id"?: string,"policy_evaluation"?: Json | null,"result"?: Json | null,"status"?: Database["public"]['Enums']["action_status"],"tool"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_actions_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_actions_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_actions_approval_fk"
      columns: ["approval_request_id"]
isOneToOne: false
      referencedRelation: "approval_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_actions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_feedback": {
                  Row: {
                    "agent_id": string,"agent_run_id": string,"created_at": string,"expected_outcome": string | null,"id": string,"organization_id": string,"user_id": string | null,"verdict": string
                  }
                  Insert: {
                    "agent_id": string,"agent_run_id": string,"created_at"?: string,"expected_outcome"?: string | null,"id"?: string,"organization_id": string,"user_id"?: string | null,"verdict": string
                  }
                  Update: {
                    "agent_id"?: string,"agent_run_id"?: string,"created_at"?: string,"expected_outcome"?: string | null,"id"?: string,"organization_id"?: string,"user_id"?: string | null,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_feedback_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_feedback_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_feedback_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_feedback_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_run_steps": {
                  Row: {
                    "agent_run_id": string,"cost": number,"created_at": string,"description": string,"duration_ms": number | null,"id": string,"input": Json | null,"model": string | null,"organization_id": string,"output": Json | null,"sequence": number,"status": string,"tool": string | null,"type": string
                  }
                  Insert: {
                    "agent_run_id": string,"cost"?: number,"created_at"?: string,"description": string,"duration_ms"?: number | null,"id"?: string,"input"?: Json | null,"model"?: string | null,"organization_id": string,"output"?: Json | null,"sequence": number,"status"?: string,"tool"?: string | null,"type": string
                  }
                  Update: {
                    "agent_run_id"?: string,"cost"?: number,"created_at"?: string,"description"?: string,"duration_ms"?: number | null,"id"?: string,"input"?: Json | null,"model"?: string | null,"organization_id"?: string,"output"?: Json | null,"sequence"?: number,"status"?: string,"tool"?: string | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_run_steps_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_run_steps_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_runs": {
                  Row: {
                    "agent_id": string,"agent_version_id": string,"baseline_minutes": number | null,"error": string | null,"error_retryable": boolean | null,"estimated_minutes_saved": number | null,"execution_cost": number,"external_job_id": string | null,"finished_at": string | null,"human_minutes": number,"id": string,"input": NonNullable<Json>,"input_tokens": number,"mode": Database["public"]['Enums']["run_mode"],"model": string | null,"model_cost": number,"organization_id": string,"outcome": string | null,"output": Json | null,"output_tokens": number,"process_id": string,"queued_at": string,"started_at": string | null,"started_by": string | null,"state": NonNullable<Json>,"status": Database["public"]['Enums']["run_status"],"success": boolean | null,"summary": string | null,"trigger": NonNullable<Json>
                  }
                  Insert: {
                    "agent_id": string,"agent_version_id": string,"baseline_minutes"?: number | null,"error"?: string | null,"error_retryable"?: boolean | null,"estimated_minutes_saved"?: number | null,"execution_cost"?: number,"external_job_id"?: string | null,"finished_at"?: string | null,"human_minutes"?: number,"id"?: string,"input"?: NonNullable<Json>,"input_tokens"?: number,"mode": Database["public"]['Enums']["run_mode"],"model"?: string | null,"model_cost"?: number,"organization_id": string,"outcome"?: string | null,"output"?: Json | null,"output_tokens"?: number,"process_id": string,"queued_at"?: string,"started_at"?: string | null,"started_by"?: string | null,"state"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["run_status"],"success"?: boolean | null,"summary"?: string | null,"trigger": NonNullable<Json>
                  }
                  Update: {
                    "agent_id"?: string,"agent_version_id"?: string,"baseline_minutes"?: number | null,"error"?: string | null,"error_retryable"?: boolean | null,"estimated_minutes_saved"?: number | null,"execution_cost"?: number,"external_job_id"?: string | null,"finished_at"?: string | null,"human_minutes"?: number,"id"?: string,"input"?: NonNullable<Json>,"input_tokens"?: number,"mode"?: Database["public"]['Enums']["run_mode"],"model"?: string | null,"model_cost"?: number,"organization_id"?: string,"outcome"?: string | null,"output"?: Json | null,"output_tokens"?: number,"process_id"?: string,"queued_at"?: string,"started_at"?: string | null,"started_by"?: string | null,"state"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["run_status"],"success"?: boolean | null,"summary"?: string | null,"trigger"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_runs_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_runs_agent_version_id_fkey"
      columns: ["agent_version_id"]
isOneToOne: false
      referencedRelation: "agent_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_runs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_runs_process_id_fkey"
      columns: ["process_id"]
isOneToOne: false
      referencedRelation: "processes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_tools": {
                  Row: {
                    "agent_version_id": string,"organization_id": string,"tool_key": string
                  }
                  Insert: {
                    "agent_version_id": string,"organization_id": string,"tool_key": string
                  }
                  Update: {
                    "agent_version_id"?: string,"organization_id"?: string,"tool_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_tools_agent_version_id_fkey"
      columns: ["agent_version_id"]
isOneToOne: false
      referencedRelation: "agent_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_tools_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_versions": {
                  Row: {
                    "agent_id": string,"autonomy_level": number,"change_note": string | null,"created_at": string,"created_by": string | null,"id": string,"instructions": NonNullable<Json>,"model_config": NonNullable<Json>,"organization_id": string,"policy_config": NonNullable<Json>,"success_criteria": NonNullable<Json>,"trigger_config": NonNullable<Json>,"version": number
                  }
                  Insert: {
                    "agent_id": string,"autonomy_level": number,"change_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instructions": NonNullable<Json>,"model_config"?: NonNullable<Json>,"organization_id": string,"policy_config": NonNullable<Json>,"success_criteria"?: NonNullable<Json>,"trigger_config": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "agent_id"?: string,"autonomy_level"?: number,"change_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"instructions"?: NonNullable<Json>,"model_config"?: NonNullable<Json>,"organization_id"?: string,"policy_config"?: NonNullable<Json>,"success_criteria"?: NonNullable<Json>,"trigger_config"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_versions_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_versions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"agents": {
                  Row: {
                    "active_version_id": string | null,"autonomy_level": number,"created_at": string,"created_by": string | null,"description": string,"id": string,"name": string,"objective": string,"opportunity_id": string | null,"organization_id": string,"process_id": string,"status": Database["public"]['Enums']["agent_status"],"trigger_schedule_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "active_version_id"?: string | null,"autonomy_level"?: number,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"name": string,"objective": string,"opportunity_id"?: string | null,"organization_id": string,"process_id": string,"status"?: Database["public"]['Enums']["agent_status"],"trigger_schedule_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active_version_id"?: string | null,"autonomy_level"?: number,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"name"?: string,"objective"?: string,"opportunity_id"?: string | null,"organization_id"?: string,"process_id"?: string,"status"?: Database["public"]['Enums']["agent_status"],"trigger_schedule_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agents_active_version_fk"
      columns: ["active_version_id"]
isOneToOne: false
      referencedRelation: "agent_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agents_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agents_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "automation_opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agents_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agents_process_id_fkey"
      columns: ["process_id"]
isOneToOne: false
      referencedRelation: "processes"
      referencedColumns: ["id"]
    }
                  ]
                },"api_keys": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"key_hash": string,"last_used_at": string | null,"name": string,"organization_id": string,"prefix": string,"revoked_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"key_hash": string,"last_used_at"?: string | null,"name": string,"organization_id": string,"prefix": string,"revoked_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"key_hash"?: string,"last_used_at"?: string | null,"name"?: string,"organization_id"?: string,"prefix"?: string,"revoked_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_keys_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "api_keys_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_requests": {
                  Row: {
                    "action_type": string,"agent_action_id": string | null,"agent_id": string,"agent_run_id": string,"comment": string | null,"confidence": number | null,"decision": Json | null,"description": string | null,"evidence": NonNullable<Json>,"expires_at": string,"id": string,"modifiable_fields": (string)[],"organization_id": string,"policy_checks": NonNullable<Json>,"proposed_action": NonNullable<Json>,"reasoning_summary": string | null,"requested_at": string,"resolved_at": string | null,"resolved_by": string | null,"risk": number | null,"status": Database["public"]['Enums']["approval_status"],"title": string,"tool": string
                  }
                  Insert: {
                    "action_type": string,"agent_action_id"?: string | null,"agent_id": string,"agent_run_id": string,"comment"?: string | null,"confidence"?: number | null,"decision"?: Json | null,"description"?: string | null,"evidence"?: NonNullable<Json>,"expires_at"?: string,"id"?: string,"modifiable_fields"?: (string)[],"organization_id": string,"policy_checks"?: NonNullable<Json>,"proposed_action": NonNullable<Json>,"reasoning_summary"?: string | null,"requested_at"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"risk"?: number | null,"status"?: Database["public"]['Enums']["approval_status"],"title": string,"tool": string
                  }
                  Update: {
                    "action_type"?: string,"agent_action_id"?: string | null,"agent_id"?: string,"agent_run_id"?: string,"comment"?: string | null,"confidence"?: number | null,"decision"?: Json | null,"description"?: string | null,"evidence"?: NonNullable<Json>,"expires_at"?: string,"id"?: string,"modifiable_fields"?: (string)[],"organization_id"?: string,"policy_checks"?: NonNullable<Json>,"proposed_action"?: NonNullable<Json>,"reasoning_summary"?: string | null,"requested_at"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"risk"?: number | null,"status"?: Database["public"]['Enums']["approval_status"],"title"?: string,"tool"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_requests_agent_action_id_fkey"
      columns: ["agent_action_id"]
isOneToOne: false
      referencedRelation: "agent_actions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_type": string,"actor_user_id": string | null,"agent_id": string | null,"agent_run_id": string | null,"agent_version_id": string | null,"approval_status": string | null,"id": string,"input": Json | null,"model": string | null,"occurred_at": string,"organization_id": string,"output": Json | null,"process_id": string | null,"result": string | null,"system": string | null,"tool": string | null
                  }
                  Insert: {
                    "action": string,"actor_type": string,"actor_user_id"?: string | null,"agent_id"?: string | null,"agent_run_id"?: string | null,"agent_version_id"?: string | null,"approval_status"?: string | null,"id"?: string,"input"?: Json | null,"model"?: string | null,"occurred_at"?: string,"organization_id": string,"output"?: Json | null,"process_id"?: string | null,"result"?: string | null,"system"?: string | null,"tool"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_type"?: string,"actor_user_id"?: string | null,"agent_id"?: string | null,"agent_run_id"?: string | null,"agent_version_id"?: string | null,"approval_status"?: string | null,"id"?: string,"input"?: Json | null,"model"?: string | null,"occurred_at"?: string,"organization_id"?: string,"output"?: Json | null,"process_id"?: string | null,"result"?: string | null,"system"?: string | null,"tool"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_opportunities": {
                  Row: {
                    "automation_difficulty_score": number,"business_value_score": number,"created_at": string,"created_by": string | null,"current_autonomy_level": number,"department_id": string | null,"description": string,"estimated_build_complexity": string | null,"estimated_cost_saved_monthly": number | null,"estimated_hours_saved_monthly": number | null,"evidence": NonNullable<Json>,"expected_outcome": string | null,"future_state_steps": NonNullable<Json>,"human_involvement": (string)[],"id": string,"major_risks": (string)[],"opportunity_score": number,"organization_id": string,"problem": string,"process_id": string,"proposed_agent": NonNullable<Json>,"proposed_future_state": string,"rationale": string | null,"recommended_next_step": string | null,"required_approvals": (string)[],"required_integrations": (string)[],"required_tools": (string)[],"risk_score": number,"scope": string | null,"status": Database["public"]['Enums']["opportunity_status"],"target_autonomy_level": number,"template_key": string | null,"title": string,"updated_at": string
                  }
                  Insert: {
                    "automation_difficulty_score": number,"business_value_score": number,"created_at"?: string,"created_by"?: string | null,"current_autonomy_level": number,"department_id"?: string | null,"description"?: string,"estimated_build_complexity"?: string | null,"estimated_cost_saved_monthly"?: number | null,"estimated_hours_saved_monthly"?: number | null,"evidence"?: NonNullable<Json>,"expected_outcome"?: string | null,"future_state_steps"?: NonNullable<Json>,"human_involvement"?: (string)[],"id"?: string,"major_risks"?: (string)[],"opportunity_score"?: number,"organization_id": string,"problem"?: string,"process_id": string,"proposed_agent"?: NonNullable<Json>,"proposed_future_state"?: string,"rationale"?: string | null,"recommended_next_step"?: string | null,"required_approvals"?: (string)[],"required_integrations"?: (string)[],"required_tools"?: (string)[],"risk_score": number,"scope"?: string | null,"status"?: Database["public"]['Enums']["opportunity_status"],"target_autonomy_level": number,"template_key"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "automation_difficulty_score"?: number,"business_value_score"?: number,"created_at"?: string,"created_by"?: string | null,"current_autonomy_level"?: number,"department_id"?: string | null,"description"?: string,"estimated_build_complexity"?: string | null,"estimated_cost_saved_monthly"?: number | null,"estimated_hours_saved_monthly"?: number | null,"evidence"?: NonNullable<Json>,"expected_outcome"?: string | null,"future_state_steps"?: NonNullable<Json>,"human_involvement"?: (string)[],"id"?: string,"major_risks"?: (string)[],"opportunity_score"?: number,"organization_id"?: string,"problem"?: string,"process_id"?: string,"proposed_agent"?: NonNullable<Json>,"proposed_future_state"?: string,"rationale"?: string | null,"recommended_next_step"?: string | null,"required_approvals"?: (string)[],"required_integrations"?: (string)[],"required_tools"?: (string)[],"risk_score"?: number,"scope"?: string | null,"status"?: Database["public"]['Enums']["opportunity_status"],"target_autonomy_level"?: number,"template_key"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_opportunities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automation_opportunities_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automation_opportunities_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automation_opportunities_process_id_fkey"
      columns: ["process_id"]
isOneToOne: false
      referencedRelation: "processes"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"hourly_labour_cost": number | null,"id": string,"name": string,"organization_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"hourly_labour_cost"?: number | null,"id"?: string,"name": string,"organization_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"hourly_labour_cost"?: number | null,"id"?: string,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "departments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"discovery_runs": {
                  Row: {
                    "accepted": NonNullable<Json>,"created_at": string,"created_by": string | null,"error": string | null,"id": string,"organization_id": string,"proposals": NonNullable<Json>,"samples": Json | null,"status": string,"summary": string | null,"systems": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "accepted"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"id"?: string,"organization_id": string,"proposals"?: NonNullable<Json>,"samples"?: Json | null,"status"?: string,"summary"?: string | null,"systems"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "accepted"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"id"?: string,"organization_id"?: string,"proposals"?: NonNullable<Json>,"samples"?: Json | null,"status"?: string,"summary"?: string | null,"systems"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discovery_runs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_runs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"discovery_sessions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"department_id": string | null,"department_name": string | null,"extracted": NonNullable<Json>,"id": string,"messages": NonNullable<Json>,"method": Database["public"]['Enums']["discovery_source"],"organization_id": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"department_name"?: string | null,"extracted"?: NonNullable<Json>,"id"?: string,"messages"?: NonNullable<Json>,"method"?: Database["public"]['Enums']["discovery_source"],"organization_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"department_name"?: string | null,"extracted"?: NonNullable<Json>,"id"?: string,"messages"?: NonNullable<Json>,"method"?: Database["public"]['Enums']["discovery_source"],"organization_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discovery_sessions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_sessions_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discovery_sessions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "content": string,"created_at": string,"created_by": string | null,"id": string,"organization_id": string,"search": unknown,"source": string,"title": string
                  }
                  Insert: {
                    "content": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id": string,"search"?: never,"source"?: string,"title": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string,"search"?: never,"source"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"human_interventions": {
                  Row: {
                    "agent_id": string | null,"agent_run_id": string | null,"approval_request_id": string | null,"created_at": string,"description": string,"id": string,"minutes_spent": number,"organization_id": string,"type": Database["public"]['Enums']["intervention_type"],"user_id": string | null
                  }
                  Insert: {
                    "agent_id"?: string | null,"agent_run_id"?: string | null,"approval_request_id"?: string | null,"created_at"?: string,"description": string,"id"?: string,"minutes_spent"?: number,"organization_id": string,"type": Database["public"]['Enums']["intervention_type"],"user_id"?: string | null
                  }
                  Update: {
                    "agent_id"?: string | null,"agent_run_id"?: string | null,"approval_request_id"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"minutes_spent"?: number,"organization_id"?: string,"type"?: Database["public"]['Enums']["intervention_type"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "human_interventions_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "human_interventions_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "human_interventions_approval_request_id_fkey"
      columns: ["approval_request_id"]
isOneToOne: false
      referencedRelation: "approval_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "human_interventions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "human_interventions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_connections": {
                  Row: {
                    "account_label": string | null,"connected_at": string,"connected_by": string | null,"disconnected_at": string | null,"external_account_id": string | null,"granted_permissions": NonNullable<Json>,"id": string,"integration_key": string,"last_error": string | null,"organization_id": string,"provider": Database["public"]['Enums']["integration_provider"],"status": Database["public"]['Enums']["connection_status"]
                  }
                  Insert: {
                    "account_label"?: string | null,"connected_at"?: string,"connected_by"?: string | null,"disconnected_at"?: string | null,"external_account_id"?: string | null,"granted_permissions"?: NonNullable<Json>,"id"?: string,"integration_key": string,"last_error"?: string | null,"organization_id": string,"provider": Database["public"]['Enums']["integration_provider"],"status"?: Database["public"]['Enums']["connection_status"]
                  }
                  Update: {
                    "account_label"?: string | null,"connected_at"?: string,"connected_by"?: string | null,"disconnected_at"?: string | null,"external_account_id"?: string | null,"granted_permissions"?: NonNullable<Json>,"id"?: string,"integration_key"?: string,"last_error"?: string | null,"organization_id"?: string,"provider"?: Database["public"]['Enums']["integration_provider"],"status"?: Database["public"]['Enums']["connection_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_connections_connected_by_fkey"
      columns: ["connected_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_connections_integration_key_fkey"
      columns: ["integration_key"]
isOneToOne: false
      referencedRelation: "integrations"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "integration_connections_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_secrets": {
                  Row: {
                    "connection_id": string,"created_at": string,"organization_id": string,"webhook_secret": string
                  }
                  Insert: {
                    "connection_id": string,"created_at"?: string,"organization_id": string,"webhook_secret"?: string
                  }
                  Update: {
                    "connection_id"?: string,"created_at"?: string,"organization_id"?: string,"webhook_secret"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_secrets_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: true
      referencedRelation: "integration_connections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_secrets_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"integrations": {
                  Row: {
                    "category": string,"description": string,"key": string,"name": string,"permissions": NonNullable<Json>,"priority": number,"sort_order": number
                  }
                  Insert: {
                    "category": string,"description": string,"key": string,"name": string,"permissions"?: NonNullable<Json>,"priority"?: number,"sort_order"?: number
                  }
                  Update: {
                    "category"?: string,"description"?: string,"key"?: string,"name"?: string,"permissions"?: NonNullable<Json>,"priority"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"invoices": {
                  Row: {
                    "amount": number,"currency": string,"id": string,"issued_at": string,"number": string,"organization_id": string,"period_end": string,"period_start": string,"status": string,"url": string | null
                  }
                  Insert: {
                    "amount": number,"currency"?: string,"id"?: string,"issued_at"?: string,"number": string,"organization_id": string,"period_end": string,"period_start": string,"status"?: string,"url"?: string | null
                  }
                  Update: {
                    "amount"?: number,"currency"?: string,"id"?: string,"issued_at"?: string,"number"?: string,"organization_id"?: string,"period_end"?: string,"period_start"?: string,"status"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"metrics": {
                  Row: {
                    "computed_at": string,"dimension": string,"id": string,"metric": string,"organization_id": string,"period": string,"value": number
                  }
                  Insert: {
                    "computed_at"?: string,"dimension"?: string,"id"?: string,"metric": string,"organization_id": string,"period": string,"value": number
                  }
                  Update: {
                    "computed_at"?: string,"dimension"?: string,"id"?: string,"metric"?: string,"organization_id"?: string,"period"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "metrics_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"model_usage": {
                  Row: {
                    "agent_run_id": string | null,"cached_input_tokens": number,"created_at": string,"estimated_cost": number,"id": string,"input_tokens": number,"model": string,"model_class": string,"organization_id": string,"output_tokens": number,"purpose": string
                  }
                  Insert: {
                    "agent_run_id"?: string | null,"cached_input_tokens"?: number,"created_at"?: string,"estimated_cost"?: number,"id"?: string,"input_tokens"?: number,"model": string,"model_class": string,"organization_id": string,"output_tokens"?: number,"purpose": string
                  }
                  Update: {
                    "agent_run_id"?: string | null,"cached_input_tokens"?: number,"created_at"?: string,"estimated_cost"?: number,"id"?: string,"input_tokens"?: number,"model"?: string,"model_class"?: string,"organization_id"?: string,"output_tokens"?: number,"purpose"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "model_usage_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "model_usage_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"kind": string,"link": string | null,"organization_id": string,"read_at": string | null,"title": string,"user_id": string | null
                  }
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"link"?: string | null,"organization_id": string,"read_at"?: string | null,"title": string,"user_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"organization_id"?: string,"read_at"?: string | null,"title"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_invites": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"id": string,"invited_by": string | null,"organization_id": string,"role": Database["public"]['Enums']["member_role"]
                  }
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"role"?: Database["public"]['Enums']["member_role"]
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invites_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "approval_limit": number | null,"can_approve": boolean,"created_at": string,"notification_preferences": NonNullable<Json>,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Insert: {
                    "approval_limit"?: number | null,"can_approve"?: boolean,"created_at"?: string,"notification_preferences"?: NonNullable<Json>,"organization_id": string,"role"?: Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "approval_limit"?: number | null,"can_approve"?: boolean,"created_at"?: string,"notification_preferences"?: NonNullable<Json>,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "agents_paused": boolean,"agents_paused_at": string | null,"agents_paused_by": string | null,"agents_paused_until": string | null,"billing_customer_id": string | null,"company_summary": string | null,"country": string | null,"created_at": string,"created_by": string | null,"currency": string,"default_hourly_cost": number,"description": string | null,"detected_tools": (string)[],"employee_count": string | null,"id": string,"improvement_areas": (string)[],"industry": string | null,"is_demo": boolean,"name": string,"onboarding_completed_at": string | null,"onboarding_step": string,"plan": string,"subscription_status": string,"updated_at": string,"website": string | null,"website_profile": Json | null,"website_profiled_at": string | null
                  }
                  Insert: {
                    "agents_paused"?: boolean,"agents_paused_at"?: string | null,"agents_paused_by"?: string | null,"agents_paused_until"?: string | null,"billing_customer_id"?: string | null,"company_summary"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_hourly_cost"?: number,"description"?: string | null,"detected_tools"?: (string)[],"employee_count"?: string | null,"id"?: string,"improvement_areas"?: (string)[],"industry"?: string | null,"is_demo"?: boolean,"name": string,"onboarding_completed_at"?: string | null,"onboarding_step"?: string,"plan"?: string,"subscription_status"?: string,"updated_at"?: string,"website"?: string | null,"website_profile"?: Json | null,"website_profiled_at"?: string | null
                  }
                  Update: {
                    "agents_paused"?: boolean,"agents_paused_at"?: string | null,"agents_paused_by"?: string | null,"agents_paused_until"?: string | null,"billing_customer_id"?: string | null,"company_summary"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_hourly_cost"?: number,"description"?: string | null,"detected_tools"?: (string)[],"employee_count"?: string | null,"id"?: string,"improvement_areas"?: (string)[],"industry"?: string | null,"is_demo"?: boolean,"name"?: string,"onboarding_completed_at"?: string | null,"onboarding_step"?: string,"plan"?: string,"subscription_status"?: string,"updated_at"?: string,"website"?: string | null,"website_profile"?: Json | null,"website_profiled_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_agents_paused_by_fkey"
      columns: ["agents_paused_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organizations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"process_people": {
                  Row: {
                    "organization_id": string,"process_id": string,"role": string
                  }
                  Insert: {
                    "organization_id": string,"process_id": string,"role": string
                  }
                  Update: {
                    "organization_id"?: string,"process_id"?: string,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "process_people_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "process_people_process_id_fkey"
      columns: ["process_id"]
isOneToOne: false
      referencedRelation: "processes"
      referencedColumns: ["id"]
    }
                  ]
                },"process_steps": {
                  Row: {
                    "action_type": string | null,"current_automation": string | null,"description": string | null,"estimated_duration_minutes": number | null,"id": string,"organization_id": string,"performed_by": string | null,"position": number,"process_id": string,"requires_judgement": boolean,"risk": number | null,"system": string | null,"title": string
                  }
                  Insert: {
                    "action_type"?: string | null,"current_automation"?: string | null,"description"?: string | null,"estimated_duration_minutes"?: number | null,"id"?: string,"organization_id": string,"performed_by"?: string | null,"position": number,"process_id": string,"requires_judgement"?: boolean,"risk"?: number | null,"system"?: string | null,"title": string
                  }
                  Update: {
                    "action_type"?: string | null,"current_automation"?: string | null,"description"?: string | null,"estimated_duration_minutes"?: number | null,"id"?: string,"organization_id"?: string,"performed_by"?: string | null,"position"?: number,"process_id"?: string,"requires_judgement"?: boolean,"risk"?: number | null,"system"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "process_steps_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "process_steps_process_id_fkey"
      columns: ["process_id"]
isOneToOne: false
      referencedRelation: "processes"
      referencedColumns: ["id"]
    }
                  ]
                },"process_systems": {
                  Row: {
                    "organization_id": string,"process_id": string,"system": string
                  }
                  Insert: {
                    "organization_id": string,"process_id": string,"system": string
                  }
                  Update: {
                    "organization_id"?: string,"process_id"?: string,"system"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "process_systems_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "process_systems_process_id_fkey"
      columns: ["process_id"]
isOneToOne: false
      referencedRelation: "processes"
      referencedColumns: ["id"]
    }
                  ]
                },"processes": {
                  Row: {
                    "automation_difficulty": number,"business_value": number,"confidence": number | null,"created_at": string,"created_by": string | null,"current_autonomy_level": number,"decision_points": (string)[],"department_id": string | null,"description": string,"discovery_session_id": string | null,"discovery_source": Database["public"]['Enums']["discovery_source"],"document_id": string | null,"estimated_minutes_per_occurrence": number | null,"estimated_occurrences_per_month": number | null,"evidence": NonNullable<Json>,"exceptions": (string)[],"frequency": Database["public"]['Enums']["process_frequency"],"id": string,"inputs": (string)[],"missing_information": (string)[],"notes": string | null,"organization_id": string,"outputs": (string)[],"potential_autonomy_level": number,"reviewed_at": string | null,"reviewed_by": string | null,"risk_level": number,"status": Database["public"]['Enums']["process_status"],"title": string,"trigger": string | null,"updated_at": string
                  }
                  Insert: {
                    "automation_difficulty"?: number,"business_value"?: number,"confidence"?: number | null,"created_at"?: string,"created_by"?: string | null,"current_autonomy_level"?: number,"decision_points"?: (string)[],"department_id"?: string | null,"description"?: string,"discovery_session_id"?: string | null,"discovery_source"?: Database["public"]['Enums']["discovery_source"],"document_id"?: string | null,"estimated_minutes_per_occurrence"?: number | null,"estimated_occurrences_per_month"?: number | null,"evidence"?: NonNullable<Json>,"exceptions"?: (string)[],"frequency"?: Database["public"]['Enums']["process_frequency"],"id"?: string,"inputs"?: (string)[],"missing_information"?: (string)[],"notes"?: string | null,"organization_id": string,"outputs"?: (string)[],"potential_autonomy_level"?: number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"risk_level"?: number,"status"?: Database["public"]['Enums']["process_status"],"title": string,"trigger"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "automation_difficulty"?: number,"business_value"?: number,"confidence"?: number | null,"created_at"?: string,"created_by"?: string | null,"current_autonomy_level"?: number,"decision_points"?: (string)[],"department_id"?: string | null,"description"?: string,"discovery_session_id"?: string | null,"discovery_source"?: Database["public"]['Enums']["discovery_source"],"document_id"?: string | null,"estimated_minutes_per_occurrence"?: number | null,"estimated_occurrences_per_month"?: number | null,"evidence"?: NonNullable<Json>,"exceptions"?: (string)[],"frequency"?: Database["public"]['Enums']["process_frequency"],"id"?: string,"inputs"?: (string)[],"missing_information"?: (string)[],"notes"?: string | null,"organization_id"?: string,"outputs"?: (string)[],"potential_autonomy_level"?: number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"risk_level"?: number,"status"?: Database["public"]['Enums']["process_status"],"title"?: string,"trigger"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "processes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "processes_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "processes_discovery_session_id_fkey"
      columns: ["discovery_session_id"]
isOneToOne: false
      referencedRelation: "discovery_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "processes_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "processes_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "processes_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"sandbox_records": {
                  Row: {
                    "created_at": string,"data": NonNullable<Json>,"external_id": string,"id": string,"kind": string,"organization_id": string,"system": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"data": NonNullable<Json>,"external_id": string,"id"?: string,"kind": string,"organization_id": string,"system": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"external_id"?: string,"id"?: string,"kind"?: string,"organization_id"?: string,"system"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sandbox_records_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"email": string,"first_name": string,"id": string,"last_name": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"first_name"?: string,"id": string,"last_name"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_pending_invites":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"create_organization":
{ Args: { "p_country": string,"p_description": string,"p_employee_count": string,"p_industry": string,"p_name": string,"p_website": string }; Returns: string
                           },
"has_org_role":
{ Args: { "org": string,"roles": (Database["public"]['Enums']["member_role"])[] }; Returns: boolean
                           },
"is_org_member":
{ Args: { "org": string }; Returns: boolean
                           }
          }
          Enums: {
            "action_status": "pending"|"succeeded"|"failed"|"simulated"|"skipped","agent_status": "draft"|"testing"|"active"|"paused"|"error"|"archived","approval_status": "pending"|"approved"|"rejected"|"modified"|"expired","connection_status": "connected"|"error"|"disconnected","discovery_source": "interview"|"document"|"integration"|"manual"|"website","integration_provider": "sandbox"|"composio","intervention_type": "approval"|"exception"|"correction"|"manual_completion"|"override"|"information_request","member_role": "owner"|"admin"|"member","opportunity_status": "suggested"|"reviewing"|"approved"|"building"|"live"|"rejected"|"archived","process_frequency": "ad_hoc"|"daily"|"weekly"|"monthly"|"event_driven","process_status": "draft"|"reviewed"|"active"|"archived","run_mode": "test"|"production","run_status": "queued"|"running"|"waiting_for_approval"|"completed"|"failed"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "action_status": ["pending", "succeeded", "failed", "simulated", "skipped"],"agent_status": ["draft", "testing", "active", "paused", "error", "archived"],"approval_status": ["pending", "approved", "rejected", "modified", "expired"],"connection_status": ["connected", "error", "disconnected"],"discovery_source": ["interview", "document", "integration", "manual", "website"],"integration_provider": ["sandbox", "composio"],"intervention_type": ["approval", "exception", "correction", "manual_completion", "override", "information_request"],"member_role": ["owner", "admin", "member"],"opportunity_status": ["suggested", "reviewing", "approved", "building", "live", "rejected", "archived"],"process_frequency": ["ad_hoc", "daily", "weekly", "monthly", "event_driven"],"process_status": ["draft", "reviewed", "active", "archived"],"run_mode": ["test", "production"],"run_status": ["queued", "running", "waiting_for_approval", "completed", "failed", "cancelled"]
          }
        }
} as const

