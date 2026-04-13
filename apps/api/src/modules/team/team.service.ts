import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { prisma } from '@wacrm/database';
import type { UserRole } from '@wacrm/database';
import * as bcrypt from 'bcryptjs';

export interface CreateMemberDto {
  email: string;
  firstName: string;
  lastName: string;
  /** Admin sets the password directly — no invite flow. */
  password: string;
  /** WhatsApp number in any format — auto-normalized to E.164 without '+'. */
  phoneNumber?: string;
  role?: UserRole;
  /** For AGENT role, the specific feature permissions to grant. Ignored for ADMIN/SUPER_ADMIN. */
  permissions?: string[];
}

@Injectable()
export class TeamService {
  async list(companyId: string) {
    return prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        avatarUrl: true,
        role: true,
        permissions: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(companyId: string, id: string) {
    const user = await prisma.user.findFirst({
      where: { id, companyId, isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            assignedConvs: { where: { status: { in: ['OPEN', 'HUMAN_HANDLING', 'WAITING_HUMAN'] } } },
            assignedTasks: { where: { status: { in: ['TODO', 'IN_PROGRESS'] } } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Team member not found');
    return user;
  }

  /**
   * Create a team member directly. The admin sets the email + password.
   * No invite email, no temp password — the admin communicates the
   * credentials to the team member out-of-band.
   */
  async createMember(companyId: string, dto: CreateMemberDto) {
    if (!dto.email?.trim()) throw new ConflictException('Email is required');
    if (!dto.password || dto.password.length < 6) {
      throw new ConflictException('Password must be at least 6 characters');
    }

    const existing = await prisma.user.findUnique({
      where: { companyId_email: { companyId, email: dto.email.trim().toLowerCase() } },
    });
    if (existing) throw new ConflictException('User already exists in this company');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const role = dto.role ?? 'AGENT';
    const permissions = (role === 'AGENT' || role === 'MANAGER') ? (dto.permissions ?? []) : [];

    // Normalize phone number: strip formatting, ensure E.164 without '+'
    let phone: string | undefined;
    if (dto.phoneNumber?.trim()) {
      phone = dto.phoneNumber.replace(/[\s\-\(\)\.+]/g, '');
      if (/^\d+$/.test(phone) && phone.length <= 10) phone = `91${phone}`;
      if (!/^\d{7,15}$/.test(phone)) phone = undefined;
    }

    const user = await prisma.user.create({
      data: {
        companyId,
        email: dto.email.trim().toLowerCase(),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        passwordHash,
        phoneNumber: phone,
        role,
        permissions,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    // Auto-add staff phone to all company WhatsApp account allowlists
    if (phone) {
      const accounts = await prisma.whatsAppAccount.findMany({
        where: { companyId },
        select: { id: true, allowedNumbers: true },
      });
      for (const acc of accounts) {
        if (!acc.allowedNumbers.includes(phone)) {
          await prisma.whatsAppAccount.update({
            where: { id: acc.id },
            data: { allowedNumbers: [...acc.allowedNumbers, phone] },
          });
        }
      }
    }

    return user;
  }

  async updateRole(companyId: string, targetUserId: string, role: UserRole, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }
    await this.get(companyId, targetUserId); // throws NotFoundException if not found
    return prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, permissions: true },
    });
  }

  async updatePermissions(companyId: string, targetUserId: string, permissions: string[], requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot change your own permissions');
    }
    const user = await this.get(companyId, targetUserId);
    // Only AGENT and MANAGER roles can have custom permissions. ADMIN/SUPER_ADMIN bypass permission checks entirely.
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot set permissions on admin users');
    }
    return prisma.user.update({
      where: { id: targetUserId },
      data: { permissions },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, permissions: true },
    });
  }

  async deactivate(companyId: string, targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot deactivate yourself');
    }
    await this.get(companyId, targetUserId);
    return prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
      select: { id: true, email: true, isActive: true },
    });
  }

  async updateProfile(userId: string, dto: { firstName?: string; lastName?: string; avatarUrl?: string }) {
    return prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true, role: true },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new ForbiddenException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { success: true };
  }
}
