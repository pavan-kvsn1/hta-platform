'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Search,
  Building2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle as _AlertCircle,
  Bell,
  Eye,
  Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CustomerAccount {
  id: string
  companyName: string
  contactEmail: string | null
  isActive: boolean
  assignedAdmin: { id: string; name: string } | null
  primaryPoc: { id: string; name: string; email: string; isActive: boolean } | null
  userCount: number
  pendingRequests: number
  certificateCount: number
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function CustomersPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<CustomerAccount[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('true')
  const [page, setPage] = useState(1)
  const [totalPendingRequests, setTotalPendingRequests] = useState(0)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('isActive', activeFilter)
      params.set('page', page.toString())
      params.set('limit', '15')

      const res = await fetch(`/api/admin/customers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts)
        setPagination(data.pagination)
        // Calculate total pending requests
        const totalPending = data.accounts.reduce(
          (sum: number, acc: CustomerAccount) => sum + (acc.pendingRequests || 0),
          0
        )
        setTotalPendingRequests(totalPending)
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setLoading(false)
    }
  }, [search, activeFilter, page])

  useEffect(() => {
    fetchAccounts()
  }, [activeFilter, page, fetchAccounts])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchAccounts()
    }, 300)
    return () => clearTimeout(timer)
  }, [search, fetchAccounts])

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          {/* Pending Requests Banner */}
          {totalPendingRequests > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-600" />
                <span className="text-amber-800 font-medium">
                  {totalPendingRequests} Pending Request{totalPendingRequests !== 1 ? 's' : ''}
                </span>
              </div>
              <Link href="/admin/customers/requests">
                <Button variant="outline" size="sm" className="text-amber-700 border-amber-300 hover:bg-amber-100">
                  View All
                </Button>
              </Link>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Customer Accounts</h1>
              <p className="text-slate-500 mt-1">
                Manage customer companies and their users
              </p>
            </div>
            <Link href="/admin/customers/new">
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Account
              </Button>
            </Link>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by company name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>No customer accounts found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Primary POC</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => router.push(`/admin/customers/${account.id}`)}
                    >
                      <TableCell>
                        <span className="font-medium">{account.companyName}</span>
                      </TableCell>
                      <TableCell>
                        {account.primaryPoc ? (
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="flex items-center gap-1">
                                <Crown className="h-3 w-3 text-amber-500" />
                                <span className="text-sm font-medium">{account.primaryPoc.name}</span>
                              </div>
                              <span className="text-xs text-slate-500">{account.primaryPoc.email}</span>
                            </div>
                            {!account.primaryPoc.isActive && (
                              <Badge className="bg-amber-100 text-amber-700 text-xs">
                                Pending
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>{account.userCount}</TableCell>
                      <TableCell>
                        {account.pendingRequests > 0 ? (
                          <Badge className="bg-red-100 text-red-700">
                            {account.pendingRequests}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            account.isActive
                              ? 'bg-green-100 text-green-800 hover:bg-green-100'
                              : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          {account.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/admin/customers/${account.id}`)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-slate-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} accounts
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <Crown className="h-3 w-3 text-amber-500" /> = Primary POC
            </div>
            <div className="flex items-center gap-1">
              <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0">Pending</Badge> = POC not yet activated
            </div>
            <div className="flex items-center gap-1">
              <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0">N</Badge> = Pending requests
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
