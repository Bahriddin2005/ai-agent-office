// Tiny DOM helpers shared by the HUD and the results view.

export type Kid = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v as Record<string, string>)) el.style.setProperty(sk.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), sv);
    else if (k === 'className') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else if (k === 'checked' || k === 'selected' || k === 'open' || k === 'hidden' || k === 'disabled') (el as unknown as Record<string, boolean>)[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

export const compact = (xs: Kid[]) => xs.filter((x): x is Node | string => !!x);

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
