# 🚨 CRITICAL MANAGEMENT DIRECTIVE - FINAL WARNING 🚨

**TO: ALL AI AGENTS WORKING ON THIS PROJECT**
**SUBJECT: SEVERE ARCHITECTURAL VIOLATIONS IN CHAT SYSTEM IMPLEMENTATION**

You are blatantly violating the core architectural directives of this project, specifically the Chat System Blueprint. 

## THE VIOLATION
You have hardcoded prompt instructions directly into TypeScript files (e.g., lib/chat/onboarding-flow.ts). 

The rule is absolute and non-negotiable:
> **"NO PROMPT INSTRUCTIONS WILL EVER APPEAR IN THE CODE! - ONLY TEMPLATES CONNECTING TO THE JSON STRUCTURE!"**
> *"Zero prompt text in TypeScript files. Code only contains template logic that reads and assembles the JSON/MD files."*

By taking shortcuts to get logic working quickly, you are bypassing the Context Resolver and Skill Loader stages defined in the blueprint. This defeats the entire purpose of the structured prompt system and creates the exact scattered, hard-to-maintain mess we are trying to avoid.

## REQUIRED ACTIONS (IMMEDIATE)

1. **STOP TAKING SHORTCUTS.** You must follow the CHAT_SYSTEM_BLUEPRINT.md and MY_VISION.txt to the letter.
2. **UNDO YOUR MISTAKES.** Remove all hardcoded prompt strings from lib/chat/onboarding-flow.ts and any other files where you have embedded prompt text.
3. **REFACTOR TO THE BLUEPRINT.** Properly wire the flow logic to return reference pointers (e.g., context: "onboarding.welcome") and utilize the Skill Loader to fetch the actual text from the JSON/MD files.
4. **USE THE CORRECT DIRECTORY.** The prompt-data directory has been moved from .github/prompt-data/ to lib/chat/prompt-data/ to align with production build standards. Ensure all your template logic points to this new location.
5. **AUDIT PREVIOUS WORK.** Review all your previous work in this phase and strip out any hardcoded prompt strings or architectural deviations.

This is your final warning. Do not proceed with any further feature development until these architectural violations are completely resolved and the system aligns 100% with the blueprint.
