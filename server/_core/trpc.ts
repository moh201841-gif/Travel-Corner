import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError, z } from "zod";
import type { TrpcContext } from "./context";

/**
 * Attach the input-validation detail to BAD_REQUEST responses.
 *
 * Without this, a rejected input arrives at the browser as the opaque default message
 * ("Input validation failed" plus a JSON blob the client has no contract for), so the admin
 * dashboard could only show one generic sentence for every rejection. An operator who typed a price
 * as "6,500" or a two-character slug was told the record "could not be saved" and had no way to
 * learn which field was wrong.
 *
 * Only the field paths and zod's own messages are exposed. These come from the schema, not from the
 * database or the environment, so there is nothing here to disclose: it is the same information the
 * form itself encodes. Non-validation errors are untouched, and in particular a thrown server
 * message is still shown by the dashboard only when it is one of the known operator-safe strings.
 */
const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    if (error.code !== "BAD_REQUEST" || !(cause instanceof ZodError)) return shape;
    const flattened = z.flattenError(cause);
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: {
          formErrors: flattened.formErrors,
          fieldErrors: flattened.fieldErrors,
        },
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
