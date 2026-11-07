// Chaves de API do Praeko: "praeko_<32 bytes em base64url>" (as emitidas antes da renomeação começam com "arauto_" e valem para sempre: o que identifica
// a chave é o hash da chave inteira, que não muda). Só o hash SHA-256 vai para o banco do servidor.
// Sem dependências de Node (WebCrypto): serve ao Worker e ao CLI.
const b64u = (u8: any) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const hex = (buf: any) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const PREFIXO_CHAVE = "praeko_";
/** Aceita os dois prefixos: `praeko_` (atual) e `arauto_` (chaves antigas). */
export const FORMATO_CHAVE = /^(?:praeko|arauto)_[A-Za-z0-9_-]{20,}$/;
export const gerarChave = () => PREFIXO_CHAVE + b64u(crypto.getRandomValues(new Uint8Array(32)));
export const hashChave = async (chave: any) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chave)));
export const prefixoChave = (chave: any) => chave.slice(0, 14);
export const idChave = () => "chv_" + hex(crypto.getRandomValues(new Uint8Array(8)));
