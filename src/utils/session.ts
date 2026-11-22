/**
 * جلسة المستخدم المخزنة محلياً بعد تسجيل الدخول.
 * مصدر واحد يقرأه الشريط العلوي والترحيب في لوحة التحكم، بدل
 * نسخ نفس منطق التحليل في أكثر من مكوّن.
 */
export interface SessionUser {
  id?: string;
  username?: string;
  fullName?: string;
}

export function readSessionUser(): SessionUser | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('kayan_user') : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      username: typeof parsed.username === 'string' ? parsed.username : undefined,
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : undefined,
    };
  } catch {
    return null;
  }
}
