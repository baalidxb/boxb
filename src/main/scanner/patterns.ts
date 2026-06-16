import type { ScanSeverity } from '@shared/types';

// Phase 9.6: secret detection patterns. Pure data + precompiled regexes —
// no Node/Electron imports here so this module is safe to bundle into the
// standalone scanner CLI as well as the main process.
//
// Every regex carries the global ('g') flag because the engine scans each
// line with String.prototype.matchAll, which requires it. Patterns are
// instantiated once at module load (not per file) so repeated scans don't
// re-pay compilation cost.

export interface SecretPattern {
  id: string;
  name: string;
  description: string;
  regex: RegExp;
  severity: ScanSeverity;
}

export const PATTERNS: SecretPattern[] = [
  {
    id: 'aws-access-key',
    name: 'AWS Access Key ID',
    description: 'Amazon Web Services access key identifier (AKIA…).',
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: 'high'
  },
  {
    id: 'aws-secret-access-key',
    name: 'AWS Secret Access Key',
    description: 'A 40-character base64-style AWS secret access key.',
    // Bounded by non-base64 chars so we don't match the tail of a longer
    // token. Heuristic — flagged medium because bare 40-char strings recur.
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    severity: 'medium'
  },
  {
    id: 'stripe-live-key',
    name: 'Stripe Live Secret Key',
    description: 'Stripe live-mode secret key (sk_live_…).',
    regex: /sk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'high'
  },
  {
    id: 'stripe-test-key',
    name: 'Stripe Test Secret Key',
    description: 'Stripe test-mode secret key (sk_test_…).',
    regex: /sk_test_[a-zA-Z0-9]{24,}/g,
    severity: 'medium'
  },
  {
    id: 'github-pat',
    name: 'GitHub Personal Access Token',
    description: 'GitHub fine-grained/classic personal access token (ghp_…).',
    regex: /ghp_[a-zA-Z0-9]{36}/g,
    severity: 'high'
  },
  {
    id: 'github-oauth',
    name: 'GitHub OAuth Token',
    description: 'GitHub OAuth access token (gho_…).',
    regex: /gho_[a-zA-Z0-9]{36}/g,
    severity: 'high'
  },
  {
    id: 'gitlab-pat',
    name: 'GitLab Personal Access Token',
    description: 'GitLab personal access token (glpat-…).',
    regex: /glpat-[a-zA-Z0-9_-]{20}/g,
    severity: 'high'
  },
  {
    id: 'anthropic-api-key',
    name: 'Anthropic API Key',
    description: 'Anthropic API key (sk-ant-…). Checked before the generic '
      + 'OpenAI pattern since it is more specific.',
    regex: /sk-ant-[a-zA-Z0-9-]{90,}/g,
    severity: 'high'
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    description: 'OpenAI-style secret key (sk-… followed by 32+ chars).',
    regex: /sk-[a-zA-Z0-9]{32,}/g,
    severity: 'high'
  },
  {
    id: 'slack-bot-token',
    name: 'Slack Bot Token',
    description: 'Slack bot user OAuth token (xoxb-…).',
    regex: /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g,
    severity: 'high'
  },
  {
    id: 'slack-user-token',
    name: 'Slack User Token',
    description: 'Slack user OAuth token (xoxp-…).',
    regex: /xoxp-[0-9]+-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g,
    severity: 'high'
  },
  {
    id: 'jwt',
    name: 'JSON Web Token',
    description: 'A three-part base64url JWT (header.payload.signature).',
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g,
    severity: 'medium'
  },
  {
    id: 'google-api-key',
    name: 'Google API Key',
    description: 'Google API key (AIza…).',
    regex: /AIza[a-zA-Z0-9_-]{35}/g,
    severity: 'high'
  },
  {
    id: 'private-key-header',
    name: 'Private Key',
    description: 'PEM private key header (-----BEGIN … PRIVATE KEY-----).',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    severity: 'high'
  },
  {
    id: 'generic-hex',
    name: 'Generic High-Entropy Hex',
    description: 'A 40+ character hexadecimal string — possible token/hash.',
    regex: /(?<![a-fA-F0-9])[a-fA-F0-9]{40,}(?![a-fA-F0-9])/g,
    severity: 'medium'
  },
  {
    id: 'generic-base64',
    name: 'Generic High-Entropy Base64',
    description: 'A 32+ character base64 string — possible encoded secret.',
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{32,}(?![A-Za-z0-9/+=])/g,
    severity: 'medium'
  }
];
