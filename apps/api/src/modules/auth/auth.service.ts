import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { prisma } from '@wacrm/database';
import type { User, UserRole } from '@wacrm/database';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: string;       // userId
  cid: string;       // companyId
  role: UserRole;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    companyId: string;
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  // ── Register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const slug = dto.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existing = await prisma.company.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('A company with this name already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const company = await prisma.company.create({
      data: {
        name: dto.companyName,
        slug,
        email: dto.email,
        setupDone: false,
        // Seed default AI + payment configs alongside company creation
        aiConfig: {
          create: { autoReplyEnabled: false },
        },
        paymentConfig: {
          create: {},
        },
      },
    });

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'ADMIN',
        isActive: true,
      },
    });

    return this.issueTokens(user);
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthTokens> {
    // Find user across all companies by email
    const user = await prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_SECRET + '_refresh',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    // Verify the stored hash matches (rotation: old token is invalidated after use)
    const tokenHash = this.hashToken(refreshToken);
    if (user.refreshTokenHash !== tokenHash) {
      throw new UnauthorizedException('Refresh token has been rotated or revoked');
    }

    return this.issueTokens(user);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  // ── Validate JWT payload (used by JwtStrategy) ─────────────────────────────

  async validatePayload(payload: JwtPayload): Promise<User> {
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return user;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      cid: user.companyId,
      role: user.role,
      email: user.email,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: (process.env.JWT_SECRET ?? '') + '_refresh',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    });

    // Store hash of refresh token (so only the latest is valid)
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashToken(refreshToken) },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
