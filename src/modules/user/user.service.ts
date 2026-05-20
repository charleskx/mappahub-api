import argon2 from 'argon2'
import type { users } from '../../db/schema'
import { AppError } from '../../shared/errors'

type User = typeof users.$inferSelect

function sanitizeUser(user: User) {
  const {
    passwordHash,
    totpSecret,
    emailVerifyToken,
    emailVerifyExpiresAt,
    resetPasswordToken,
    resetPasswordExpiresAt,
    ...safe
  } = user
  return safe
}
import { defineAbilityFor } from '../../shared/permissions'
import { generateToken } from '../../shared/utils'
import { authService } from '../auth/auth.service'
import { userRepository } from './user.repository'
import type { InviteUserInput, UpdateUserInput } from './user.schema'

export const userService = {
  async listUsers(tenantId: string) {
    return userRepository.findAll(tenantId)
  },

  async getUserById(id: string, tenantId: string) {
    const user = await userRepository.findById(id, tenantId)
    if (!user) throw new AppError('USER_NOT_FOUND', 404, 'Usuário não encontrado')
    return sanitizeUser(user)
  },

  async inviteUser(
    data: InviteUserInput,
    requester: { id: string; name: string; role: string; tenantId: string },
  ) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('create', 'User')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    const existing = await userRepository
      .findAll(requester.tenantId)
      .then(list => list.find(u => u.email === data.email))
    if (existing) throw new AppError('EMAIL_TAKEN', 409, 'E-mail já cadastrado neste tenant')

    const placeholderHash = await argon2.hash(generateToken(32))

    const user = await userRepository.create({
      tenantId: requester.tenantId,
      name: data.name,
      email: data.email,
      passwordHash: placeholderHash,
      role: data.role,
      emailVerified: false,
      invitedBy: requester.id,
      updatedAt: new Date(),
    })

    await authService.sendInvite(requester.name, user.id, requester.tenantId)

    return sanitizeUser(user)
  },

  async updateUser(
    id: string,
    data: UpdateUserInput,
    requester: { id: string; role: string; tenantId: string },
  ) {
    const ability = defineAbilityFor({ role: requester.role })
    const isSelf = id === requester.id

    // Employees can only update themselves, without changing role
    if (!ability.can('update', 'User') && !isSelf) {
      throw new AppError('FORBIDDEN', 403, 'Sem permissão')
    }

    // Only owner/super_admin can change roles
    if (data.role && requester.role !== 'owner' && requester.role !== 'super_admin') {
      throw new AppError('FORBIDDEN', 403, 'Sem permissão para alterar roles')
    }

    const target = await userRepository.findById(id, requester.tenantId)
    if (!target) throw new AppError('USER_NOT_FOUND', 404, 'Usuário não encontrado')

    // Owner cannot have their own role changed
    if (target.role === 'owner' && data.role && target.id !== requester.id) {
      throw new AppError('FORBIDDEN', 403, 'Não é possível alterar o role do owner')
    }

    const updated = await userRepository.update(id, requester.tenantId, data)
    if (!updated) throw new AppError('USER_NOT_FOUND', 404)
    return sanitizeUser(updated)
  },

  async deleteUser(id: string, requester: { id: string; role: string; tenantId: string }) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('delete', 'User')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    if (id === requester.id)
      throw new AppError('CANNOT_DELETE_SELF', 400, 'Não é possível excluir sua própria conta')

    const target = await userRepository.findById(id, requester.tenantId)
    if (!target) throw new AppError('USER_NOT_FOUND', 404, 'Usuário não encontrado')
    if (target.role === 'owner')
      throw new AppError('CANNOT_DELETE_OWNER', 400, 'Não é possível excluir o owner')

    await userRepository.softDelete(id, requester.tenantId)
  },
}
