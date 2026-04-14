'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { Users, UserPlus, Trash2, Crown, Shield, User, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from '@wacrm/shared';

interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role: string;
  permissions: string[];
  avatarUrl?: string;
  lastLoginAt?: string;
  createdAt: string;
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  SUPER_ADMIN: Crown,
  ADMIN: Shield,
  MANAGER: Shield,
  AGENT: User,
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-gray-100 text-gray-900',
  ADMIN: 'bg-gray-100 text-gray-900',
  MANAGER: 'bg-orange-100 text-orange-700',
  AGENT: 'bg-gray-100 text-gray-600',
};

const ROLES = ['AGENT', 'MANAGER', 'ADMIN'];

export default function TeamSettingsPage() {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState('AGENT');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<Permission>>(new Set());
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const res = await api.get<{ data: TeamMember[] }>('/team');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/team/members', {
        email,
        password,
        firstName,
        lastName,
        ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
        role,
        permissions: role === 'AGENT' ? Array.from(selectedPermissions) : [],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Member created');
      setShowForm(false);
      resetForm();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : null;
      toast.error(msg ?? 'Failed to create member');
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: (data: { id: string; permissions: string[] }) =>
      api.patch(`/team/${data.id}/permissions`, { permissions: data.permissions }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Permissions updated');
      setEditingMember(null);
    },
    onError: () => toast.error('Failed to update permissions'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/team/${id}/role`, { role }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Failed to update role'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/team/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setPhoneNumber('');
    setRole('AGENT');
    setSelectedPermissions(new Set());
  };

  const togglePermission = (perm: Permission) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPermissions(new Set(Object.keys(PERMISSION_LABELS) as Permission[]));
  };

  const selectNone = () => {
    setSelectedPermissions(new Set());
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-gray-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Team</h1>
            <p className="text-sm text-gray-500">
              Manage team members and their permissions
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <UserPlus size={14} />
          Add Member
        </button>
      </div>

      {/* Create Member Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="font-semibold text-gray-900 mb-4">
            Create Team Member
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-sm font-medium text-gray-700">
                First Name
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Last Name
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-sm font-medium text-gray-700">
              Email (login username)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="team@example.com"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
          <div className="mb-3">
            <label className="text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
          <div className="mb-3">
            <label className="text-sm font-medium text-gray-700">
              WhatsApp Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+91 98765 43210"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Used for WhatsApp AI access. Auto-added to allowed numbers on all connected accounts.
            </p>
          </div>
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r === 'AGENT' ? 'Staff' : r}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              {role === 'AGENT'
                ? 'Staff members only have access to the features you grant below.'
                : 'Admins have full access to all features.'}
            </p>
          </div>

          {/* Permission Matrix for Staff */}
          {role === 'AGENT' && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">
                  Feature Access
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-gray-700 hover:text-gray-900"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                      {group.label}
                    </p>
                    {group.permissions.map((perm) => (
                      <label
                        key={perm}
                        className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-white px-2 py-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPermissions.has(perm as Permission)}
                          onChange={() => togglePermission(perm as Permission)}
                          className="rounded border-gray-300 text-gray-900 focus:ring-gray-800"
                        />
                        {PERMISSION_LABELS[perm as Permission]}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={
                !email ||
                !firstName ||
                !password ||
                password.length < 6 ||
                createMutation.isPending
              }
              className="bg-gray-900 hover:bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Member'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Team Members List */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          members.map((member) => {
            const _RoleIcon = ROLE_ICONS[member.role] ?? User;
            const isStaff = member.role === 'AGENT';
            return (
              <div key={member.id} className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-gray-800 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {member.firstName[0]}
                    {member.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                    {member.phoneNumber && (
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <Phone size={9} />
                        +{member.phoneNumber}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'text-xs px-2 py-1 rounded-full font-medium',
                        ROLE_COLORS[member.role] ?? 'bg-gray-100',
                      )}
                    >
                      <_RoleIcon size={10} className="inline mr-1" />
                      {member.role === 'AGENT' ? 'Staff' : member.role}
                    </div>
                    <select
                      value={member.role}
                      onChange={(e) =>
                        updateRoleMutation.mutate({
                          id: member.id,
                          role: e.target.value,
                        })
                      }
                      className="text-xs border border-gray-200 rounded-md px-2 py-1"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r === 'AGENT' ? 'Staff' : r}
                        </option>
                      ))}
                    </select>
                    {isStaff && (
                      <button
                        onClick={() => setEditingMember(member)}
                        className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1"
                      >
                        Permissions
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${member.firstName}?`))
                          deactivateMutation.mutate(member.id);
                      }}
                      className="text-gray-300 hover:text-red-500 transition p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Show permission count for staff */}
                {isStaff && (
                  <div className="mt-2 ml-14 text-xs text-gray-500">
                    {member.permissions?.length ?? 0} features accessible
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit Permissions Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Edit Permissions — {editingMember.firstName} {editingMember.lastName}
              </h3>
              <button
                onClick={() => setEditingMember(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  Select the features this staff member can access:
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const allPerms = Object.keys(PERMISSION_LABELS) as Permission[];
                      setEditingMember({ ...editingMember, permissions: allPerms });
                    }}
                    className="text-xs text-gray-700 hover:text-gray-900"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setEditingMember({ ...editingMember, permissions: [] })}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">
                      {group.label}
                    </p>
                    {group.permissions.map((perm) => (
                      <label
                        key={perm}
                        className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={(editingMember.permissions ?? []).includes(perm)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...(editingMember.permissions ?? []), perm]
                              : (editingMember.permissions ?? []).filter((p) => p !== perm);
                            setEditingMember({ ...editingMember, permissions: updated });
                          }}
                          className="rounded border-gray-300 text-gray-900 focus:ring-gray-800"
                        />
                        {PERMISSION_LABELS[perm as Permission]}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setEditingMember(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  updatePermissionsMutation.mutate({
                    id: editingMember.id,
                    permissions: editingMember.permissions ?? [],
                  })
                }
                disabled={updatePermissionsMutation.isPending}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {updatePermissionsMutation.isPending ? 'Saving…' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
