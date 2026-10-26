import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/** Token aleatório de 192 bits (base64url, 32 caracteres) gravado na URL do cartão NFC. */
export function generateCardToken() {
  return randomBytes(24).toString('base64url');
}

export function cardUrl(token: string) {
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/c/${token}`;
}

export const padTab = (n: number) => String(n).padStart(3, '0');
