import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, getStatusLabel } from '../StatusBadge'

describe('StatusBadge', () => {
  describe('rendering', () => {
    it('renders DRAFT status correctly', () => {
      render(<StatusBadge status="DRAFT" />)
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    it('renders PENDING_REVIEW status correctly', () => {
      render(<StatusBadge status="PENDING_REVIEW" />)
      expect(screen.getByText('Pending Review')).toBeInTheDocument()
    })

    it('renders REVISION_REQUIRED status correctly', () => {
      render(<StatusBadge status="REVISION_REQUIRED" />)
      expect(screen.getByText('Revision Required')).toBeInTheDocument()
    })

    it('renders PENDING_CUSTOMER_APPROVAL status correctly', () => {
      render(<StatusBadge status="PENDING_CUSTOMER_APPROVAL" />)
      expect(screen.getByText('Pending Customer')).toBeInTheDocument()
    })

    it('renders CUSTOMER_REVISION_REQUIRED status correctly', () => {
      render(<StatusBadge status="CUSTOMER_REVISION_REQUIRED" />)
      expect(screen.getByText('Customer Revision')).toBeInTheDocument()
    })

    it('renders PENDING_ADMIN_AUTHORIZATION status correctly', () => {
      render(<StatusBadge status="PENDING_ADMIN_AUTHORIZATION" />)
      expect(screen.getByText('Pending Authorization')).toBeInTheDocument()
    })

    it('renders AUTHORIZED status correctly', () => {
      render(<StatusBadge status="AUTHORIZED" />)
      expect(screen.getByText('Authorized')).toBeInTheDocument()
    })

    it('renders APPROVED status correctly', () => {
      render(<StatusBadge status="APPROVED" />)
      expect(screen.getByText('Approved')).toBeInTheDocument()
    })

    it('renders REJECTED status correctly', () => {
      render(<StatusBadge status="REJECTED" />)
      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })

    it('renders unknown status as-is', () => {
      render(<StatusBadge status="UNKNOWN_STATUS" />)
      expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      render(<StatusBadge status="DRAFT" className="custom-class" />)
      const badge = screen.getByText('Draft')
      expect(badge).toHaveClass('custom-class')
    })

    it('applies base styles', () => {
      render(<StatusBadge status="DRAFT" />)
      const badge = screen.getByText('Draft')
      expect(badge).toHaveClass('inline-flex')
      expect(badge).toHaveClass('items-center')
      expect(badge).toHaveClass('rounded-full')
    })

    it('applies status-specific background color for DRAFT', () => {
      render(<StatusBadge status="DRAFT" />)
      const badge = screen.getByText('Draft')
      expect(badge).toHaveClass('bg-gray-100')
      expect(badge).toHaveClass('text-gray-700')
    })

    it('applies status-specific background color for APPROVED', () => {
      render(<StatusBadge status="APPROVED" />)
      const badge = screen.getByText('Approved')
      expect(badge).toHaveClass('bg-green-100')
      expect(badge).toHaveClass('text-green-800')
    })

    it('applies status-specific background color for REJECTED', () => {
      render(<StatusBadge status="REJECTED" />)
      const badge = screen.getByText('Rejected')
      expect(badge).toHaveClass('bg-red-100')
      expect(badge).toHaveClass('text-red-800')
    })

    it('applies default gray styling for unknown status', () => {
      render(<StatusBadge status="UNKNOWN" />)
      const badge = screen.getByText('UNKNOWN')
      expect(badge).toHaveClass('bg-gray-100')
      expect(badge).toHaveClass('text-gray-700')
    })
  })
})

describe('getStatusLabel', () => {
  it('returns correct label for known statuses', () => {
    expect(getStatusLabel('DRAFT')).toBe('Draft')
    expect(getStatusLabel('PENDING_REVIEW')).toBe('Pending Review')
    expect(getStatusLabel('REVISION_REQUIRED')).toBe('Revision Required')
    expect(getStatusLabel('PENDING_CUSTOMER_APPROVAL')).toBe('Pending Customer')
    expect(getStatusLabel('CUSTOMER_REVISION_REQUIRED')).toBe('Customer Revision')
    expect(getStatusLabel('PENDING_ADMIN_AUTHORIZATION')).toBe('Pending Authorization')
    expect(getStatusLabel('AUTHORIZED')).toBe('Authorized')
    expect(getStatusLabel('APPROVED')).toBe('Approved')
    expect(getStatusLabel('REJECTED')).toBe('Rejected')
  })

  it('returns status as-is for unknown statuses', () => {
    expect(getStatusLabel('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS')
    expect(getStatusLabel('CUSTOM')).toBe('CUSTOM')
  })
})
