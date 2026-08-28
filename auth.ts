import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().optional(), passkeyToken: z.string().optional() });

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  jwt: { maxAge: 12 * 60 * 60 },
  pages: {
    signIn: "/cuenta"
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        passkeyToken: {}
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user) return null;
        if (parsed.data.passkeyToken) {
          const consumed = await prisma.$transaction(async (tx) => {
            const result = await tx.verificationToken.deleteMany({ where: { identifier: `passkey-login:${user.id}`, token: parsed.data.passkeyToken, expires: { gt: new Date() } } });
            return result.count === 1;
          });
          if (!consumed) return null;
        } else {
          if (!user.passwordHash || !parsed.data.password || parsed.data.password.length < 8) return null;
          const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
          if (!valid) return null;
        }
        const pendingEmailVerification = !user.emailVerified && await prisma.verificationToken.findFirst({
          where: {
            identifier: `email:${user.email.toLowerCase()}`,
            expires: { gt: new Date() }
          },
          select: { token: true }
        });
        if (user.role === "CUSTOMER" && pendingEmailVerification) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role as string;
      }
      return session;
    }
  }
});
