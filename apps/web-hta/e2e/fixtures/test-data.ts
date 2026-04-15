/**
 * E2E Test Data
 *
 * Test user credentials and sample data for E2E tests.
 * Must match seeded data in prisma/seed.ts
 */

// Test user credentials (must match seeded data in prisma/seed.ts)
export const TEST_USERS = {
  engineer: {
    email: 'kiran@htaipl.com',
    password: 'engineer123',
    name: 'Kiran Kumar',
  },
  reviewer: {
    email: 'rajesh@htaipl.com',
    password: 'engineer123',
    name: 'Rajesh Sharma',
  },
  admin: {
    email: 'admin@htaipl.com',
    password: 'admin123',
    name: 'MASTER Admin',
  },
  customer: {
    email: 'customer@example.com',
    password: 'customer123',
    name: 'Test Customer',
    companyName: 'Test Company Pvt Ltd',
  },
}

// Test certificate data
export const TEST_CERTIFICATE = {
  customerName: 'Test Company Pvt Ltd',
  customerAddress: '123 Test Street, Bangalore',
  uucDescription: 'Digital Multimeter',
  uucMake: 'Fluke',
  uucModel: '87V',
  uucSerialNumber: 'TST-001',
}

// Status labels matching the application's StatusBadge component
export const STATUS_LABELS = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  REVISION_REQUIRED: 'Revision Required',
  PENDING_CUSTOMER_APPROVAL: 'Pending Customer',
  CUSTOMER_REVISION_REQUIRED: 'Customer Revision Required',
  APPROVED: 'Approved',
  PENDING_ADMIN_AUTHORIZATION: 'Pending Authorization',
  AUTHORIZED: 'Authorized',
  REJECTED: 'Rejected',
}
