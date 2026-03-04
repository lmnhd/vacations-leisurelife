/**
 * SDK MODULE SHIMS — Template-only stubs
 * ──────────────────────────────────────
 * These bare declarations let VS Code resolve the provider SDK imports without
 * the packages being installed. Everything resolves as `any`, which is fine for
 * a template directory.
 *
 * When `lib/` is copied into a real project and the packages are installed via
 * `npm install`, the real type definitions take over automatically — these stubs
 * are NOT part of `lib/` so they are never copied to the target project.
 *
 * Do NOT move this file into lib/ or scripts/.
 */

declare module 'openai';
declare module 'openai/resources/chat/completions';
declare module '@anthropic-ai/sdk';
declare module '@google/generative-ai';
declare module 'groq-sdk';
