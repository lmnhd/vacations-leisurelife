/**
 * Chat System Types — Core types for the Interactive Agent pipeline.
 * Sourced from CHAT_SYSTEM_BLUEPRINT.md and hero-chat skill.
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

export type Role = 'user' | 'assistant' | 'system';
export type Channel = 'text' | 'voice';
export type PersonaKey = 'professional' | 'laidback' | 'hustler';
export type VoiceName = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    role: Role;
    content: string;
    timestamp: number;
    display?: DisplayDirective;
}

// ─── API Contract ─────────────────────────────────────────────────────────────

export interface ChatRequest {
    message: string;
    sessionId: string;
    channel: Channel;
    persona?: PersonaKey;
}

export interface ChatResponse {
    reply: string;
    sessionId: string;
    display?: DisplayDirective;
    error?: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface SessionState {
    sessionId: string;
    history: ChatMessage[];
    channel: Channel;
    createdAt: number;
    lastActiveAt: number;
}

// ─── Hero Chat Config ─────────────────────────────────────────────────────────

export interface HeroChatConfig {
    chatEndpoint: string;
    ttsEndpoint: string;
    initialHeadline: string;
    seededAssistantMessage?: string;
}

// ─── Display Directives (from blueprint §9) ──────────────────────────────────

export interface ParsedFormField {
    name: string;
    type: 'text' | 'select' | 'number' | 'email' | 'date';
    label?: string;
    options?: string[]; // for select
    min?: number;       // for number
    max?: number;       // for number
    required?: boolean;
}

export interface ParsedFormDirective {
    id: string;
    title?: string;
    fields: ParsedFormField[];
}

export interface DisplayDirective {
    heroTextMode: 'typewriter' | 'fade';
    backgroundScene?: {
        time: 'day' | 'night';
        setting: 'indoor' | 'outdoor';
        region: string;
    };
    media?: MediaItem[];
    form?: ParsedFormDirective | null;
    thoughtsStream?: string[];
}

export interface MediaItem {
    type: 'image' | 'image_slideshow' | 'video';
    images?: string[];
    url?: string;
}

// ─── Pipeline Types ───────────────────────────────────────────────────────────

export interface PipelineInput {
    message: string;
    sessionId: string;
    userId: string;
    channel: Channel;
}

export interface PipelineOutput {
    reply: string;
    sessionId: string;
    display?: DisplayDirective;
}
