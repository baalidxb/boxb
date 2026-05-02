import type { CatalogApp } from '@shared/catalog';

// Phase 3.5 (deferred): Microsoft Teams (UA gating), Signal (no real web app),
// Instagram & Facebook (anti-embedded-browser detection), Outlook (Microsoft
// anti-bot on consumer outlook.live.com).

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const catalog: CatalogApp[] = [
  {
    id: 'whatsapp-web',
    name: 'WhatsApp Web',
    url: 'https://web.whatsapp.com',
    iconUrl: './icons/whatsapp-web.svg',
    category: 'messaging',
    hibernation: 'light',
    userAgent: CHROME_UA
  },
  {
    id: 'whatsapp-business',
    name: 'WhatsApp Business',
    url: 'https://web.whatsapp.com',
    iconUrl: './icons/whatsapp-business.svg',
    category: 'messaging',
    hibernation: 'light',
    userAgent: CHROME_UA
  },
  {
    id: 'telegram-web',
    name: 'Telegram Web',
    url: 'https://web.telegram.org/k/',
    iconUrl: './icons/telegram-web.svg',
    category: 'messaging',
    hibernation: 'light'
  },
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.messenger.com',
    iconUrl: './icons/messenger.svg',
    category: 'messaging',
    hibernation: 'light',
    userAgent: CHROME_UA
  },
  {
    id: 'gmail',
    name: 'Gmail',
    url: 'https://mail.google.com',
    iconUrl: './icons/gmail.svg',
    category: 'email',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    url: 'https://docs.google.com',
    iconUrl: './icons/google-docs.svg',
    category: 'productivity',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    url: 'https://sheets.google.com',
    iconUrl: './icons/google-sheets.svg',
    category: 'productivity',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    url: 'https://drive.google.com',
    iconUrl: './icons/google-drive.svg',
    category: 'productivity',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'notion',
    name: 'Notion',
    url: 'https://www.notion.so',
    iconUrl: './icons/notion.svg',
    category: 'productivity',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'trello',
    name: 'Trello',
    url: 'https://trello.com',
    iconUrl: './icons/trello.svg',
    category: 'productivity',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'google-keep',
    name: 'Google Keep',
    url: 'https://keep.google.com',
    iconUrl: './icons/google-keep.svg',
    category: 'productivity',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://app.slack.com/client',
    iconUrl: './icons/slack.svg',
    category: 'work',
    hibernation: 'light',
    userAgent: CHROME_UA
  },
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.com/app',
    iconUrl: './icons/discord.svg',
    category: 'work',
    hibernation: 'light',
    userAgent: CHROME_UA
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    iconUrl: './icons/chatgpt.svg',
    category: 'ai',
    hibernation: 'aggressive'
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    iconUrl: './icons/claude.svg',
    category: 'ai',
    hibernation: 'aggressive'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    iconUrl: './icons/gemini.svg',
    category: 'ai',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    iconUrl: './icons/perplexity.svg',
    category: 'ai',
    hibernation: 'aggressive'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com/',
    iconUrl: './icons/instagram.svg',
    category: 'social',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'facebook',
    name: 'Facebook',
    url: 'https://www.facebook.com/',
    iconUrl: './icons/facebook.svg',
    category: 'social',
    hibernation: 'aggressive',
    userAgent: CHROME_UA
  },
  {
    id: 'outlook',
    name: 'Outlook',
    url: 'https://outlook.live.com/owa/',
    iconUrl: './icons/outlook.svg',
    category: 'email',
    hibernation: 'light',
    userAgent: CHROME_UA
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com/',
    iconUrl: './icons/github.svg',
    category: 'developer',
    hibernation: 'aggressive'
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    url: 'https://gitlab.com/',
    iconUrl: './icons/gitlab.svg',
    category: 'developer',
    hibernation: 'aggressive'
  },
  {
    id: 'linear',
    name: 'Linear',
    url: 'https://linear.app/',
    iconUrl: './icons/linear.svg',
    category: 'developer',
    hibernation: 'aggressive'
  },
  {
    id: 'jira',
    name: 'Jira',
    // Template URL — the user must replace YOUR-COMPANY with their Atlassian
    // subdomain before save. AddAppModal enforces this via templatePlaceholder.
    url: 'https://YOUR-COMPANY.atlassian.net/',
    iconUrl: './icons/jira.svg',
    category: 'developer',
    hibernation: 'aggressive',
    isTemplate: true,
    templatePlaceholder: 'YOUR-COMPANY'
  },
  {
    id: 'vercel',
    name: 'Vercel',
    url: 'https://vercel.com/dashboard',
    iconUrl: './icons/vercel.svg',
    category: 'developer',
    hibernation: 'aggressive'
  },
  {
    id: 'netlify',
    name: 'Netlify',
    url: 'https://app.netlify.com/',
    iconUrl: './icons/netlify.svg',
    category: 'developer',
    hibernation: 'aggressive'
  },
  {
    id: 'circleci',
    name: 'CircleCI',
    url: 'https://app.circleci.com/',
    iconUrl: './icons/circleci.svg',
    category: 'developer',
    hibernation: 'aggressive'
  },
  {
    id: 'jenkins',
    name: 'Jenkins',
    // Template — user replaces YOUR-JENKINS with their self-hosted hostname.
    // Reuses the Phase 8 template flow (same code path as Jira).
    url: 'https://YOUR-JENKINS.example.com/',
    iconUrl: './icons/jenkins.svg',
    category: 'developer',
    hibernation: 'aggressive',
    isTemplate: true,
    templatePlaceholder: 'YOUR-JENKINS'
  }
];
