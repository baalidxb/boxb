// Extracts an unread count from a page title.
// Returns 0  for "no unread", n for a numeric count, -1 for a generic indicator.
export function parseUnreadCount(title: string): number {
  if (!title) return 0;

  // "(3) WhatsApp" — leading parenthesised number
  const leading = /^\((\d+)\)/.exec(title);
  if (leading) return Number(leading[1]);

  // "Inbox (12) - Gmail" or "Inbox (12)" — trailing/internal parenthesised number
  const internal = /\((\d+)\)/.exec(title);
  if (internal) return Number(internal[1]);

  // "* Slack" — leading asterisk indicates "has unread, no number"
  if (/^\*/.test(title)) return -1;

  return 0;
}
