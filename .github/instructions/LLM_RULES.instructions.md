---
description: This file outlines the rules for selecting and using large language models (LLMs) in our projects, ensuring we leverage the best available technology while maintaining cost efficiency and architectural consistency.
applyTo: '**/*'
# applyTo: 'Describe when these instructions should be loaded' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---
# LLM Architecture & Model Nuance Rules
- **Anti-Defaulting Policy**: Never hardcode 'gpt-4o' or any specific model globally. 
- **Model Selection Protocol**: For every new AI-driven feature, perform a web search for "Current SOTA LLM Benchmarks [Current Month] [Current Year]". 
- **Task-Based Routing**: Use the following logic for model selection:
    * **Complex Software Engineering/Refactoring**: Default to Claude 4.5 Sonnet (Current Leader in SWE-bench).
    * **Deep Reasoning/Math/Logic**: Default to GPT-5.2 or DeepSeek-R1 series.
    * **High-Volume/Low-Latency/UI-Chat**: Default to Gemini 3.1 Flash or GPT-5 mini.
    * **Large Context Analysis (>200k tokens)**: Default to Gemini 2.5 Pro or Llama 4 Scout (10M window).
- **Centralization**: ALWAYS implement a single `LLMProvider` or `AIGateway` utility. Do not allow unique API connections to be scattered throughout the app. 
- **Cost Awareness**: If a task is trivial (classification, formatting), use a 'Flash' or 'Mini' model to preserve token budget.