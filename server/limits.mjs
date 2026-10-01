// The Claude plan's usage limit as the CLI reports it, e.g. "You've hit your
// session limit · resets 10pm (UTC)" or "Claude AI usage limit reached|…".
// The CLI can hand that back as an ordinary reply, so it is checked by text;
// only short replies count, since a real answer may well talk about limits.
const LIMIT = /(hit|reached) your .{0,30}limit|usage limit reached|session limit|\blimit reached\b/i;

export const isUsageLimit = (text) => typeof text === 'string' && text.length < 300 && LIMIT.test(text);
export const limitError = (text) => Object.assign(new Error(String(text).trim()), { status: 429 });
