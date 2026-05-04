'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Search,
  Users,
  UserCog,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface User {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  assignedAdmin: { id: string; name: string } | null
  _count: { createdCertificates: number; reviewedCertificates: number }
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const roleIcons: Record<string, typeof Users> = {
  ENGINEER: Users,
  ADMIN: UserCog,
}

export function UserListClient() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [activeFilter, setActiveFilter] = useState('true')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (roleFilter !== 'ALL') params.set('role', roleFilter)
      params.set('isActive', activeFilter)
      params.set('page', page.toString())
      params.set('limit', rowsPerPage.toString())

      const res = await apiFetch(`/api/admin/users?${params}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }, [search, roleFilter, activeFilter, page, rowsPerPage])

  useEffect(() => {
    fetchUsers()
  }, [roleFilter, activeFilter, page, rowsPerPage, fetchUsers])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchUsers()
    }, 300)
    return () => clearTimeout(timer)
  }, [search, fetchUsers])

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <Users className="size-[22px] text-[#94a3b8]" />
              Staff Users
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Manage engineers and admin accounts
            </p>
          </div>
          <Link
            href="/admin/users/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors"
          >
            <Plus className="size-3.5" />
            Create User
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="block px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              >
                <option value="ALL">All Roles</option>
                <option value="ENGINEER">Engineer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</label>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                className="block px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
                <option value="ALL">All</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16">
              <Users className="size-10 mx-auto mb-3 text-[#e2e8f0]" />
              <p className="text-[13px] text-[#94a3b8]">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Name</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Email</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Role</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Assigned Admin</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Created</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Reviewed</th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const RoleIcon = roleIcons[user.role] || Users
                    return (
                      <tr
                        key={user.id}
                        className="border-b border-[#f1f5f9] cursor-pointer hover:bg-[#f8fafc] transition-colors"
                        onClick={() => router.push(`/admin/users/${user.id}/edit`)}
                      >
                        <td className="py-2.5 px-4 font-medium text-[#0f172a]">{user.name}</td>
                        <td className="py-2.5 px-4 text-[#64748b]">{user.email}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold',
                              user.role === 'ADMIN'
                                ? 'bg-[#fff7ed] text-[#c2410c]'
                                : 'bg-[#eff6ff] text-[#1d4ed8]'
                            )}
                          >
                            <RoleIcon className="size-3" />
                            {user.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {user.assignedAdmin?.name || <span className="text-[#cbd5e1]">—</span>}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[#64748b]">
                          {user._count.createdCertificates}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[#64748b]">
                          {user._count.reviewedCertificates}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                              user.isActive
                                ? 'bg-[#f0fdf4] text-[#16a34a]'
                                : 'bg-[#f1f5f9] text-[#94a3b8]'
                            )}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#f1f5f9]">
              <p className="text-[12.5px] text-[#94a3b8]">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-[#94a3b8]">Rows</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1) }}
                    className="h-7 px-1.5 border border-[#e2e8f0] rounded-[7px] text-[12.5px] text-[#0f172a] bg-white outline-none"
                  >
                    {[10, 15, 25].map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-3 flex gap-4 text-[11px] text-[#94a3b8]">
          <span className="ml-auto">Click row to edit user</span>
        </div>
      </div>
    </div>
  )
}
