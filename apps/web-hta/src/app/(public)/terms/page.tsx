import { Metadata } from 'next'
import Link from 'next/link'
import { BackLink } from '@/components/BackLink'

export const metadata: Metadata = {
  title: 'Terms of Service | HTA Calibration',
  description: 'Terms and conditions for using HTA Calibration',
}

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <BackLink />
        </div>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">
          Last updated: April 13, 2026
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using the HTA Calibration platform (&quot;Service&quot;), you agree to be
              bound by these Terms of Service. If you do not agree to these terms, you may
              not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              HTA Calibration is a calibration certificate management platform that enables
              organizations to create, manage, track, and distribute calibration certificates
              for measurement equipment. The Service includes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-2">
              <li>Certificate creation and management</li>
              <li>Digital signature and approval workflows</li>
              <li>Customer portal for certificate access</li>
              <li>Notification services for certificate expiration</li>
              <li>Document storage and retrieval</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">3. User Accounts</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">3.1 Account Creation</h3>
                <p className="text-muted-foreground leading-relaxed">
                  You must provide accurate and complete information when creating an account.
                  You are responsible for maintaining the confidentiality of your account
                  credentials.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">3.2 Account Security</h3>
                <p className="text-muted-foreground leading-relaxed">
                  You are responsible for all activities that occur under your account.
                  Notify us immediately if you suspect unauthorized access to your account.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">3.3 Account Types</h3>
                <p className="text-muted-foreground leading-relaxed">
                  The Service offers different account types (Staff, Customer) with varying
                  permissions. Your access level is determined by your organization&apos;s
                  administrator.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">4. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You agree not to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Upload malicious content or interfere with Service operations</li>
              <li>Create false or misleading calibration certificates</li>
              <li>Share account credentials with unauthorized individuals</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Use automated tools to access the Service without permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">5. Certificate Data</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">5.1 Data Ownership</h3>
                <p className="text-muted-foreground leading-relaxed">
                  You retain ownership of all certificate data you create or upload.
                  By using the Service, you grant us a license to store, process, and
                  display your data as necessary to provide the Service.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">5.2 Data Accuracy</h3>
                <p className="text-muted-foreground leading-relaxed">
                  You are responsible for the accuracy of all certificate data entered
                  into the system. We do not verify the technical accuracy of calibration
                  measurements.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">5.3 Data Retention</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Calibration certificates are retained for 7 years in accordance with
                  industry regulations, even after account deletion. See our{' '}
                  <Link href="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                  </Link>{' '}
                  for details.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">6. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service, including its design, features, and content (excluding user data),
              is owned by HTA Instrumentation Pvt. Ltd. and protected by intellectual
              property laws. You may not copy, modify, or distribute any part of the
              Service without our written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">7. Service Availability</h2>
            <p className="text-muted-foreground leading-relaxed">
              We strive to maintain high availability but do not guarantee uninterrupted
              access. The Service may be temporarily unavailable for maintenance, updates,
              or due to circumstances beyond our control. We will provide advance notice
              of planned maintenance when possible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, HTA INSTRUMENTATION PVT. LTD. SHALL
              NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY
              SHALL NOT EXCEED THE AMOUNT PAID BY YOU FOR THE SERVICE IN THE TWELVE MONTHS
              PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">9. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE, SECURE,
              OR CONTINUOUSLY AVAILABLE. WE DO NOT VERIFY THE ACCURACY OF CALIBRATION
              DATA ENTERED BY USERS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">10. Termination</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">10.1 By You</h3>
                <p className="text-muted-foreground leading-relaxed">
                  You may terminate your account at any time through your account settings
                  or by contacting us. Upon termination, your personal data will be deleted
                  in accordance with our Privacy Policy.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">10.2 By Us</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We may suspend or terminate your account if you violate these Terms,
                  fail to pay applicable fees, or for any other reason with 30 days notice.
                  We may terminate immediately for serious violations.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">11. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may modify these Terms at any time. We will notify you of material changes
              via email or through the Service. Continued use after changes constitutes
              acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">12. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by the laws of India. Any disputes shall be resolved
              in the courts of [Jurisdiction], India.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">13. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these Terms, please contact us:
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="font-medium">HTA Instrumentation Pvt. Ltd.</p>
              <p className="text-muted-foreground">Email: services@htaipl.com</p>
              <p className="text-muted-foreground">Address: # 73, Ramachandra Agrahara, Near T.R. Mills, Chamarajpet, Bangalore - 560 018 India</p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground">
            See also:{' '}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
