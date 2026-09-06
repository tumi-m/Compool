/**
 * Open-source surface.
 *
 * Three different things get called "open source support", and conflating them is
 * how you end up with a connect screen nobody understands:
 *
 *   runtime  — open-weight models on hardware you own. Class B capacity. You add
 *              it as a source and it serves work.
 *   gateway  — a metered OpenAI-compatible endpoint. Class A capacity. You add it
 *              as a source, with a key, and it serves work.
 *   client   — an open-source coding agent that *consumes* capacity. It does not
 *              add anything to the pool; you point it at TIDEPOOL's own endpoint
 *              and it routes across everything you already have.
 *
 * Endpoint URLs are only recorded here when they were read from a primary source
 * during this build. Everything else carries `baseUrl: null` and the connect flow
 * asks for it instead of presenting a guess. Rule 1: no endpoints from memory.
 */

export type IntegrationRole = 'runtime' | 'gateway' | 'client';

export interface Integration {
  id: string;
  name: string;
  role: IntegrationRole;
  /** Class B for runtimes, A for gateways. Clients hold no capacity at all. */
  cls: 'A' | 'B' | null;
  /** Populated only from a verified primary source. Null means "ask the user". */
  baseUrl: string | null;
  /** Whether it speaks the OpenAI /v1/chat/completions shape. */
  openaiCompatible: boolean;
  blurb: string;
  /** What still needs checking before this is production-wired. */
  verification: string;
  homepage: string;
  license: string;
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    role: 'runtime',
    cls: 'B',
    baseUrl: 'http://127.0.0.1:11434',
    openaiCompatible: true,
    blurb: 'Open-weight models on your own machine. The node finds a running server on the loopback address and advertises whatever is loaded.',
    verification: 'Loopback default only — the node discovers the real address on the device, so nothing here is guessed.',
    homepage: 'https://github.com/ollama/ollama',
    license: 'MIT',
  },
  {
    id: 'vllm',
    name: 'vLLM',
    role: 'runtime',
    cls: 'B',
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'High-throughput serving for a GPU box you own or rent. Register the host and it becomes pooled capacity, priced by the operator.',
    verification: 'Base URL is per-deployment. Paste yours when you connect it.',
    homepage: 'https://github.com/vllm-project/vllm',
    license: 'Apache-2.0',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp',
    role: 'runtime',
    cls: 'B',
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'The small-hardware end of owned compute. Good enough for digests and cache warms overnight, which is most of what preload does.',
    verification: 'Server host and port are per-deployment. Paste yours when you connect it.',
    homepage: 'https://github.com/ggml-org/llama.cpp',
    license: 'MIT',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    role: 'runtime',
    cls: 'B',
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'A desktop runtime the node can talk to without any extra setup on your part.',
    verification: 'Local server address is set inside the app. Paste yours when you connect it.',
    homepage: 'https://lmstudio.ai',
    license: 'Proprietary app, open-weight models',
  },
  {
    id: 'tgi',
    name: 'Text Generation Inference',
    role: 'runtime',
    cls: 'B',
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'Hugging Face’s serving stack, for a rented GPU that would otherwise idle between jobs.',
    verification: 'Endpoint is per-deployment. Paste yours when you connect it.',
    homepage: 'https://github.com/huggingface/text-generation-inference',
    license: 'Apache-2.0',
  },
  {
    id: 'opencode-zen',
    name: 'OpenCode Zen',
    role: 'gateway',
    cls: 'A',
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'The model gateway from the OpenCode project. Metered, so it pools across people like any other Class A key.',
    verification: 'Endpoint and auth header could not be read from a primary source in this build environment (egress blocked). Paste the base URL from the project’s own docs when you connect it, and record it in policy/providers/opencode-zen.policy.json.',
    homepage: 'https://opencode.ai',
    license: 'Open-source client, hosted gateway',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    role: 'gateway',
    cls: 'A',
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'An aggregator you can add as one more basin. TIDEPOOL is not competing with it — routing is commodity; the ledger is the point.',
    verification: 'Base URL not verified in this build environment. Paste it from the provider’s docs when you connect it.',
    homepage: 'https://openrouter.ai',
    license: 'Proprietary service',
  },
  {
    id: 'cline',
    name: 'Cline',
    role: 'client',
    cls: null,
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'Open-source coding agent in VS Code. Point it at TIDEPOOL as an OpenAI-compatible provider and every request it makes gets routed, metered and attributed like any other run.',
    verification: 'Configured in the extension’s own provider settings. TIDEPOOL supplies the base URL and key; nothing about Cline’s config schema is assumed here.',
    homepage: 'https://github.com/cline/cline',
    license: 'Apache-2.0',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    role: 'client',
    cls: null,
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'Open-source terminal coding agent. Add TIDEPOOL as a custom provider and your overnight preload queue and your interactive session draw on the same basins.',
    verification: 'Configured in the agent’s own config file. TIDEPOOL supplies the base URL and key.',
    homepage: 'https://github.com/sst/opencode',
    license: 'MIT',
  },
  {
    id: 'continue',
    name: 'Continue',
    role: 'client',
    cls: null,
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'Open-source IDE assistant. Same story: one base URL, one key, and the ledger sees everything it spends.',
    verification: 'Configured in the extension’s own config. TIDEPOOL supplies the base URL and key.',
    homepage: 'https://github.com/continuedev/continue',
    license: 'Apache-2.0',
  },
  {
    id: 'aider',
    name: 'Aider',
    role: 'client',
    cls: null,
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'Open-source pair programming in the terminal. Useful as the thing your 3am preload queue hands finished context to.',
    verification: 'Configured through its OpenAI-compatible provider settings. TIDEPOOL supplies the base URL and key.',
    homepage: 'https://github.com/Aider-AI/aider',
    license: 'Apache-2.0',
  },
  {
    id: 'goose',
    name: 'Goose',
    role: 'client',
    cls: null,
    baseUrl: null,
    openaiCompatible: true,
    blurb: 'Open-source on-machine agent. Runs long; benefits most from not stalling halfway.',
    verification: 'Configured through its OpenAI-compatible provider settings. TIDEPOOL supplies the base URL and key.',
    homepage: 'https://github.com/block/goose',
    license: 'Apache-2.0',
  },
];

export const ROLE_COPY: Record<IntegrationRole, { title: string; sub: string }> = {
  runtime: {
    title: 'Runtimes — capacity you own',
    sub: 'Open-weight models on your hardware. Class B: it pools across people freely, because it is a machine, not a licence.',
  },
  gateway: {
    title: 'Gateways — metered endpoints',
    sub: 'OpenAI-compatible services with a key. Class A: designed for third-party traffic, so a pool member contributing one is doing exactly what the key is for.',
  },
  client: {
    title: 'Clients — things that spend',
    sub: 'Open-source agents that consume capacity rather than supply it. Point them at TIDEPOOL and every request is routed, metered and attributed.',
  },
};

/** The only integration snippet that is safe to print: our own endpoint. */
export function clientSnippet(baseUrl: string): string {
  return [
    `Base URL   ${baseUrl}/v1`,
    `API key    tp_live_… (create one in Connect → Client keys)`,
    `Model      tidepool/auto        routes across every source you have`,
    `           tidepool/local-only  Class B only, never leaves your machines`,
    `           tidepool/cheapest    cost-weighted preset`,
  ].join('\n');
}
