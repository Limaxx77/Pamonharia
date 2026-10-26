import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';

export const parseBody = <T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> => schema.parse(req.body);
export const parseQuery = <T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> => schema.parse(req.query);

export const idParam = (req: Request, name = 'id') => {
  const v = req.params[name];
  if (typeof v !== 'string' || v.length === 0 || v.length > 64) throw new z.ZodError([
    { code: 'custom', path: [name], message: 'Parâmetro inválido' },
  ]);
  return v;
};

export const clientIp = (req: Request) => req.ip ?? null;
